import { newId, now, read, write } from "../db";
import { hasApiKey } from "../anthropic";
import { runAudit } from "../services/audit";
import { researchLead } from "../services/prospect";
import { runScan } from "../services/competitor";
import { CADENCE_DAYS } from "../types";
import type { Db, Job, JobKind, JobLogLine, Lead, Scan, Watch } from "../types";

/**
 * The automation engine.
 *
 * A job queue with attempts, exponential backoff and a per-job log, driven by
 * `tick()`. Ticks come from two places: the console polls while a batch is in
 * flight, and `/api/automation/tick` can be hit by a scheduler for the
 * unattended overnight run. Both paths are safe to call concurrently — a job is
 * claimed inside the store's write lock, so only one tick can own it.
 */

const BASE_BACKOFF_MS = 15_000;
const MAX_BACKOFF_MS = 10 * 60_000;
/** A research pass that has not reported back in this long is assumed dead. */
const STALE_AFTER_MS = 15 * 60_000;

/** Guards against a second tick starting while one is still working. */
let inFlight = false;

export interface TickResult {
  ran: number;
  succeeded: number;
  failed: number;
  retried: number;
  skipped: string | null;
}

export function enqueue(
  db: Db,
  kind: JobKind,
  subjectId: string,
  subjectLabel: string,
  batchId: string | null = null,
): Job {
  const job: Job = {
    id: newId("job"),
    kind,
    status: "queued",
    subjectId,
    subjectLabel,
    createdAt: now(),
    startedAt: null,
    finishedAt: null,
    attempts: 0,
    maxAttempts: 3,
    runAfter: now(),
    error: null,
    log: [logLine("info", `Queued ${kind} for ${subjectLabel}.`)],
    batchId,
  };
  db.jobs.unshift(job);
  return job;
}

function logLine(level: JobLogLine["level"], message: string): JobLogLine {
  return { at: now(), level, message };
}

function appendLog(
  db: Db,
  jobId: string,
  level: JobLogLine["level"],
  message: string,
) {
  const job = db.jobs.find((j) => j.id === jobId);
  if (!job) return;
  job.log.push(logLine(level, message));
  // A job's log is a debugging aid, not an archive.
  if (job.log.length > 40) job.log = job.log.slice(-40);
}

/**
 * Runs one pass of the queue. Returns what it did so the caller can decide
 * whether to schedule another pass.
 */
export async function tick(): Promise<TickResult> {
  const empty: TickResult = {
    ran: 0,
    succeeded: 0,
    failed: 0,
    retried: 0,
    skipped: null,
  };

  if (inFlight) return { ...empty, skipped: "A tick is already running." };

  const db = await read();
  if (!db.settings.enabled) {
    return { ...empty, skipped: "Automation is paused." };
  }
  if (!hasApiKey()) {
    return { ...empty, skipped: "ANTHROPIC_API_KEY is not set." };
  }

  inFlight = true;
  try {
    // Standing watches become jobs here, so a scheduler hitting /tick is all
    // the recurring infrastructure this needs.
    await scheduleDueWatches();

    const claimed = await claimJobs(db.settings.concurrency);
    if (claimed.length === 0) return empty;

    const outcomes = await Promise.all(claimed.map((job) => execute(job)));

    return {
      ran: outcomes.length,
      succeeded: outcomes.filter((o) => o === "succeeded").length,
      failed: outcomes.filter((o) => o === "failed").length,
      retried: outcomes.filter((o) => o === "retry").length,
      skipped: null,
    };
  } finally {
    inFlight = false;
  }
}

/**
 * Atomically moves up to `limit` due jobs into `running` and returns them.
 *
 * Also sweeps jobs left `running` by a process that died mid-flight — without
 * this they would sit there forever, since nothing else ever moves them.
 */
