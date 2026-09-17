import { FUNNEL_STAGES } from "./types";
import type { Db, Lead, LeadStage } from "./types";

/** Aggregates the dashboard reads. Pure functions over a store snapshot. */

export interface Stats {
  leads: {
    total: number;
    byStage: Record<LeadStage, number>;
    funnel: { stage: LeadStage; count: number }[];
    withHook: number;
    noHook: number;
    hookRate: number;
    dueToday: number;
    overdue: number;
  };
  audits: {
    total: number;
    complete: number;
    running: number;
    failed: number;
    averageScore: number | null;
    weakestCategory: { key: string; average: number } | null;
  };
  jobs: {
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    successRate: number | null;
    avgAttempts: number | null;
  };
  usage: {
    tokensIn: number;
    tokensOut: number;
    /** Rough USD at Opus 5 list rates; a sanity check, not an invoice. */
    estimatedCostUsd: number;
  };
}

const INPUT_USD_PER_TOKEN = 5 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 25 / 1_000_000;

export function computeStats(db: Db): Stats {
  const byStage = Object.fromEntries(
    (
      [
        "new",
        "researching",
        "drafted",
        "contacted",
        "follow_up",
        "replied",
        "interested",
        "meeting",
        "client",
        "lost",
        "failed",
      ] as LeadStage[]
    ).map((s) => [s, 0]),
  ) as Record<LeadStage, number>;

  for (const lead of db.leads) byStage[lead.stage] = (byStage[lead.stage] ?? 0) + 1;

  const researched = db.leads.filter((l) => l.research !== null);
  const withHook = researched.filter((l) => Boolean(l.research?.hook)).length;

  const startOfTomorrow = new Date();
  startOfTomorrow.setHours(24, 0, 0, 0);

  const completeAudits = db.audits.filter((a) => a.status === "complete");
  const scores = completeAudits
    .map((a) => a.overallScore)
    .filter((s): s is number => typeof s === "number");

  const finishedJobs = db.jobs.filter(
    (j) => j.status === "succeeded" || j.status === "failed",
  );

  return {
    leads: {
      total: db.leads.length,
      byStage,
      funnel: FUNNEL_STAGES.map((stage) => ({ stage, count: byStage[stage] ?? 0 })),
      withHook,
      noHook: researched.length - withHook,
      hookRate: researched.length ? withHook / researched.length : 0,
      dueToday: db.leads.filter((l) => isDueBefore(l, startOfTomorrow)).length,
      overdue: db.leads.filter((l) => isDueBefore(l, new Date())).length,
    },
    audits: {
      total: db.audits.length,
      complete: completeAudits.length,
      running: db.audits.filter((a) => a.status === "running" || a.status === "queued")
        .length,
      failed: db.audits.filter((a) => a.status === "failed").length,
      averageScore: scores.length ? Math.round(mean(scores)) : null,
      weakestCategory: weakestCategory(completeAudits),
    },
    jobs: {
      queued: db.jobs.filter((j) => j.status === "queued").length,
      running: db.jobs.filter((j) => j.status === "running").length,
      succeeded: db.jobs.filter((j) => j.status === "succeeded").length,
      failed: db.jobs.filter((j) => j.status === "failed").length,
      successRate: finishedJobs.length
        ? finishedJobs.filter((j) => j.status === "succeeded").length /
          finishedJobs.length
        : null,
      avgAttempts: finishedJobs.length
        ? Number(mean(finishedJobs.map((j) => j.attempts)).toFixed(2))
        : null,
    },
    usage: usage(db),
  };
}

function isDueBefore(lead: Lead, cutoff: Date): boolean {
  if (!lead.nextTouchAt) return false;
  if (!["contacted", "follow_up"].includes(lead.stage)) return false;
  return Date.parse(lead.nextTouchAt) < cutoff.getTime();
}

function usage(db: Db): Stats["usage"] {
  const tokensIn = db.audits.reduce((sum, a) => sum + (a.tokensIn ?? 0), 0);
  const tokensOut = db.audits.reduce((sum, a) => sum + (a.tokensOut ?? 0), 0);
  return {
    tokensIn,
    tokensOut,
    estimatedCostUsd: Number(
      (tokensIn * INPUT_USD_PER_TOKEN + tokensOut * OUTPUT_USD_PER_TOKEN).toFixed(2),
    ),
  };
}

function weakestCategory(audits: Db["audits"]): Stats["audits"]["weakestCategory"] {
  const totals = new Map<string, number[]>();
  for (const audit of audits) {
    for (const category of audit.categories) {
      const list = totals.get(category.key) ?? [];
      list.push(category.score);
      totals.set(category.key, list);
    }
  }
  let weakest: { key: string; average: number } | null = null;
  for (const [key, scores] of totals) {
    const average = mean(scores);
    if (!weakest || average < weakest.average) {
      weakest = { key, average: Math.round(average) };
    }
  }
  return weakest;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
