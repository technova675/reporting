"use client";

import Link from "next/link";
import { useState } from "react";
import { useAutomation } from "@/components/AutomationProvider";
import { AuditForm } from "@/components/audit/AuditForm";
import type { AuditFormValues } from "@/components/audit/AuditForm";
import {
  AuditorHeader,
  ScopeChips,
  scoreColor,
} from "@/components/audit/AuditReport";
import { auditorFonts } from "@/components/audit/fonts";
import { relativeTime } from "@/components/ui";
import { useResource } from "@/lib/useResource";
import type { Audit, AuditSource } from "@/lib/types";

type AuditRow = Omit<Audit, "categories"> & { findingCount: number };

const selectAudits = (body: unknown) => (body as { audits: AuditRow[] }).audits;

const SOURCE_LABEL: Record<AuditSource, string> = {
  console: "console",
  public: "public page",
  outbound: "outbound",
};

export default function AuditsPage() {
  const { revision, notifyMutation, hasApiKey } = useAutomation();
  const [formOpen, setFormOpen] = useState(false);

  const { data, loading, reload } = useResource(
    "/api/audits",
    selectAudits,
    revision,
  );
  const audits = data ?? [];

  async function queue(values: AuditFormValues): Promise<string | null> {
    const res = await fetch("/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return body.error ?? "Could not queue the audit.";
    }
    setFormOpen(false);
    reload();
    notifyMutation();
    return null;
  }

  return (
    <div className={`auditor ${auditorFonts}`}>
      <AuditorHeader badge="CONSOLE">
        <p className="au-lede">
          The free Marketing Audit, run as a queued job instead of a browser tab
          you have to keep open. Ten surfaces, each finding with a priority, a
          fix, and what the agent actually saw.
        </p>
        <p className="au-free-line">
          → Public version for prospects:{" "}
          <Link href="/audit" target="_blank" style={{ textDecoration: "underline" }}>
            /audit
          </Link>
        </p>
      </AuditorHeader>
      <ScopeChips />

      <div className="au-actions" style={{ marginBottom: 18 }}>
        <button
          type="button"
          className={formOpen ? "au-btn-ghost" : "au-btn"}
          style={{ flex: "0 0 auto", width: "auto", minWidth: 160 }}
          onClick={() => setFormOpen((v) => !v)}
        >
          {formOpen ? "Close" : "New audit →"}
        </button>
      </div>

      {formOpen && (
        <AuditForm
          onSubmit={queue}
          submitLabel="Run audit →"
          busyLabel="Starting…"
          notice={
            !hasApiKey && (
              <p className="au-note">
                No LLM_API_KEY is set — this audit will queue but not run until
                the key is in .env.local.
              </p>
            )
          }
        />
      )}

      <section className="au-history" style={{ marginTop: 8 }}>
        <h3>All audits</h3>
        {loading ? (
          <p className="au-empty">Loading audits…</p>
        ) : audits.length === 0 ? (
          <p className="au-empty">
            No audits yet. Enter a website and the worker reads the site, checks
            search presence and tracking tags, and returns a prioritized fix
            list.
          </p>
        ) : (
          audits.map((audit) => (
            <Link
              key={audit.id}
              href={`/admin/audits/${audit.id}`}
              className="au-hist-item"
            >
              <div style={{ minWidth: 0 }}>
                <div className="au-hist-name">
                  {audit.brandName || audit.inputs.website}
                </div>
                <div className="au-hist-date">
                  {audit.inputs.website} · {relativeTime(audit.createdAt)}
                  {audit.source && ` · ${SOURCE_LABEL[audit.source]}`}
                  {audit.status === "complete" &&
                    ` · ${audit.findingCount} findings`}
                </div>
              </div>
              <div className="au-hist-right">
                {audit.status !== "complete" && (
                  <span className="au-status" data-s={audit.status}>
                    {audit.status}
                  </span>
                )}
                <span
                  className="au-hist-score"
                  style={{ color: scoreColor(audit.overallScore) }}
                >
                  {audit.overallScore ?? "—"}
                </span>
              </div>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
