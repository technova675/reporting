"use client";

import Link from "next/link";
import { useState } from "react";
import { useAutomation } from "@/components/AutomationProvider";
import { NewWatchForm } from "@/components/NewWatchForm";
import { EmptyState, PageHeader, Tag, relativeTime } from "@/components/ui";
import { useResource } from "@/lib/useResource";
import type { Watch } from "@/lib/types";

type WatchRow = Watch & {
  pending: boolean;
  latestScan: {
    id: string;
    createdAt: string;
    summary: string | null;
    isBaseline: boolean;
    signalCount: number;
    changeCount: number;
    highCount: number;
  } | null;
};

const selectWatches = (body: unknown) =>
  (body as { watches: WatchRow[] }).watches;

export default function CompetitorsPage() {
  const { revision, notifyMutation, settings } = useAutomation();
  const [formOpen, setFormOpen] = useState(false);

  const { data, loading, reload } = useResource(
    "/api/watches",
    selectWatches,
    revision,
  );
  const watches = data ?? [];

  return (
    <div>
      <PageHeader
        title="Competitors"
        description="Standing watches that re-run on a cadence. Each scan is graded against the last one, so what surfaces is what changed — not the same report every week."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setFormOpen((v) => !v)}
          >
            {formOpen ? "Close" : "New watch"}
          </button>
        }
      />

      {formOpen && (
        <NewWatchForm
          automationPaused={!settings?.enabled}
          onCreated={() => {
            setFormOpen(false);
            reload();
            notifyMutation();
          }}
        />
      )}

      {loading ? (
        <div className="text-[13px] text-muted">Loading watches…</div>
      ) : watches.length === 0 ? (
        <EmptyState title="No watches yet">
          Point a watch at two or three competitor domains. The first scan
          records a baseline; every scan after that reports only what moved.
        </EmptyState>
      ) : (
        <div className="space-y-2.5">
          {watches.map((watch) => (
            <Link
              key={watch.id}
              href={`/admin/competitors/${watch.id}`}
              className="card block p-4 hover:border-line-strong"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{watch.label}</div>
                  <div className="mono mt-0.5 truncate text-[11px] text-faint">
                    {watch.competitors.join(" · ")}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {watch.pending ? (
                    <Tag tone="info">
                      <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-current" />
                      Scanning
                    </Tag>
                  ) : !watch.enabled ? (
                    <Tag>Paused</Tag>
                  ) : (
                    <Tag>{watch.cadence}</Tag>
                  )}
                  {watch.latestScan && watch.latestScan.highCount > 0 && (
                    <Tag tone="danger">
                      {watch.latestScan.highCount} urgent
                    </Tag>
                  )}
                  {watch.latestScan &&
                    watch.latestScan.highCount === 0 &&
                    watch.latestScan.changeCount > 0 && (
                      <Tag tone="warn">
                        {watch.latestScan.changeCount} change
                        {watch.latestScan.changeCount === 1 ? "" : "s"}
                      </Tag>
                    )}
                  {watch.latestScan &&
                    watch.latestScan.changeCount === 0 &&
                    !watch.latestScan.isBaseline && <Tag tone="ok">Quiet</Tag>}
                  {watch.latestScan?.isBaseline && <Tag tone="accent">Baseline</Tag>}
                </div>
              </div>

              {watch.latestScan?.summary && (
                <p className="mt-2.5 line-clamp-2 text-[12px] text-muted">
                  {watch.latestScan.summary}
                </p>
              )}

              <div className="mono mt-2.5 flex flex-wrap gap-3 text-[11px] text-faint">
                <span>{watch.clientName}</span>
                <span>
                  {watch.scanCount} scan{watch.scanCount === 1 ? "" : "s"}
                </span>
                <span>
                  last {watch.lastRunAt ? relativeTime(watch.lastRunAt) : "never"}
                </span>
                {watch.enabled && watch.nextRunAt && (
                  <span>next {relativeTime(watch.nextRunAt)}</span>
                )}
              </div>

              {watch.error && (
                <p className="mt-2 text-[11px] text-danger">{watch.error}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
