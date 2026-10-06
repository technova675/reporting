import { read } from "@/lib/db";
import { hasPendingWork, tick } from "@/lib/automation/engine";
import { isAuthorizedCaller } from "@/lib/automation/secret";
import { computeStats } from "@/lib/stats";

// A tick can run an audit phase inside this request: 300s is the Vercel Hobby
// maximum, and each phase's budget in lib/services/audit.ts sits under it.
export const maxDuration = 300;

/**
 * Drives the queue forward by one pass.
 *
 * The console calls this on an interval while a batch is in flight. The same
 * endpoint is what a scheduler (Vercel cron, a plain curl in crontab) hits for
 * the unattended run — which is why it accepts an optional shared secret.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCaller(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await tick();
  const db = await read();

  return Response.json({
    ...result,
    pending: hasPendingWork(db),
    jobs: db.jobs.slice(0, 60),
    stats: computeStats(db),
  });
}

/** Convenience for schedulers that can only issue GETs. */
export async function GET(request: Request) {
  return POST(request);
}