function claimJobs(limit: number): Promise<Job[]> {
  return write((db) => {
    const at = Date.now();

    for (const job of db.jobs) {
      if (job.status !== "running") continue;
      const startedAt = job.startedAt ? Date.parse(job.startedAt) : at;
      if (at - startedAt < STALE_AFTER_MS) continue;

      // The attempt was already counted when it was claimed, so this either
      // retries or exhausts the job exactly as a thrown error would.
      if (job.attempts < job.maxAttempts) {
        job.status = "queued";
        job.runAfter = now();
        job.log.push(
          logLine("warn", "Previous attempt never finished — re-queued."),
        );
      } else {
        job.status = "failed";
        job.finishedAt = now();
        job.error = "Interrupted and out of attempts.";
        job.log.push(logLine("error", "Interrupted and out of attempts."));
      }
    }

    const due = db.jobs
      .filter((j) => j.status === "queued" && Date.parse(j.runAfter) <= at)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .slice(0, Math.max(1, limit));

    for (const job of due) {
      job.status = "running";
      job.startedAt = now();
      job.attempts += 1;
      job.log.push(
        logLine("info", `Attempt ${job.attempts} of ${job.maxAttempts} started.`),
      );
    }
    // Deep copy so the worker cannot mutate store state outside the lock.
    return JSON.parse(JSON.stringify(due)) as Job[];
  });
}

type Outcome = "succeeded" | "failed" | "retry";

async function execute(job: Job): Promise<Outcome> {
  try {
    switch (job.kind) {
      case "research_lead":
        await handleResearchLead(job);
        break;
      case "run_audit":
        await handleRunAudit(job);
        break;
      case "advance_sequence":
        await handleAdvanceSequence(job);
        break;
      case "scan_competitors":
        await handleScanCompetitors(job);
        break;
    }
    await write((db) => {
      const j = db.jobs.find((x) => x.id === job.id);
      if (!j) return;
      j.status = "succeeded";
      j.finishedAt = now();
      j.error = null;
      appendLog(db, job.id, "info", "Completed.");
    });
    return "succeeded";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failJob(job, message);
  }
}

