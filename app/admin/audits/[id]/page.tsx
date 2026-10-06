import Link from "next/link";
import { notFound } from "next/navigation";
import { read } from "@/lib/db";
import { toPublicAudit } from "@/lib/publicAudit";
import {
  AuditProgress,
  AuditReport,
  AuditorHeader,
} from "@/components/audit/AuditReport";
import { auditorFonts } from "@/components/audit/fonts";
import { AuditStatusTag, Tag, relativeTime } from "@/components/ui";
import { RequeueButton } from "@/components/RequeueButton";
import { AutoRefresh } from "@/components/AutoRefresh";

export default async function AuditDetailPage({
  params,
}: PageProps<"/admin/audits/[id]">) {
  const { id } = await params;
  const db = await read();
  const audit = db.audits.find((a) => a.id === id);
  if (!audit) notFound();

  const view = toPublicAudit(audit, db.audits);
  const inFlight = audit.status === "queued" || audit.status === "running";

  return (
    <div className={`auditor ${auditorFonts}`}>
      <Link href="/admin/audits" className="mb-4 inline-block text-[12px] text-muted hover:underline">
        ← All audits
      </Link>

      <AuditorHeader
        badge={audit.source === "public" ? "PUBLIC AUDIT" : "CONSOLE"}
        title={audit.brandName || audit.inputs.website}
      >
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          <AuditStatusTag status={audit.status} />
          {audit.inputs.industry && <Tag>{audit.inputs.industry}</Tag>}
          <Tag>run {relativeTime(audit.createdAt)}</Tag>
          {audit.durationMs > 0 && (
            <Tag>took {Math.round(audit.durationMs / 1000)}s</Tag>
          )}
          {audit.tokensOut > 0 && (
            <Tag>{(audit.tokensIn + audit.tokensOut).toLocaleString()} tokens</Tag>
          )}
          <span className="ml-auto flex gap-2">
            {audit.source === "public" && audit.status === "complete" && (
              <Link
                href={`/audit/${audit.id}`}
                target="_blank"
                className="btn btn-ghost btn-sm"
              >
                Client view ↗
              </Link>
            )}
            <RequeueButton auditId={audit.id} />
          </span>
        </div>
      </AuditorHeader>

      {audit.status === "failed" && (
        <div className="au-error">
          <b>This audit failed.</b> {audit.error}
        </div>
      )}

      {inFlight && (
        <>
          {/* The ping is what restarts a retry or a run that died mid-flight. */}
          <AutoRefresh pingUrl={`/api/audits/${audit.id}`} />
          <AuditProgress
            step={view.progressStep}
            detail={view.progressDetail}
            queuePosition={view.queuePosition}
            // Console audits start on their own; only public ones wait on the worker.
            paused={audit.source === "public" && !db.settings.enabled}
          />
        </>
      )}

      {audit.status === "complete" && (
        <AuditReport
          audit={{ ...view, sources: audit.sources ?? [] }}
          meta={audit.inputs.competitors ? `vs ${audit.inputs.competitors}` : undefined}
        />
      )}
    </div>
  );
}
