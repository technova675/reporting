/**
 * Core domain model for the Adbibe growth console.
 *
 * Everything that gets persisted lives in this file so the JSON store, the API
 * routes and the client components all agree on one shape.
 */

export const SERVICES = [
  "Performance Marketing",
  "Programmatic Marketing",
  "AI Automation",
  "Social Media Marketing",
  "Brand Strategy",
  "Marketing Consulting",
] as const;

export type Service = (typeof SERVICES)[number];

export const AUDIT_CATEGORIES = [
  { key: "website", label: "Website & Landing Pages" },
  { key: "seo", label: "SEO" },
  { key: "social", label: "Social Media" },
  { key: "google_ads", label: "Google Ads" },
  { key: "meta_ads", label: "Meta Ads" },
  { key: "competitors", label: "Competitors" },
  { key: "content", label: "Content" },
  { key: "funnel_leadgen", label: "Funnel & Lead Generation" },
  { key: "conversion_rate", label: "Conversion Rate" },
  { key: "brand_positioning", label: "Brand Positioning" },
] as const;

export type AuditCategoryKey = (typeof AUDIT_CATEGORIES)[number]["key"];

export type Priority = "high" | "medium" | "low";

export interface Finding {
  problem: string;
  why: string;
  priority: Priority;
  recommendation: string;
  expected_impact: string;
}

export interface AuditCategory {
  key: AuditCategoryKey;
  score: number;
  findings: Finding[];
}

export interface AuditInputs {
  website: string;
  brand?: string;
  industry?: string;
  social?: string;
  competitors?: string;
  context?: string;
}

export type AuditStatus = "queued" | "running" | "complete" | "failed";

export interface Audit {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: AuditStatus;
  inputs: AuditInputs;
  brandName: string | null;
  overallScore: number | null;
  categories: AuditCategory[];
  topPriorities: string[];
  executiveSummary: string | null;
  /** Populated when status is "failed". */
  error: string | null;
  /** Lead this audit was run for, when it came out of the outbound pipeline. */
  leadId: string | null;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

/**
 * The outbound pipeline. `new` → `researching` → `drafted` are pre-send states
 * and deliberately excluded from the funnel counters; the funnel only starts
 * once a human has actually sent something.
 */
export const LEAD_STAGES = [
  "new",
  "researching",
  "drafted",
  "contacted",
  "follow_up",
  "replied",
  "interested",
  "meeting",
  "client",
  "lost",
  "failed",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

export const FUNNEL_STAGES: LeadStage[] = [
  "contacted",
  "follow_up",
  "replied",
  "interested",
  "meeting",
  "client",
];

export interface LeadResearch {
  summary: string;
  service: Service | string;
  /** The single concrete observation the outreach leads with. */
  hook: string;
  sources: string[];
}

export interface LeadDrafts {
  emailSubject: string;
  emailBody: string;
  linkedinMessage: string;
}

export interface LeadEvent {
  at: string;
  type:
    | "created"
    | "research_started"
    | "research_complete"
    | "research_failed"
    | "stage_change"
    | "draft_edited"
    | "note";
  from?: LeadStage;
  to?: LeadStage;
  detail?: string;
}

export interface Lead {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  company: string;
  website: string;
  email: string;
  linkedin: string;
  stage: LeadStage;
  /** Which of the three touches in the sequence has been sent (0-2). */
  sequenceStep: number;
  nextTouchAt: string | null;
  research: LeadResearch | null;
  drafts: LeadDrafts | null;
  auditId: string | null;
  error: string | null;
  owner: string;
  tags: string[];
  events: LeadEvent[];
}

/* ------------------------------------------------------------------ */
/* Automation                                                          */
/* ------------------------------------------------------------------ */

export type JobKind =
  | "research_lead"
  | "run_audit"
  | "advance_sequence"
  | "scan_competitors";

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface JobLogLine {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface Job {
  id: string;
  kind: JobKind;
  status: JobStatus;
  /** Lead or audit id this job operates on. */
  subjectId: string;
  subjectLabel: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  attempts: number;
  maxAttempts: number;
  /** Earliest time the worker may pick this job up (used for backoff). */
  runAfter: string;
  error: string | null;
  log: JobLogLine[];
  batchId: string | null;
}

export interface Batch {
  id: string;
  createdAt: string;
  label: string;
  kind: JobKind;
  jobIds: string[];
}

export interface AutomationSettings {
  /** Master switch for the worker loop. */
  enabled: boolean;
  /** How many jobs the worker may run in one tick. */
  concurrency: number;
  /** Seconds between automatic ticks in the browser-driven runner. */
  tickIntervalSec: number;
  /** Days between touches in the outbound sequence. */
  sequenceDelaysDays: [number, number, number];
  /** Leads are never auto-sent; this only advances drafting + reminders. */
  autoSendEnabled: false;
  dailyLeadCap: number;
  model: string;
}

export interface Db {
  version: number;
  leads: Lead[];
  audits: Audit[];
  watches: Watch[];
  scans: Scan[];
  jobs: Job[];
  batches: Batch[];
  settings: AutomationSettings;
}

/* ------------------------------------------------------------------ */
/* Competitor intelligence                                             */
/* ------------------------------------------------------------------ */

/**
 * The second agent on the engine. A Watch is a standing instruction — "keep an
 * eye on these three competitors for this client" — and each Scan is one run of
 * it. What makes it a service rather than a report generator is the diff: a
 * scan is graded against the previous one, so what surfaces is what *changed*.
 */

export const SIGNAL_CATEGORIES = [
  "offer",
  "pricing",
  "positioning",
  "ads",
  "content",
  "product",
  "other",
] as const;

export type SignalCategory = (typeof SIGNAL_CATEGORIES)[number];

export type Significance = "high" | "medium" | "low";

export interface Signal {
  competitor: string;
  category: SignalCategory;
  /** Alert-line summary, e.g. "Launched a first-order discount". */
  headline: string;
  detail: string;
  significance: Significance;
  /** What was actually observed, so a human can check the claim. */
  evidence: string;
  /** The recommended response — the part that makes this billable. */
  soWhat: string;
  url: string | null;
  /** False when this was already true at the previous scan. */
  isChange: boolean;
}

export const WATCH_CADENCES = ["daily", "weekly", "manual"] as const;
export type WatchCadence = (typeof WATCH_CADENCES)[number];

export const CADENCE_DAYS: Record<WatchCadence, number | null> = {
  daily: 1,
  weekly: 7,
  manual: null,
};

/** What the scan is told to look at. Narrowing this makes scans cheaper. */
export const WATCH_FOCUS = [
  "offers",
  "pricing",
  "positioning",
  "ads",
  "content",
  "product",
] as const;

export type WatchFocus = (typeof WATCH_FOCUS)[number];

export interface Watch {
  id: string;
  createdAt: string;
  updatedAt: string;
  label: string;
  clientName: string;
  /** Domains being watched. */
  competitors: string[];
  focus: WatchFocus[];
  cadence: WatchCadence;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastScanId: string | null;
  scanCount: number;
  error: string | null;
}

export type ScanStatus = "queued" | "running" | "complete" | "failed";

export interface Scan {
  id: string;
  watchId: string;
  createdAt: string;
  updatedAt: string;
  status: ScanStatus;
  /** True for the first scan of a watch — everything is new, nothing is a change. */
  isBaseline: boolean;
  signals: Signal[];
  summary: string | null;
  sources: string[];
  error: string | null;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}
