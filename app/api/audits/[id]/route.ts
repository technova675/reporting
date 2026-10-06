import { after } from "next/server";
import { now, read, write } from "@/lib/db";
import { enqueue, recoverStaleJobs, runJobNow } from "@/lib/automation/engine";

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
  if (audit.status === "running") {
    after(() => recoverStaleJobs().catch(() => undefined));
  }
  return Response.json({ audit });
}

/** Re-runs a failed or stale audit against the same inputs. */
export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/audits/[id]">,
) {
  const { id } = await ctx.params;

  const result = await write((db) => {
    const found = db.audits.find((a) => a.id === id);
    if (!found) return null;
    found.status = "queued";
    found.error = null;
    found.progressStep = 0;
    found.progressDetail = null;
    found.updatedAt = now();
    // Drop any job still waiting on or orphaned by this audit, or the stale
    // sweep picks it up and it runs a second time later.
    for (const stale of db.jobs) {
      if (
        stale.subjectId === found.id &&
        (stale.status === "queued" || stale.status === "running")
      ) {
        stale.status = "cancelled";
        stale.finishedAt = now();
      }
    }
    const job = enqueue(db, "run_audit", found.id, found.inputs.brand || found.inputs.website);
    return { audit: found, jobId: job.id };
  });

  if (!result) {
    return Response.json({ error: "Audit not found." }, { status: 404 });
  }
  after(() => runJobNow(result.jobId).catch(() => undefined));
  return Response.json({ audit: result.audit });
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
