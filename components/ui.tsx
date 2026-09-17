import type { ReactNode } from "react";
import type { AuditStatus, JobStatus, LeadStage, Priority } from "@/lib/types";

/** Shared presentational bits. Kept dumb so both server and client pages use them. */

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

const TONE_STYLE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent-text",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function Tag({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return <span className={`tag ${TONE_STYLE[tone]}`}>{children}</span>;
}

/* ---- status → label + tone maps -------------------------------------- */

const STAGE_META: Record<LeadStage, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "neutral" },
  researching: { label: "Researching", tone: "info" },
  drafted: { label: "Drafted", tone: "accent" },
  contacted: { label: "Contacted", tone: "accent" },
  follow_up: { label: "Follow-up", tone: "accent" },
  replied: { label: "Replied", tone: "ok" },
  interested: { label: "Interested", tone: "ok" },
  meeting: { label: "Meeting", tone: "ok" },
  client: { label: "Client", tone: "ok" },
  lost: { label: "Lost", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
};

export function stageLabel(stage: LeadStage): string {
  return STAGE_META[stage]?.label ?? stage;
}

export function StageTag({ stage }: { stage: LeadStage }) {
  const meta = STAGE_META[stage] ?? { label: stage, tone: "neutral" as Tone };
  return <Tag tone={meta.tone}>{meta.label}</Tag>;
}

const AUDIT_META: Record<AuditStatus, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "info" },
  complete: { label: "Complete", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
};

export function AuditStatusTag({ status }: { status: AuditStatus }) {
  const meta = AUDIT_META[status];
  return (
    <Tag tone={meta.tone}>
      {status === "running" && (
        <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {meta.label}
    </Tag>
  );
}

const JOB_META: Record<JobStatus, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "info" },
  succeeded: { label: "Succeeded", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function JobStatusTag({ status }: { status: JobStatus }) {
  const meta = JOB_META[status];
  return (
    <Tag tone={meta.tone}>
      {status === "running" && (
        <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {meta.label}
    </Tag>
  );
}

export function PriorityTag({ priority }: { priority: Priority }) {
  const tone: Tone =
    priority === "high" ? "danger" : priority === "medium" ? "warn" : "ok";
  return <Tag tone={tone}>{priority}</Tag>;
}

/* ---- layout helpers --------------------------------------------------- */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-[13px] text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  const valueColor =
    tone === "ok"
      ? "text-ok"
      : tone === "danger"
        ? "text-danger"
        : tone === "warn"
          ? "text-warn"
          : tone === "accent"
            ? "text-accent-text"
            : "text-ink";
  return (
    <div className="card p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-faint">
        {label}
      </div>
      <div className={`mono mt-1.5 text-2xl font-semibold ${valueColor}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-[12px] text-muted">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="text-[15px] font-medium">{title}</div>
      {children && (
        <div className="max-w-md text-[13px] text-muted">{children}</div>
      )}
    </div>
  );
}

export function ScoreDial({
  score,
  size = 72,
}: {
  score: number;
  size?: number;
}) {
  const radius = size / 2 - 6;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
  const color =
    score >= 70 ? "var(--ok)" : score >= 45 ? "var(--warn)" : "var(--danger)";

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Score ${score} out of 100`}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dash}
        />
      </svg>
      <div
        className="mono absolute inset-0 flex items-center justify-center font-semibold"
        style={{ color, fontSize: size / 3.4 }}
      >
        {score}
      </div>
    </div>
  );
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - Date.parse(iso);
  const abs = Math.abs(diff);
  const future = diff < 0;

  const units: [number, string][] = [
    [86_400_000, "d"],
    [3_600_000, "h"],
    [60_000, "m"],
    [1000, "s"],
  ];
  for (const [ms, suffix] of units) {
    if (abs >= ms) {
      const n = Math.floor(abs / ms);
      return future ? `in ${n}${suffix}` : `${n}${suffix} ago`;
    }
  }
  return "just now";
}

/** Wall-clock time for log lines. Kept here so components stay render-pure. */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

/** True when `iso` is still in the future — used for backoff countdowns. */
export function isFuture(iso: string): boolean {
  return Date.parse(iso) > Date.now();
}
