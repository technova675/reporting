import Link from "next/link";
import { notFound } from "next/navigation";
import { read } from "@/lib/db";
import { AUDIT_CATEGORIES } from "@/lib/types";
import {
  AuditStatusTag,
  PriorityTag,
  ScoreDial,
  Tag,
  relativeTime,
} from "@/components/ui";
import { RequeueButton } from "@/components/RequeueButton";
import { AutoRefresh } from "@/components/AutoRefresh";

export default async function AuditDetailPage({
  params,
}: PageProps<"/admin/audits/[id]">) {
  const { id } = await params;
  const db = await read();
  const audit = db.audits.find((a) => a.id === id);
  if (!audit) notFound();

  const labelFor = (key: string) =>
    AUDIT_CATEGORIES.find((c) => c.key === key)?.label ?? key;

  const ordered = AUDIT_CATEGORIES.map((def) =>
    audit.categories.find((c) => c.key === def.key),
  ).filter((c) => c !== undefined);

  return (
    <div>
      <Link href="/admin/audits" className="text-[12px] text-muted hover:underline">
        ← All audits
      </Link>

      <header className="mt-3 mb-6 flex flex-wrap items-start gap-5">
        {audit.overallScore !== null && (
          <ScoreDial score={audit.overallScore} size={84} />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {audit.brandName || audit.inputs.website}
          </h1>
          <p className="mono mt-0.5 text-[12px] text-faint">
            {audit.inputs.website} · run {relativeTime(audit.createdAt)}
            {audit.durationMs > 0 &&
              ` · took ${Math.round(audit.durationMs / 1000)}s`}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <AuditStatusTag status={audit.status} />
            {audit.inputs.industry && <Tag>{audit.inputs.industry}</Tag>}
            {audit.tokensOut > 0 && (
              <Tag>
                {(audit.tokensIn + audit.tokensOut).toLocaleString()} tokens
              </Tag>
            )}
          </div>
        </div>
        <RequeueButton auditId={audit.id} />
      </header>

      {audit.status === "failed" && (
        <div className="mb-5 rounded-lg bg-danger-soft px-4 py-3 text-[13px] text-danger">
          <b>This audit failed.</b> {audit.error}
        </div>
      )}

      {(audit.status === "queued" || audit.status === "running") && (
        <div className="rounded-lg border border-line bg-surface px-4 py-10 text-center">
          <AutoRefresh />
          <p className="text-[14px] font-medium">
            {audit.status === "queued"
              ? "Waiting in the queue"
              : "Researching ten surfaces…"}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            A full audit takes a couple of minutes. This page updates as the
            worker reports back — the run does not depend on your tab staying
            open.
          </p>
        </div>
      )}

      {audit.status === "complete" && (
        <>
          {audit.executiveSummary && (
            <section className="card mb-4 border-l-2 border-l-accent p-5">
              <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-accent-text">
                Executive summary
              </h2>
              <p className="text-[14px] leading-relaxed">
                {audit.executiveSummary}
              </p>
            </section>
          )}

          {audit.topPriorities.length > 0 && (
            <section className="card mb-4 p-5">
              <h2 className="mb-3 text-[13px] font-semibold">
                Start with these three
              </h2>
              <ol className="space-y-2">
                {audit.topPriorities.map((priority, i) => (
                  <li key={priority} className="flex gap-3 text-[13px]">
                    <span className="mono font-semibold text-accent-text">
                      {i + 1}
                    </span>
                    <span>{priority}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="space-y-2.5">
            {ordered.map((category) => (
              <details key={category.key} className="card overflow-hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                  <span className="text-[13px] font-medium">
                    {labelFor(category.key)}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="h-1.5 w-20 overflow-hidden rounded bg-surface-2">
                      <span
                        className="block h-full rounded"
                        style={{
                          width: `${category.score}%`,
                          background:
                            category.score >= 70
                              ? "var(--ok)"
                              : category.score >= 45
                                ? "var(--warn)"
                                : "var(--danger)",
                        }}
                      />
                    </span>
                    <span className="mono w-12 text-right text-[12px] text-muted">
                      {category.score}/100
                    </span>
                  </span>
                </summary>
                <div className="border-t border-line px-4 py-1">
                  {category.findings.map((finding, i) => (
                    <div
                      key={`${category.key}-${i}`}
                      className="border-b border-line py-3.5 last:border-b-0"
                    >
                      <div className="mb-1.5 flex items-start justify-between gap-3">
                        <p className="text-[13px] font-medium">
                          {finding.problem}
                        </p>
                        <PriorityTag priority={finding.priority} />
                      </div>
                      <p className="text-[12px] text-muted">
                        <b className="font-medium text-ink">Why: </b>
                        {finding.why}
                      </p>
                      <p className="mt-1 text-[12px] text-muted">
                        <b className="font-medium text-ink">Fix: </b>
                        {finding.recommendation}
                      </p>
                      <p className="mt-1 text-[12px] text-info">
                        ↗ {finding.expected_impact}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
