import { now, read, write } from "@/lib/db";
import { enqueue } from "@/lib/automation/engine";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/audits/[id]">,
) {
  const { id } = await ctx.params;
  const db = await read();
  const audit = db.audits.find((a) => a.id === id);
  if (!audit) {
    return Response.json({ error: "Audit not found." }, { status: 404 });
  }
  return Response.json({ audit });
}

/** Re-runs a failed or stale audit against the same inputs. */
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/audits/[id]">,
) {
  const { id } = await ctx.params;

  const audit = await write((db) => {
    const found = db.audits.find((a) => a.id === id);
    if (!found) return null;
    found.status = "queued";
    found.error = null;
    found.updatedAt = now();
    enqueue(db, "run_audit", found.id, found.inputs.brand || found.inputs.website);
    return found;
  });

  if (!audit) {
    return Response.json({ error: "Audit not found." }, { status: 404 });
  }
  return Response.json({ audit });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/audits/[id]">,
) {
  const { id } = await ctx.params;

  const removed = await write((db) => {
    const index = db.audits.findIndex((a) => a.id === id);
    if (index === -1) return false;
    db.audits.splice(index, 1);
    for (const job of db.jobs) {
      if (job.subjectId === id && job.status === "queued") {
        job.status = "cancelled";
        job.finishedAt = now();
      }
    }
    return true;
  });

  if (!removed) {
    return Response.json({ error: "Audit not found." }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