async function failJob(job: Job, message: string): Promise<Outcome> {
  return write((db) => {
    const j = db.jobs.find((x) => x.id === job.id);
    if (!j) return "failed" as Outcome;

    const canRetry = j.attempts < j.maxAttempts;
    if (canRetry) {
      const delay = Math.min(
        BASE_BACKOFF_MS * 2 ** (j.attempts - 1),
        MAX_BACKOFF_MS,
      );
      j.status = "queued";
      j.runAfter = new Date(Date.now() + delay).toISOString();
      j.error = message;
      appendLog(
        db,
        job.id,
        "warn",
        `${message} Retrying in ${Math.round(delay / 1000)}s.`,
      );
      return "retry" as Outcome;
    }

    j.status = "failed";
    j.finishedAt = now();
    j.error = message;
    appendLog(
      db,
      job.id,
      "error",
      `Giving up after ${j.attempts} attempts: ${message}`,
    );

    // Surface the failure on the record the operator actually looks at.
    const lead = db.leads.find((l) => l.id === j.subjectId);
    if (lead) {
      lead.stage = "failed";
      lead.error = message;
      lead.updatedAt = now();
      lead.events.push({ at: now(), type: "research_failed", detail: message });
    }
    const audit = db.audits.find((a) => a.id === j.subjectId);
    if (audit) {
      audit.status = "failed";
      audit.error = message;
      audit.updatedAt = now();
    }
    const scan = db.scans.find((x) => x.id === j.subjectId);
    if (scan) {
      scan.status = "failed";
      scan.error = message;
      scan.updatedAt = now();
      const watch = db.watches.find((w) => w.id === scan.watchId);
      if (watch) {
        watch.error = message;
        watch.updatedAt = now();
        // Do not leave a failed watch stuck: put it back on its cadence so the
        // next scheduled run retries from a clean slate.
        watch.nextRunAt = nextRunFor(watch);
      }
    }
    return "failed" as Outcome;
  });
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

async function handleResearchLead(job: Job): Promise<void> {
  const { lead, model } = await write((db) => {
    const found = db.leads.find((l) => l.id === job.subjectId);
    if (!found) throw new Error(`Lead ${job.subjectId} no longer exists.`);
    found.stage = "researching";
    found.error = null;
    found.updatedAt = now();
    found.events.push({ at: now(), type: "research_started" });
    appendLog(db, job.id, "info", `Researching ${found.company || found.name}.`);
    return {
      lead: JSON.parse(JSON.stringify(found)) as Lead,
      model: db.settings.model,
    };
  });

  const output = await researchLead(lead, model);

  await write((db) => {
    const found = db.leads.find((l) => l.id === job.subjectId);
    if (!found) return;
    found.research = output.research;
    found.drafts = output.drafts;
    found.updatedAt = now();
    if (output.foundHook) {
      found.stage = "drafted";
      found.events.push({
        at: now(),
        type: "research_complete",
        detail: `Hook: ${output.research.hook}`,
      });
      appendLog(
        db,
        job.id,
        "info",
        `Hook found — recommending ${output.research.service}.`,
      );
    } else {
      // Park it rather than promote it: there is nothing worth sending.
      found.stage = "new";
      found.events.push({
        at: now(),
        type: "research_complete",
        detail: "No specific hook found; no drafts written.",
      });
      appendLog(
        db,
        job.id,
        "warn",
        "No hook cleared the bar — left undrafted for manual review.",
      );
    }
  });
}

async function handleRunAudit(job: Job): Promise<void> {
  const { inputs, model } = await write((db) => {
    const audit = db.audits.find((a) => a.id === job.subjectId);
    if (!audit) throw new Error(`Audit ${job.subjectId} no longer exists.`);
    audit.status = "running";
    audit.error = null;
    audit.updatedAt = now();
    appendLog(db, job.id, "info", `Auditing ${audit.inputs.website}.`);
    return {
      inputs: { ...audit.inputs },
      model: db.settings.model,
    };
  });

  const output = await runAudit(inputs, model);

  await write((db) => {
    const audit = db.audits.find((a) => a.id === job.subjectId);
    if (!audit) return;
    audit.status = "complete";
    audit.brandName = output.brandName;
    audit.overallScore = output.overallScore;
    audit.categories = output.categories;
    audit.topPriorities = output.topPriorities;
    audit.executiveSummary = output.executiveSummary;
    audit.tokensIn = output.tokensIn;
    audit.tokensOut = output.tokensOut;
    audit.durationMs = output.durationMs;
    audit.updatedAt = now();
    appendLog(db, job.id, "info", `Scored ${output.overallScore}/100.`);
  });
}

/**
 * Sequence steps are reminders, never sends. The engine moves a lead into the
 * next touch and sets the due date; a human still presses send.
 */
async function handleAdvanceSequence(job: Job): Promise<void> {
  await write((db) => {
    const lead = db.leads.find((l) => l.id === job.subjectId);
    if (!lead) throw new Error(`Lead ${job.subjectId} no longer exists.`);
    if (lead.sequenceStep >= 2) {
      appendLog(db, job.id, "info", "Sequence already complete — nothing to do.");
      return;
    }
    const from = lead.stage;
    lead.sequenceStep += 1;
    lead.stage = "follow_up";
    lead.nextTouchAt = nextTouchDate(db, lead.sequenceStep);
    lead.updatedAt = now();
    lead.events.push({
      at: now(),
      type: "stage_change",
      from,
      to: "follow_up",
      detail: `Follow-up ${lead.sequenceStep} is due.`,
    });
    appendLog(db, job.id, "info", `Follow-up ${lead.sequenceStep} marked due.`);
  });
}

export function nextTouchDate(db: Db, step: number): string | null {
  const days = db.settings.sequenceDelaysDays[step];
  if (days === undefined) return null;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/** True when there is work the worker could pick up right now or soon. */
export function hasPendingWork(db: Db): boolean {
  return db.jobs.some((j) => j.status === "queued" || j.status === "running");
}

/**
 * Creates a scan job for every enabled watch that is due.
 *
 * Idempotent: a watch with a scan already queued or running is skipped, so
 * several ticks landing at once cannot double-scan and double-bill.
 */
export async function scheduleDueWatches(): Promise<number> {
  return write((db) => {
    const at = Date.now();
    let created = 0;

    for (const watch of db.watches) {
      if (!watch.enabled) continue;
      if (watch.cadence === "manual") continue;
      if (!watch.nextRunAt || Date.parse(watch.nextRunAt) > at) continue;

      const alreadyPending = db.jobs.some(
        (j) =>
          j.kind === "scan_competitors" &&
          (j.status === "queued" || j.status === "running") &&
          db.scans.some((s) => s.id === j.subjectId && s.watchId === watch.id),
      );
      if (alreadyPending) continue;

      queueScan(db, watch);
      created += 1;
    }

    return created;
  });
}

/** Creates the Scan record and its job. Shared by the scheduler and "scan now". */
export function queueScan(db: Db, watch: Watch): Scan {
  const previous = latestCompleteScan(db, watch.id);

  const scan: Scan = {
    id: newId("scan"),
    watchId: watch.id,
    createdAt: now(),
    updatedAt: now(),
    status: "queued",
    isBaseline: previous === null,
    signals: [],
    summary: null,
    sources: [],
    error: null,
    tokensIn: 0,
    tokensOut: 0,
    durationMs: 0,
  };
  db.scans.unshift(scan);

  watch.nextRunAt = nextRunFor(watch);
  watch.updatedAt = now();
  enqueue(db, "scan_competitors", scan.id, watch.label);

  return scan;
}

export function latestCompleteScan(db: Db, watchId: string): Scan | null {
  return (
    db.scans.find((s) => s.watchId === watchId && s.status === "complete") ??
    null
  );
}

export function nextRunFor(watch: Watch): string | null {
  const days = CADENCE_DAYS[watch.cadence];
  if (days === null) return null;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

async function handleScanCompetitors(job: Job): Promise<void> {
  const { watch, previous, model } = await write((db) => {
    const scan = db.scans.find((s) => s.id === job.subjectId);
    if (!scan) throw new Error(`Scan ${job.subjectId} no longer exists.`);

    const found = db.watches.find((w) => w.id === scan.watchId);
    if (!found) throw new Error(`Watch ${scan.watchId} no longer exists.`);

    scan.status = "running";
    scan.error = null;
    scan.updatedAt = now();
    appendLog(
      db,
      job.id,
      "info",
      `Scanning ${found.competitors.length} competitor${
        found.competitors.length === 1 ? "" : "s"
      } for ${found.clientName}.`,
    );

    // The baseline is the last *complete* scan other than this one.
    const prior =
      db.scans.find(
        (s) =>
          s.watchId === found.id && s.status === "complete" && s.id !== scan.id,
      ) ?? null;

    return {
      watch: JSON.parse(JSON.stringify(found)) as Watch,
      previous: prior ? (JSON.parse(JSON.stringify(prior)) as Scan) : null,
      model: db.settings.model,
    };
  });

  const output = await runScan(watch, previous, model);

  await write((db) => {
    const scan = db.scans.find((s) => s.id === job.subjectId);
    if (!scan) return;

    scan.status = "complete";
    scan.signals = output.signals;
    scan.summary = output.summary;
    scan.sources = output.sources;
    scan.tokensIn = output.tokensIn;
    scan.tokensOut = output.tokensOut;
    scan.durationMs = output.durationMs;
    scan.updatedAt = now();

    const found = db.watches.find((w) => w.id === scan.watchId);
    if (found) {
      found.lastRunAt = now();
      found.lastScanId = scan.id;
      found.scanCount += 1;
      found.error = null;
      found.updatedAt = now();
      // Cadence runs from completion, not from when the job was queued. Without
      // this, a watch the scheduler skipped (because a scan was already in
      // flight) keeps a past due-date and re-scans the moment this one lands.
      found.nextRunAt = found.enabled ? nextRunFor(found) : null;
    }

    const changes = output.signals.filter((s) => s.isChange).length;
    appendLog(
      db,
      job.id,
      "info",
      changes === 0
        ? `Quiet run — ${output.signals.length} signals, nothing changed.`
        : `${changes} change${changes === 1 ? "" : "s"} detected across ${output.signals.length} signals.`,
    );
  });
}
