import type { Audit, AuditCategory, AuditStatus } from "./types";

/**
 * What a visitor on the public audit page is allowed to see. No token counts,
 * no lead link, no raw error text — just the report and where the run is.
 */
export interface PublicAudit {
  id: string;
  status: AuditStatus;
  createdAt: string;
  website: string;
  brandName: string | null;
  overallScore: number | null;
  categories: AuditCategory[];
  topPriorities: string[];
  executiveSummary: string | null;
  sources: string[];
  progressStep: number;
  progressDetail: string | null;
  /** Position among queued audits, 1 = next up. Null unless queued. */
  queuePosition: number | null;
}

export function toPublicAudit(audit: Audit, all: Audit[] = []): PublicAudit {
  let queuePosition: number | null = null;
  if (audit.status === "queued") {
    const queued = all
      .filter((a) => a.status === "queued")
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const index = queued.findIndex((a) => a.id === audit.id);
    queuePosition = index === -1 ? null : index + 1;
  }

  return {
    id: audit.id,
    status: audit.status,
    createdAt: audit.createdAt,
    website: audit.inputs.website,
    brandName: audit.brandName,
    overallScore: audit.overallScore,
    categories: audit.status === "complete" ? audit.categories : [],
    topPriorities: audit.status === "complete" ? audit.topPriorities : [],
    executiveSummary: audit.status === "complete" ? audit.executiveSummary : null,
    sources: audit.status === "complete" ? (audit.sources ?? []) : [],
    progressStep:
      audit.status === "queued" ? 0 : (audit.progressStep ?? (audit.status === "running" ? 1 : 0)),
    progressDetail: audit.status === "running" ? (audit.progressDetail ?? null) : null,
    queuePosition,
  };
}
