import { now, read, write } from "@/lib/db";
import { hasApiKey } from "@/lib/anthropic";
import { hasPendingWork } from "@/lib/automation/engine";
import { computeStats } from "@/lib/stats";
import type { AutomationSettings } from "@/lib/types";

/** Snapshot the console polls: settings, queue state and the recent job log. */
export async function GET() {
  const db = await read();
  return Response.json({
    settings: db.settings,
    hasApiKey: hasApiKey(),
    pending: hasPendingWork(db),
    jobs: db.jobs.slice(0, 60),
    batches: db.batches.slice(0, 10),
    stats: computeStats(db),
  });
}

type SettingsPatch = Partial<
  Pick<
    AutomationSettings,
    "enabled" | "concurrency" | "tickIntervalSec" | "dailyLeadCap" | "model"
  >
> & { sequenceDelaysDays?: number[] };

export async function PATCH(request: Request) {
  let body: SettingsPatch;
  try {
    body = (await request.json()) as SettingsPatch;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const settings = await write((db) => {
    const s = db.settings;
    if (typeof body.enabled === "boolean") s.enabled = body.enabled;
    if (typeof body.concurrency === "number") {
      // Above ~4 the Anthropic rate limit becomes the bottleneck and jobs just
      // burn attempts on 429s.
      s.concurrency = clamp(Math.round(body.concurrency), 1, 4);
    }
    if (typeof body.tickIntervalSec === "number") {
      s.tickIntervalSec = clamp(Math.round(body.tickIntervalSec), 3, 300);
    }
    if (typeof body.dailyLeadCap === "number") {
      s.dailyLeadCap = clamp(Math.round(body.dailyLeadCap), 1, 500);
    }
    if (typeof body.model === "string" && body.model.trim()) {
      s.model = body.model.trim();
    }
    if (Array.isArray(body.sequenceDelaysDays) && body.sequenceDelaysDays.length === 3) {
      s.sequenceDelaysDays = body.sequenceDelaysDays.map((d) =>
        clamp(Math.round(d), 0, 60),
      ) as [number, number, number];
    }
    // autoSendEnabled is intentionally not patchable — nothing in this system
    // sends email or LinkedIn messages on its own. See docs/AUTOMATION.md.
    return s;
  });

  return Response.json({ settings });
}

/** Clears finished jobs so the run log stays readable. */
export async function DELETE() {
  const cleared = await write((db) => {
    const before = db.jobs.length;
    db.jobs = db.jobs.filter(
      (j) => j.status === "queued" || j.status === "running",
    );
    db.batches = db.batches.filter((b) =>
      b.jobIds.some((id) => db.jobs.some((j) => j.id === id)),
    );
    return before - db.jobs.length;
  });
  return Response.json({ cleared, at: now() });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
