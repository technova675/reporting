import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AutomationSettings, Db } from "./types";

/**
 * A small JSON-file store.
 *
 * Deliberately not a database: the console is single-operator and the whole
 * dataset is a few hundred KB. What it does need is to survive concurrent
 * route handlers, so every write goes through a promise chain (one writer at a
 * time) and lands via write-temp-then-rename so a crash can't leave a half
 * written file behind.
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
  model: "claude-opus-5",
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

let cache: Db | null = null;
/** Serializes every read-modify-write so two requests can't clobber each other. */
let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<Db> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Db>;
    cache = {
      ...emptyDb(),
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      // A corrupt file should be loud, not silently replaced.
      if (err instanceof SyntaxError) {
        throw new Error(`Store at ${DB_PATH} is not valid JSON: ${err.message}`);
      }
      throw err;
    }
    cache = emptyDb();
    await persist(cache);
  }
  return cache;
}

async function persist(db: Db): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DB_PATH);
}

/** Read-only snapshot. Callers must not mutate the result. */
export async function read(): Promise<Db> {
  const db = await load();
  return db;
}

/**
 * Runs `fn` against the store with exclusive access and persists whatever it
 * leaves behind. Return a value from `fn` to get it back out.
 */
export async function write<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await load();
    const result = await fn(db);
    await persist(db);
    return result;
  });
  // Keep the chain alive even if this caller's work threw.
  queue = run.catch(() => undefined);
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
  cache = null;
}

export { DB_PATH, DATA_DIR };
