import { read } from "@/lib/db";
import { hasPendingWork, tick } from "@/lib/automation/engine";
import { computeStats } from "@/lib/stats";

/**
 * Drives the queue forward by one pass.
 *
 * The console calls this on an interval while a batch is in flight. The same
 * endpoint is what a scheduler (Vercel cron, a plain curl in crontab) hits for
 * the unattended run — which is why it accepts an optional shared secret.
 */
export async function POST(request: Request) {
  const secret = process.env.ADBIBE_CRON_SECRET;
  if (secret) {
    const provided =
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      request.headers.get("x-cron-secret");
    if (provided !== secret) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }
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
