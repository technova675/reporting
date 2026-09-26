import { AuditorHeader, ScopeChips } from "@/components/audit/AuditReport";
import { PublicAuditStart } from "@/components/audit/PublicAuditStart";

export default function PublicAuditPage() {
  return (
    <>
      <AuditorHeader>
        <p className="au-lede">
          One AI agent audits your entire marketing surface and hands back a
          prioritized fix list — problem, why it matters, priority,
          recommendation, and expected impact for each finding, plus what it
          actually saw.
        </p>
        <p className="au-free-line">→ Get your free AI Marketing Audit</p>
      </AuditorHeader>
      <ScopeChips />
      <PublicAuditStart />
    </>
  );
}
