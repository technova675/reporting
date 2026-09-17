"use client";

import Link from "next/link";
import { useAutomation } from "@/components/AutomationProvider";
import {
  EmptyState,
  JobStatusTag,
  PageHeader,
  Stat,
  relativeTime,
  stageLabel,
} from "@/components/ui";
import { AUDIT_CATEGORIES } from "@/lib/types";

export default function OverviewPage() {
  const { stats, jobs, loading, hasApiKey, settings } = useAutomation();

  if (loading && !stats) {
    return <div className="text-[13px] text-muted">Loading console…</div>;
  }
  if (!stats) {
    return (
      <EmptyState title="Console unavailable">
        The server did not return a snapshot. Check that the dev server is
        running and reload.
      </EmptyState>
    );
  }

  const { leads, audits, watches, jobs: jobStats, usage } = stats;
  const funnelMax = Math.max(1, ...leads.funnel.map((f) => f.count));
  const weakest = audits.weakestCategory
    ? AUDIT_CATEGORIES.find((c) => c.key === audits.weakestCategory?.key)?.label
    : null;

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Where every lead and every audit currently sits, and what the worker has been doing."
        actions={
          <>
            <Link href="/admin/leads" className="btn btn-ghost">
              Import leads
            </Link>
            <Link href="/admin/audits" className="btn btn-primary">
              Run an audit
            </Link>
          </>
        }
      />

      {!hasApiKey && (
        <div className="mb-6 rounded-lg border border-line bg-danger-soft px-4 py-3 text-[13px] text-danger">
          <b>ANTHROPIC_API_KEY is not set.</b> Leads and audits can be imported
          and managed, but no research will run until the key is in{" "}
          <code className="mono">.env.local</code>.
        </div>
      )}

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="Leads"
          value={leads.total}
          hint={`${leads.byStage.drafted} drafted and waiting on you`}
        />
        <Stat
          label="Hook rate"
          value={`${Math.round(leads.hookRate * 100)}%`}
          hint={`${leads.noHook} researched with no usable hook`}
          tone={leads.hookRate >= 0.6 ? "ok" : leads.hookRate ? "warn" : "neutral"}
        />
        <Stat
          label="Audits"
          value={audits.complete}
          hint={
            audits.averageScore !== null
              ? `average score ${audits.averageScore}/100`
              : "none completed yet"
          }
        />
        <Stat
          label="Competitor moves"
          value={watches.openChanges}
          tone={watches.urgentChanges ? "danger" : "neutral"}
          hint={
            watches.total === 0
              ? "no watches yet"
              : watches.urgentChanges
                ? `${watches.urgentChanges} need a response`
                : `${watches.active} watch${watches.active === 1 ? "" : "es"} active`
          }
        />
        <Stat
          label="Est. API spend"
          value={`$${usage.estimatedCostUsd.toFixed(2)}`}
          hint="Opus 5 list rates, audits and scans"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-3">
          <h2 className="text-[13px] font-semibold">Outbound funnel</h2>
          <p className="mt-0.5 text-[12px] text-muted">
            Counts start at Contacted. New, researching and drafted leads sit
            before the funnel because nothing has been sent yet.
          </p>
          <ul className="mt-4 space-y-2.5">
            {leads.funnel.map(({ stage, count }) => (
              <li key={stage} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[12px] text-muted">
                  {stageLabel(stage)}
                </span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-surface-2">
                  <div
                    className="h-full rounded bg-accent"
                    style={{ width: `${(count / funnelMax) * 100}%` }}
                  />
                </div>
                <span className="mono w-8 shrink-0 text-right text-[12px] font-medium">
                  {count}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-[12px]">
            <div>
              <div className="text-faint">Pre-funnel</div>
              <div className="mono mt-0.5 text-[15px] font-semibold">
                {leads.byStage.new +
                  leads.byStage.researching +
                  leads.byStage.drafted}
              </div>
            </div>
            <div>
              <div className="text-faint">Touch due today</div>
              <div className="mono mt-0.5 text-[15px] font-semibold">
                {leads.dueToday}
              </div>
            </div>
            <div>
              <div className="text-faint">Overdue</div>
              <div
                className={`mono mt-0.5 text-[15px] font-semibold ${
                  leads.overdue ? "text-warn" : ""
                }`}
              >
                {leads.overdue}
              </div>
            </div>
          </div>
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="text-[13px] font-semibold">Worker health</h2>
          <dl className="mt-4 space-y-3 text-[13px]">
            <Row
              label="Mode"
              value={settings?.enabled ? "Running" : "Paused"}
            />
            <Row
              label="Success rate"
              value={
                jobStats.successRate === null
                  ? "—"
                  : `${Math.round(jobStats.successRate * 100)}%`
              }
            />
            <Row
              label="Avg attempts"
              value={jobStats.avgAttempts === null ? "—" : jobStats.avgAttempts}
            />
            <Row label="Failed jobs" value={jobStats.failed} />
            <Row
              label="Weakest audit surface"
              value={
                weakest
                  ? `${weakest} (${audits.weakestCategory?.average})`
                  : "—"
              }
            />
          </dl>
          <Link
            href="/admin/automation"
            className="btn btn-ghost btn-sm mt-4 w-full"
          >
            Open the run log
          </Link>
        </section>
      </div>

      <section className="card mt-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">Recent activity</h2>
          <Link href="/admin/automation" className="text-[12px] text-accent-text">
            All jobs →
          </Link>
        </div>
        {jobs.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">
            Nothing has run yet. Import a lead list or queue an audit to start.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {jobs.slice(0, 8).map((job) => (
              <li
                key={job.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">
                    {job.subjectLabel}
                  </div>
                  <div className="mono text-[11px] text-faint">
                    {job.kind.replace(/_/g, " ")} ·{" "}
                    {relativeTime(job.finishedAt ?? job.startedAt ?? job.createdAt)}
                  </div>
                </div>
                <JobStatusTag status={job.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="mono font-medium">{value}</dd>
    </div>
  );
}
