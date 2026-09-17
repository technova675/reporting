"use client";

import { useState } from "react";
import { useAutomation } from "@/components/AutomationProvider";
import {
  JobStatusTag,
  PageHeader,
  Stat,
  clockTime,
  isFuture,
  relativeTime,
} from "@/components/ui";
import type { Job } from "@/lib/types";

export default function AutomationPage() {
  const {
    settings,
    jobs,
    stats,
    hasApiKey,
    pending,
    loading,
    error,
    updateSettings,
    runTickNow,
    clearFinishedJobs,
  } = useAutomation();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !settings) {
    return <div className="text-[13px] text-muted">Loading…</div>;
  }

  const running = settings?.enabled ?? false;

  async function toggle() {
    setBusy(true);
    try {
      await updateSettings({ enabled: !running });
      if (!running) await runTickNow();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Automation"
        description="The worker that drains the queue. Every research pass and every audit runs here, with attempts, backoff and a log you can read after the fact."
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void runTickNow()}
              disabled={!running || !hasApiKey}
            >
              Run one pass
            </button>
            <button
              type="button"
              className={running ? "btn btn-ghost" : "btn btn-primary"}
              onClick={toggle}
              disabled={busy || !hasApiKey}
            >
              {running ? "Pause worker" : "Start worker"}
            </button>
          </>
        }
      />

      {!hasApiKey && (
        <div className="mb-5 rounded-lg bg-danger-soft px-4 py-3 text-[13px] text-danger">
          <b>No API key.</b> Add <code className="mono">ANTHROPIC_API_KEY</code>{" "}
          to <code className="mono">.env.local</code> and restart the dev server.
          The queue will hold everything until then.
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-lg bg-warn-soft px-4 py-3 text-[13px] text-warn">
          Lost contact with the server: {error}
        </div>
      )}

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Status"
          value={
            !running ? "Paused" : pending ? "Working" : "Idle"
          }
          tone={!running ? "neutral" : pending ? "accent" : "ok"}
          hint={running ? `polling every ${settings?.tickIntervalSec}s` : "queue held"}
        />
        <Stat label="Queued" value={stats?.jobs.queued ?? 0} />
        <Stat
          label="Failed"
          value={stats?.jobs.failed ?? 0}
          tone={stats?.jobs.failed ? "danger" : "neutral"}
          hint="after all retries"
        />
        <Stat
          label="Success rate"
          value={
            stats?.jobs.successRate === null || stats?.jobs.successRate === undefined
              ? "—"
              : `${Math.round(stats.jobs.successRate * 100)}%`
          }
          hint={
            stats?.jobs.avgAttempts
              ? `${stats.jobs.avgAttempts} attempts avg`
              : undefined
          }
        />
      </section>

      <section className="card mb-5 p-5">
        <h2 className="mb-3 text-[13px] font-semibold">Worker settings</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Slider
            label="Concurrency"
            value={settings?.concurrency ?? 2}
            min={1}
            max={4}
            hint="Jobs in flight per pass. Above 4 the API rate limit becomes the bottleneck."
            onChange={(v) => void updateSettings({ concurrency: v })}
          />
          <Slider
            label="Tick interval"
            value={settings?.tickIntervalSec ?? 5}
            min={3}
            max={60}
            suffix="s"
            hint="How often the console advances the queue while it is open."
            onChange={(v) => void updateSettings({ tickIntervalSec: v })}
          />
          <Slider
            label="Daily lead cap"
            value={settings?.dailyLeadCap ?? 40}
            min={5}
            max={200}
            step={5}
            hint="Ceiling on research jobs per day when running unattended."
            onChange={(v) => void updateSettings({ dailyLeadCap: v })}
          />
        </div>

        <div className="mt-4 rounded-md bg-surface-2 px-3 py-2.5 text-[12px] text-muted">
          <b className="text-ink">Sending is off, permanently.</b> The worker
          researches, drafts and schedules reminders. It never sends an email or
          a LinkedIn message — that needs your own mailbox connected, and
          automating LinkedIn outside their official API breaks their terms.
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-semibold">Run log</h2>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => void clearFinishedJobs()}
          >
            Clear finished
          </button>
        </div>

        {jobs.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-muted">
            Nothing has been queued yet.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {jobs.map((job) => (
              <li key={job.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
                  onClick={() =>
                    setExpanded((id) => (id === job.id ? null : job.id))
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">
                      {job.subjectLabel}
                    </div>
                    <div className="mono text-[11px] text-faint">
                      {job.kind.replace(/_/g, " ")} · attempt {job.attempts}/
                      {job.maxAttempts} ·{" "}
                      {relativeTime(
                        job.finishedAt ?? job.startedAt ?? job.createdAt,
                      )}
                    </div>
                  </div>
                  <JobStatusTag status={job.status} />
                </button>
                {expanded === job.id && <JobLog job={job} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function JobLog({ job }: { job: Job }) {
  return (
    <div className="border-t border-line bg-surface-2 px-4 py-3">
      <ul className="mono space-y-1 text-[11px]">
        {job.log.map((line, i) => (
          <li
            key={`${line.at}-${i}`}
            className={
              line.level === "error"
                ? "text-danger"
                : line.level === "warn"
                  ? "text-warn"
                  : "text-muted"
            }
          >
            <span className="text-faint">
              {clockTime(line.at)}{" "}
            </span>
            {line.message}
          </li>
        ))}
      </ul>
      {job.status === "queued" && isFuture(job.runAfter) && (
        <p className="mono mt-2 text-[11px] text-warn">
          Backing off — next attempt {relativeTime(job.runAfter)}.
        </p>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-faint">
          {label}
        </span>
        <span className="mono text-[13px] font-medium">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        className="mt-2 w-full accent-[var(--accent)]"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="mt-1 block text-[11px] text-muted">{hint}</span>
    </label>
  );
}
