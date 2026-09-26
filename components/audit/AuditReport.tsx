import type { ReactNode } from "react";
import { AUDIT_CATEGORIES, AUDIT_STEPS } from "@/lib/types";
import type { AuditCategory, Finding } from "@/lib/types";
import "./auditor.css";

/**
 * The Auditor's presentational pieces, shared by the public page and the admin
 * console. No hooks, so server pages render them directly; accordions are
 * native <details> and need no JavaScript.
 */

export function scoreColor(score: number | null): string {
  if (score === null) return "var(--au-faint)";
  if (score >= 70) return "var(--au-green)";
  if (score >= 45) return "var(--au-amber)";
  return "var(--au-red)";
}

export function AuditorHeader({
  badge = "FREE AUDIT",
  title = "AI Marketing Auditor",
  children,
}: {
  badge?: string;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <header>
      <div className="au-top">
        <span className="au-dot" />
        <span className="au-brand">Adbibe</span>
        <span className="au-badge">{badge}</span>
      </div>
      <h1 className="au-title">{title}</h1>
      {children}
    </header>
  );
}

export function ScopeChips() {
  return (
    <div className="au-scope-row">
      {AUDIT_CATEGORIES.map((c) => (
        <span key={c.key} className="au-chip">
          {c.label}
        </span>
      ))}
    </div>
  );
}

export function ScoreRing({ score, size = 96 }: { score: number; size?: number }) {
  const r = size / 2 - 8;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
  const color = scoreColor(score);
  return (
    <div
      className="au-ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Overall score ${score} out of 100`}
    >
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--au-line)"
          strokeWidth="8"
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="au-ring-num" style={{ color }}>
        {score}
      </div>
    </div>
  );
}

export function AuditProgress({
  step,
  detail,
  queuePosition,
  paused,
}: {
  step: number;
  detail: string | null;
  queuePosition?: number | null;
  /** The worker is switched off, so a queued audit will not move on its own. */
  paused?: boolean;
}) {
  const queued = step === 0;
  return (
    <div className="au-card au-progress" aria-live="polite">
      <div className="au-spinner" />
      <p className="au-progress-title">
        {queued ? "Waiting in the queue" : AUDIT_STEPS[step] ?? "Working…"}
      </p>
      <p className="au-progress-detail">
        {queued
          ? paused
            ? "The audit worker is paused — this starts as soon as it resumes."
            : queuePosition && queuePosition > 1
              ? `${queuePosition - 1} audit${queuePosition === 2 ? "" : "s"} ahead of this one.`
              : "Starting shortly."
          : detail ?? "A full audit takes two to four minutes."}
      </p>
      <ol className="au-steps">
        {AUDIT_STEPS.slice(1).map((label, i) => {
          const index = i + 1;
          const state = index < step ? "done" : index === step ? "active" : "todo";
          return (
            <li key={label} className="au-step" data-state={state}>
              <span className="au-step-mark">
                {state === "done" ? "✓" : state === "active" ? "›" : "·"}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function FindingView({ finding }: { finding: Finding }) {
  return (
    <div className="au-finding">
      <div className="au-finding-top">
        <span className="au-fld-label">Problem</span>
        <span className="au-priority" data-p={finding.priority}>
          {finding.priority}
        </span>
      </div>
      <p className="au-f-problem">{finding.problem}</p>
      {finding.why && (
        <p className="au-f-row">
          <b>Why: </b>
          {finding.why}
        </p>
      )}
      {finding.recommendation && (
        <p className="au-f-row">
          <b>Fix: </b>
          {finding.recommendation}
        </p>
      )}
      {finding.evidence && (
        <p className="au-f-evidence">
          <span className="au-fld-label">Seen · </span>
          {finding.evidence}
        </p>
      )}
      {finding.expected_impact && (
        <p className="au-f-impact">↗ {finding.expected_impact}</p>
      )}
    </div>
  );
}

function CategoryView({ category }: { category: AuditCategory }) {
  const label =
    AUDIT_CATEGORIES.find((c) => c.key === category.key)?.label ?? category.key;
  const color = scoreColor(category.score);
  return (
    <details className="au-cat">
      <summary>
        <span className="au-cat-name">{label}</span>
        <span className="au-cat-right">
          <span className="au-bar" aria-hidden="true">
            <span style={{ width: `${category.score}%`, background: color }} />
          </span>
          <span className="au-cat-score" style={{ color }}>
            {category.score}/100
          </span>
          <span className="au-chevron" aria-hidden="true">
            ›
          </span>
        </span>
      </summary>
      <div className="au-cat-body">
        {category.findings.length > 0 ? (
          category.findings.map((f, i) => (
            <FindingView key={`${category.key}-${i}`} finding={f} />
          ))
        ) : (
          <p className="au-f-row" style={{ paddingTop: 10 }}>
            No findings recorded for this category.
          </p>
        )}
      </div>
    </details>
  );
}

export interface ReportData {
  website: string;
  brandName: string | null;
  overallScore: number | null;
  categories: AuditCategory[];
  topPriorities: string[];
  executiveSummary: string | null;
  sources?: string[];
}

export function AuditReport({
  audit,
  meta,
  headerActions,
  footer,
}: {
  audit: ReportData;
  /** Extra line under the brand name, e.g. run time or token count. */
  meta?: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
}) {
  const score = audit.overallScore ?? 0;
  const brand = audit.brandName || audit.website;
  const ordered = AUDIT_CATEGORIES.map((def) =>
    audit.categories.find((c) => c.key === def.key),
  ).filter((c): c is AuditCategory => c !== undefined);
  // Search results are third-party strings; only ever link plain web URLs.
  const sources = (audit.sources ?? []).filter((u) => /^https?:\/\//i.test(u));

  return (
    <div>
      <section className="au-card">
        <div className="au-score-hero">
          <ScoreRing score={score} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="au-brand-name">{brand}</p>
            <p className="au-meta-line">
              {audit.website}
              {meta ? <> · {meta}</> : null}
            </p>
          </div>
          {headerActions}
        </div>

        {audit.executiveSummary && (
          <div className="au-exec">
            <p className="au-kicker">Executive summary</p>
            {audit.executiveSummary}
          </div>
        )}

        {audit.topPriorities.length > 0 && (
          <div className="au-top3">
            <h3>Top 3 priorities</h3>
            {audit.topPriorities.map((p, i) => (
              <div key={`${i}-${p}`} className="au-top3-item">
                <span className="au-top3-num">{i + 1}</span>
                <span>{p}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="au-card">
        <h2 className="au-section-title">
          Full audit — {ordered.length} categories
        </h2>
        {ordered.map((category) => (
          <CategoryView key={category.key} category={category} />
        ))}
      </section>

      <section className="au-card au-final">
        <h3>Summary of everything</h3>
        <p>
          <b>Overall:</b> {brand} scores {score}/100 across website, SEO,
          social, ads, competitors, content, funnel, conversion, and brand
          positioning.
        </p>
        {audit.executiveSummary && <p>{audit.executiveSummary}</p>}
        {audit.topPriorities.length > 0 && (
          <p>
            <b>Start with:</b> {audit.topPriorities.join(" → ")}
          </p>
        )}
        {sources.length > 0 && (
          <details className="au-sources">
            <summary>
              {sources.length} source{sources.length === 1 ? "" : "s"} checked
            </summary>
            <ul>
              {sources.map((url) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noopener noreferrer nofollow">
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {footer}
    </div>
  );
}
