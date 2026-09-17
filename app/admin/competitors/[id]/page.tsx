import Link from "next/link";
import { notFound } from "next/navigation";
import { read } from "@/lib/db";
import { AutoRefresh } from "@/components/AutoRefresh";
import { WatchControls } from "@/components/WatchControls";
import { Tag, relativeTime } from "@/components/ui";
import type { Signal } from "@/lib/types";

export default async function WatchDetailPage({
  params,
}: PageProps<"/admin/competitors/[id]">) {
  const { id } = await params;
  const db = await read();

  const watch = db.watches.find((w) => w.id === id);
  if (!watch) notFound();

  const scans = db.scans.filter((s) => s.watchId === id);
  const pending = scans.find(
    (s) => s.status === "queued" || s.status === "running",
  );
  const latest = scans.find((s) => s.status === "complete") ?? null;

  // Changes first, then by significance — a quiet signal never outranks a move.
  const ordered = latest ? sortSignals(latest.signals) : [];
  const changes = ordered.filter((s) => s.isChange);
  const standing = ordered.filter((s) => !s.isChange);

  return (
    <div>
      <Link
        href="/admin/competitors"
        className="text-[12px] text-muted hover:underline"
      >
        ← All watches
      </Link>

      <header className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{watch.label}</h1>
          <p className="mono mt-0.5 text-[12px] text-faint">
            {watch.competitors.join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Tag tone={watch.enabled ? "accent" : "neutral"}>
              {watch.enabled ? watch.cadence : "paused"}
            </Tag>
            <Tag>{watch.clientName}</Tag>
            {watch.focus.map((f) => (
              <Tag key={f}>{f}</Tag>
            ))}
          </div>
        </div>
        <WatchControls
          watchId={watch.id}
          enabled={watch.enabled}
          cadence={watch.cadence}
          scanPending={Boolean(pending)}
        />
      </header>

      {watch.error && (
        <div className="mb-5 rounded-lg bg-danger-soft px-4 py-3 text-[13px] text-danger">
          <b>Last scan failed:</b> {watch.error}
        </div>
      )}

      {pending && (
        <div className="mb-5 rounded-lg border border-line bg-surface px-4 py-8 text-center">
          <AutoRefresh />
          <p className="text-[14px] font-medium">
            {pending.status === "queued"
              ? "Scan queued"
              : `Checking ${watch.competitors.length} competitors…`}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {pending.isBaseline
              ? "This is the baseline run — it records the current state, so nothing will be marked as a change."
              : "Results are graded against the last completed scan."}
          </p>
        </div>
      )}

      {!latest && !pending && (
        <div className="card px-4 py-10 text-center text-[13px] text-muted">
          No completed scans yet.
        </div>
      )}

      {latest && (
        <>
          <section className="card mb-4 border-l-2 border-l-accent p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-accent-text">
                {latest.isBaseline ? "Baseline" : "What moved"}
              </h2>
              <span className="mono text-[11px] text-faint">
                {relativeTime(latest.createdAt)}
                {latest.durationMs > 0 &&
                  ` · ${Math.round(latest.durationMs / 1000)}s`}
              </span>
            </div>
            <p className="text-[14px] leading-relaxed">{latest.summary}</p>
          </section>

          {changes.length > 0 && (
            <section className="mb-4">
              <h2 className="mb-2 text-[13px] font-semibold">
                Changes since last scan ({changes.length})
              </h2>
              <div className="space-y-2.5">
                {changes.map((signal, i) => (
                  <SignalCard key={`change-${i}`} signal={signal} highlight />
                ))}
              </div>
            </section>
          )}

          {changes.length === 0 && !latest.isBaseline && (
            <div className="card mb-4 px-4 py-6 text-center">
              <p className="text-[14px] font-medium text-ok">
                Nothing changed this run.
              </p>
              <p className="mt-1 text-[13px] text-muted">
                A quiet week is a real answer. The standing picture below is
                unchanged from the last scan.
              </p>
            </div>
          )}

          {standing.length > 0 && (
            <section className="mb-4">
              <h2 className="mb-2 text-[13px] font-semibold">
                Standing picture ({standing.length})
              </h2>
              <div className="space-y-2.5">
                {standing.map((signal, i) => (
                  <SignalCard key={`standing-${i}`} signal={signal} />
                ))}
              </div>
            </section>
          )}

          {latest.sources.length > 0 && (
            <details className="card mb-4 p-4">
              <summary className="cursor-pointer text-[12px] text-muted">
                {latest.sources.length} sources checked
              </summary>
              <ul className="mono mt-2 space-y-1 text-[11px]">
                {latest.sources.map((url) => (
                  <li key={url} className="truncate">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-text hover:underline"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {scans.length > 1 && (
        <section className="card p-4">
          <h2 className="mb-3 text-[13px] font-semibold">Scan history</h2>
          <ul className="divide-y divide-line">
            {scans.map((scan) => (
              <li
                key={scan.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="mono text-[12px]">
                    {relativeTime(scan.createdAt)}
                  </div>
                  <div className="truncate text-[11px] text-faint">
                    {scan.status === "complete"
                      ? `${scan.signals.filter((s) => s.isChange).length} changes · ${scan.signals.length} signals`
                      : scan.status === "failed"
                        ? scan.error
                        : scan.status}
                  </div>
                </div>
                {scan.isBaseline && <Tag tone="accent">baseline</Tag>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SignalCard({
  signal,
  highlight = false,
}: {
  signal: Signal;
  highlight?: boolean;
}) {
  const tone =
    signal.significance === "high"
      ? "danger"
      : signal.significance === "medium"
        ? "warn"
        : "neutral";

  return (
    <article
      className={`card p-4 ${highlight ? "border-l-2 border-l-warn" : ""}`}
    >
      <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-[13px] font-medium">{signal.headline}</h3>
        <div className="flex shrink-0 gap-1.5">
          <Tag tone={tone}>{signal.significance}</Tag>
          <Tag>{signal.category}</Tag>
        </div>
      </div>

      <p className="mono mb-2 text-[11px] text-faint">{signal.competitor}</p>
      <p className="text-[13px] text-muted">{signal.detail}</p>

      <p className="mt-2 text-[12px] text-muted">
        <b className="font-medium text-ink">Seen: </b>
        {signal.evidence}
        {signal.url && (
          <>
            {" "}
            <a
              href={signal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-text hover:underline"
            >
              source
            </a>
          </>
        )}
      </p>
      <p className="mt-1.5 text-[12px] text-info">→ {signal.soWhat}</p>
    </article>
  );
}

const RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function sortSignals(signals: Signal[]): Signal[] {
  return [...signals].sort((a, b) => {
    if (a.isChange !== b.isChange) return a.isChange ? -1 : 1;
    return (RANK[a.significance] ?? 3) - (RANK[b.significance] ?? 3);
  });
}
