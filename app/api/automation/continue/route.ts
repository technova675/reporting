import { after } from "next/server";
import { read } from "@/lib/db";
import { runJobNow } from "@/lib/automation/engine";
import { isAuthorizedCaller } from "@/lib/automation/secret";

// The phase started here runs inside after(), which shares this limit: 300s,
// the Vercel Hobby maximum.
export const maxDuration = 300;

/**
 * Starts the next phase of a job that split itself across invocations — an
 * audit's report, once its research is saved. The engine calls this on its own
 * deployment so each phase gets a fresh function time limit.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCaller(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { jobId?: unknown } | null;
  const jobId = typeof body?.jobId === "string" ? body.jobId : null;
  const db = await read();
  const job = jobId ? db.jobs.find((j) => j.id === jobId) : undefined;
  // Only a job already part-way through, so this cannot start new work.
  if (!job || job.status !== "queued" || !job.checkpoint) {
    return Response.json({ error: "No job waiting to continue." }, { status: 404 });
  }

  after(() => runJobNow(job.id).catch(() => undefined));
  return Response.json({ started: job.id }, { status: 202 });
}
