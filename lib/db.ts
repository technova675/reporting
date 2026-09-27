import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DEFAULT_MODEL } from "./llm";
import type { AutomationSettings, Db } from "./types";

/**
 * The store.
 *
 * The whole dataset is one JSON document of a few hundred KB, read and written
 * through `read()` and `write(fn)`. It lives in one of two places:
 *
 *   - Supabase, when NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
 *     set: a single row in `adbibe_store` (see supabase/migrations). Writes use
 *     a version column as an optimistic lock, so several server instances — a
 *     hosted deploy — cannot overwrite each other.
 *   - Otherwise a local file, ./data/adbibe.json, written temp-then-rename so a
 *     crash can't leave a half-written file behind.
 *
 * Either way every write in this process goes through a promise chain, one
 * writer at a time.
 */

const DATA_DIR = process.env.ADBIBE_DATA_DIR
  ? path.resolve(process.env.ADBIBE_DATA_DIR)
  : path.join(process.cwd(), "data");

const DB_PATH = path.join(DATA_DIR, "adbibe.json");

export const DEFAULT_SETTINGS: AutomationSettings = {
  enabled: false,
  concurrency: 2,
  tickIntervalSec: 5,
  sequenceDelaysDays: [0, 3, 7],
  autoSendEnabled: false,
  dailyLeadCap: 40,
  model: DEFAULT_MODEL,
};

function emptyDb(): Db {
  return {
    version: 4,
    leads: [],
    audits: [],
    watches: [],
    scans: [],
    jobs: [],
    batches: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Fills in anything an older store is missing. */
function normalize(parsed: Partial<Db>): Db {
  const db: Db = {
    ...emptyDb(),
    ...parsed,
    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
  };
  // Stores created before the switch to open models still name a Claude
  // model, which no OpenAI-compatible endpoint will accept.
  if (db.settings.model.startsWith("claude-")) {
    db.settings.model = DEFAULT_MODEL;
  }
  return db;
}

/**
 * The cache and write queue live on globalThis, not in module scope. Next
 * bundles pages and route handlers separately, so a module-level `let` gives
 * each bundle its own copy: a page would keep serving a snapshot from before a
 * route handler wrote, and two copies could overwrite each other's writes.
 */
const shared = globalThis as typeof globalThis & {
  __adbibeDb?: {
    /** File backend only. Supabase is re-read every time, since other instances write to it too. */
    cache: Db | null;
    /** Serializes every read-modify-write so two requests can't clobber each other. */
    queue: Promise<unknown>;
  };
};
const state = (shared.__adbibeDb ??= { cache: null, queue: Promise.resolve() });

/* ------------------------------------------------------------------ */
/* Local file                                                          */
/* ------------------------------------------------------------------ */

async function readLocalFile(): Promise<Db | null> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    return normalize(JSON.parse(raw) as Partial<Db>);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    // A corrupt file should be loud, not silently replaced.
    if (err instanceof SyntaxError) {
      throw new Error(`Store at ${DB_PATH} is not valid JSON: ${err.message}`);
    }
    throw err;
  }
}

async function loadFile(): Promise<Db> {
  if (state.cache) return state.cache;
  let cache = await readLocalFile();
  if (!cache) {
    cache = emptyDb();
    await persistFile(cache);
  }
  state.cache = cache;
  return cache;
}

async function persistFile(db: Db): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DB_PATH);
}

/* ------------------------------------------------------------------ */
/* Supabase                                                            */
/* ------------------------------------------------------------------ */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const TABLE = "adbibe_store";
const ROW_ID = "main";
/** Attempts before a write gives up on a version conflict. */
const MAX_WRITE_ATTEMPTS = 5;

export const storeBackend: "supabase" | "file" =
  SUPABASE_URL && SUPABASE_KEY ? "supabase" : "file";

interface StoreRow {
  data: Partial<Db>;
  version: number;
}

async function supabase(
  query: string,
  init: RequestInit & { prefer?: string } = {},
): Promise<Response> {
  const { prefer, headers, ...rest } = init;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?${query}`, {
    ...rest,
    cache: "no-store",
    headers: {
      apikey: SUPABASE_KEY!,
      // Legacy service-role keys are JWTs and go in Authorization too; the
      // newer sb_secret_ keys are accepted from `apikey` alone.
      ...(SUPABASE_KEY!.startsWith("sb_") ? {} : { Authorization: `Bearer ${SUPABASE_KEY}` }),
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    if (body.includes("PGRST205")) {
      throw new Error(
        `Supabase table "${TABLE}" does not exist. Run supabase/migrations/0001_adbibe_store.sql in the Supabase SQL editor.`,
      );
    }
    throw new Error(`Supabase ${res.status}: ${body.slice(0, 300)}`);
  }
  return res;
}

async function fetchRow(): Promise<StoreRow | null> {
  const res = await supabase(`id=eq.${ROW_ID}&select=data,version`);
  const rows = (await res.json()) as StoreRow[];
  return rows[0] ?? null;
}

/**
 * The first read against an empty table creates the row, importing the local
 * file when there is one so moving to Supabase keeps existing data.
 */
async function loadRow(): Promise<StoreRow> {
  const existing = await fetchRow();
  if (existing) return existing;

  const initial = (await readLocalFile()) ?? emptyDb();
  // Ignore-duplicates: if another instance created the row first, keep theirs.
  await supabase("on_conflict=id", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: JSON.stringify({ id: ROW_ID, data: initial, version: 0 }),
  });
  const created = await fetchRow();
  if (!created) throw new Error("Supabase store row could not be created.");
  return created;
}

/** Saves only if nobody else wrote since `version` was read. */
async function compareAndSwap(db: Db, version: number): Promise<boolean> {
  const res = await supabase(`id=eq.${ROW_ID}&version=eq.${version}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({
      data: db,
      version: version + 1,
      updated_at: new Date().toISOString(),
    }),
  });
  const rows = (await res.json()) as unknown[];
  return rows.length === 1;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Read-only snapshot. Callers must not mutate the result. */
export async function read(): Promise<Db> {
  if (storeBackend === "supabase") return normalize((await loadRow()).data);
  return loadFile();
}

/**
 * Runs `fn` against the store with exclusive access and persists whatever it
 * leaves behind. Return a value from `fn` to get it back out.
 *
 * On Supabase, `fn` is re-run against fresh data if another instance wrote in
 * the meantime, so it must not have side effects outside `db`.
 */
export async function write<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const run = state.queue.then(async () => {
    if (storeBackend === "file") {
      const db = await loadFile();
      const result = await fn(db);
      await persistFile(db);
      return result;
    }

    for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
      const row = await loadRow();
      const db = normalize(row.data);
      const result = await fn(db);
      if (await compareAndSwap(db, row.version)) return result;
    }
    throw new Error("Store is busy — another instance kept writing. Try again.");
  });
  // Keep the chain alive even if this caller's work threw.
  state.queue = run.catch(() => undefined);
  return run;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

export function now(): string {
  return new Date().toISOString();
}

/** Test/seed helper — drops the in-memory cache so the next read hits disk. */
export function resetCache(): void {
  state.cache = null;
}

export { DB_PATH, DATA_DIR };
