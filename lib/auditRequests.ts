import { newId, now } from "./db";
import { enqueue } from "./automation/engine";
import { normalizeUrl } from "./research/web";
import type { Audit, AuditInputs, AuditSource, Db } from "./types";

/**
 * Turning a request body into a queued audit. Shared by the console route and
 * the public one so both apply the same validation.
 */

const LIMITS: Record<keyof AuditInputs, number> = {
  website: 200,
  brand: 120,
  industry: 120,
  social: 200,
  competitors: 200,
  context: 1000,
};

export function parseAuditInputs(
  body: Record<string, unknown>,
): { inputs: AuditInputs } | { error: string } {
  const text = (key: keyof AuditInputs) => {
    const value = body[key];
    if (typeof value !== "string") return undefined;
    return value.trim().slice(0, LIMITS[key]) || undefined;
  };

  const website = text("website");
  if (!website) return { error: "A website is required to run an audit." };
  const url = normalizeUrl(website);
  if (!url) {
    return { error: "That doesn't look like a website address. Try something like brandname.com." };
  }

  return {
    inputs: {
      website: website.replace(/^https?:\/\//i, "").replace(/\/$/, ""),
      brand: text("brand"),
      industry: text("industry"),
      social: text("social"),
      competitors: text("competitors"),
      context: text("context"),
    },
  };
}

export function createAudit(
  db: Db,
  inputs: AuditInputs,
  source: AuditSource,
  leadId: string | null = null,
): Audit {
  const record: Audit = {
    id: newId("audit"),
    createdAt: now(),
    updatedAt: now(),
    status: "queued",
    inputs,
    brandName: inputs.brand ?? null,
    overallScore: null,
    categories: [],
    topPriorities: [],
    executiveSummary: null,
    error: null,
    leadId,
    source,
    progressStep: 0,
    progressDetail: null,
    sources: [],
    tokensIn: 0,
    tokensOut: 0,
    durationMs: 0,
  };
  db.audits.unshift(record);
  enqueue(db, "run_audit", record.id, inputs.brand || inputs.website);
  return record;
}
