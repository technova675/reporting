import { now, read, write } from "@/lib/db";
import { nextRunFor, queueScan } from "@/lib/automation/engine";
import { parseCompetitors } from "@/lib/services/competitor";
import { WATCH_CADENCES } from "@/lib/types";
import type { WatchCadence } from "@/lib/types";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/watches/[id]">,
) {
  const { id } = await ctx.params;
  const db = await read();

  const watch = db.watches.find((w) => w.id === id);
  if (!watch) {
    return Response.json({ error: "Watch not found." }, { status: 404 });
  }

  return Response.json({
    watch,
    scans: db.scans.filter((s) => s.watchId === id),
  });
}

interface PatchBody {
  enabled?: boolean;
  cadence?: string;
  competitors?: string;
  label?: string;
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/watches/[id]">,
) {
  const { id } = await ctx.params;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const watch = await write((db) => {
    const found = db.watches.find((w) => w.id === id);
    if (!found) return null;

    if (typeof body.enabled === "boolean") {
      found.enabled = body.enabled;
      // Re-enabling should not fire a scan instantly for a watch that has been
      // paused for a month; put it back on its normal cadence.
      found.nextRunAt = body.enabled ? nextRunFor(found) : null;
    }

    if (body.cadence && (WATCH_CADENCES as readonly string[]).includes(body.cadence)) {
      found.cadence = body.cadence as WatchCadence;
      found.nextRunAt = found.enabled ? nextRunFor(found) : null;
    }

    if (typeof body.competitors === "string") {
      const parsed = parseCompetitors(body.competitors);
      if (parsed.length > 0) found.competitors = parsed;
    }

    if (body.label?.trim()) found.label = body.label.trim();

    found.updatedAt = now();
    return found;
  });

  if (!watch) {
    return Response.json({ error: "Watch not found." }, { status: 404 });
  }
  return Response.json({ watch });
}

/** Scan now, outside the cadence. */
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/watches/[id]">,
) {
  const { id } = await ctx.params;

  const result = await write((db) => {
    const watch = db.watches.find((w) => w.id === id);
    if (!watch) return { error: "not_found" as const };

    const pending = db.scans.some(
      (s) =>
        s.watchId === id && (s.status === "queued" || s.status === "running"),
    );
    if (pending) return { error: "already_running" as const };

    return { scan: queueScan(db, watch) };
  });

  if (result.error === "not_found") {
    return Response.json({ error: "Watch not found." }, { status: 404 });
  }
  if (result.error === "already_running") {
    return Response.json(
      { error: "A scan for this watch is already in flight." },
      { status: 409 },
    );
  }
  return Response.json({ scan: result.scan }, { status: 201 });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/watches/[id]">,
) {
  const { id } = await ctx.params;

  const removed = await write((db) => {
    const index = db.watches.findIndex((w) => w.id === id);
    if (index === -1) return false;

    const scanIds = new Set(
      db.scans.filter((s) => s.watchId === id).map((s) => s.id),
    );
    db.watches.splice(index, 1);
    db.scans = db.scans.filter((s) => s.watchId !== id);
    for (const job of db.jobs) {
      if (scanIds.has(job.subjectId) && job.status === "queued") {
        job.status = "cancelled";
        job.finishedAt = now();
      }
    }
    return true;
  });

  if (!removed) {
    return Response.json({ error: "Watch not found." }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
