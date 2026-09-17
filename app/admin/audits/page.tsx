"use client";

import Link from "next/link";
import { useState } from "react";
import { useAutomation } from "@/components/AutomationProvider";
import {
  AuditStatusTag,
  EmptyState,
  PageHeader,
  relativeTime,
} from "@/components/ui";
import { AUDIT_CATEGORIES } from "@/lib/types";
import { useResource } from "@/lib/useResource";
import type { Audit } from "@/lib/types";

type AuditRow = Omit<Audit, "categories"> & { findingCount: number };

const selectAudits = (body: unknown) => (body as { audits: AuditRow[] }).audits;

export default function AuditsPage() {
  const { revision, notifyMutation, settings } = useAutomation();
  const [formOpen, setFormOpen] = useState(false);

  const { data, loading, reload } = useResource(
    "/api/audits",
    selectAudits,
    revision,
  );
  const audits = data ?? [];

  return (
    <div>
      <PageHeader
        title="Audits"
        description="The free Marketing Audit, run as a queued job instead of a browser tab you have to keep open. Ten surfaces, each finding with a priority and a fix."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setFormOpen((v) => !v)}
          >
            {formOpen ? "Close" : "New audit"}
          </button>
        }
      />

      {formOpen && (
        <NewAuditForm
          automationPaused={!settings?.enabled}
          onCreated={() => {
            setFormOpen(false);
            reload();
            notifyMutation();
          }}
        />
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {AUDIT_CATEGORIES.map((c) => (
          <span
            key={c.key}
            className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted"
          >
            {c.label}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="text-[13px] text-muted">Loading audits…</div>
      ) : audits.length === 0 ? (
        <EmptyState title="No audits yet">
          Enter a website and the worker researches all ten surfaces, checks the
          public ad libraries, and returns a prioritized fix list.
        </EmptyState>
      ) : (
        <div className="card divide-y divide-line">
          {audits.map((audit) => (
            <Link
              key={audit.id}
              href={`/admin/audits/${audit.id}`}
              className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">
                  {audit.brandName || audit.inputs.website}
                </div>
                <div className="mono truncate text-[11px] text-faint">
                  {audit.inputs.website} · {relativeTime(audit.createdAt)}
                  {audit.status === "complete" &&
                    ` · ${audit.findingCount} findings`}
                </div>
              </div>
              <AuditStatusTag status={audit.status} />
              <div
                className={`mono w-14 shrink-0 text-right text-[15px] font-semibold ${scoreClass(
                  audit.overallScore,
                )}`}
              >
                {audit.overallScore ?? "—"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function scoreClass(score: number | null): string {
  if (score === null) return "text-faint";
  if (score >= 70) return "text-ok";
  if (score >= 45) return "text-warn";
  return "text-danger";
}

function NewAuditForm({
  onCreated,
  automationPaused,
}: {
  onCreated: () => void;
  automationPaused: boolean;
}) {
  const [form, setForm] = useState({
    website: "",
    brand: "",
    industry: "",
    social: "",
    competitors: "",
    context: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Could not queue the audit.");
        return;
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not queue the audit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-5 p-5">
      <h2 className="mb-3 text-[13px] font-semibold">New audit</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Website" required>
          <input
            className="field"
            placeholder="brandname.com"
            value={form.website}
            onChange={set("website")}
          />
        </Field>
        <Field label="Business name">
          <input className="field" value={form.brand} onChange={set("brand")} />
        </Field>
        <Field label="Industry">
          <input
            className="field"
            placeholder="D2C skincare, B2B SaaS…"
            value={form.industry}
            onChange={set("industry")}
          />
        </Field>
        <Field label="Social handles">
          <input
            className="field"
            placeholder="@brand, LinkedIn page"
            value={form.social}
            onChange={set("social")}
          />
        </Field>
        <Field label="Competitors">
          <input
            className="field"
            placeholder="competitor1.com, competitor2.com"
            value={form.competitors}
            onChange={set("competitors")}
          />
        </Field>
        <Field label="Anything else">
          <input
            className="field"
            placeholder="Known ad spend, target market…"
            value={form.context}
            onChange={set("context")}
          />
        </Field>
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {error}
        </p>
      )}
      {automationPaused && (
        <p className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-[12px] text-warn">
          Automation is paused — this audit will queue but not run until you
          start the worker.
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary mt-4"
        onClick={submit}
        disabled={busy || !form.website.trim()}
      >
        {busy ? "Queueing…" : "Queue audit"}
      </button>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-faint">
        {label}
        {required && <span className="text-accent-text"> *</span>}
      </span>
      {children}
    </label>
  );
}
