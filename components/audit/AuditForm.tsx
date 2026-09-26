"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { AuditInputs } from "@/lib/types";

export type AuditFormValues = Required<Omit<AuditInputs, "website">> & {
  website: string;
  /** Honeypot. Humans never see it; anything filled in here is a bot. */
  hp?: string;
};

const EMPTY: AuditFormValues = {
  website: "",
  brand: "",
  industry: "",
  social: "",
  competitors: "",
  context: "",
  hp: "",
};

/**
 * The audit intake form from the original prototype. Used on the public page
 * and in the console; each caller decides where the values go.
 */
export function AuditForm({
  onSubmit,
  submitLabel = "Run full audit →",
  busyLabel = "Starting…",
  withHoneypot = false,
  notice,
}: {
  /** Resolve with an error message to show, or null on success. */
  onSubmit: (values: AuditFormValues) => Promise<string | null>;
  submitLabel?: string;
  busyLabel?: string;
  withHoneypot?: boolean;
  notice?: ReactNode;
}) {
  const [form, setForm] = useState<AuditFormValues>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof AuditFormValues) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.website.trim()) {
      setError("A website URL is required to run the audit.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const message = await onSubmit(form);
      if (message) setError(message);
      else setForm(EMPTY);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the audit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="au-card" onSubmit={submit} noValidate>
      {error && (
        <div className="au-error" role="alert">
          {error}
        </div>
      )}
      {notice}

      <div className="au-field">
        <label className="au-label" htmlFor="au-website">
          Website URL <span className="au-required">*</span>
        </label>
        <input
          id="au-website"
          className="au-input"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="e.g. brandname.com"
          maxLength={200}
          value={form.website}
          onChange={set("website")}
        />
      </div>
      <div className="au-grid2">
        <div className="au-field">
          <label className="au-label" htmlFor="au-brand">
            Business name
          </label>
          <input
            id="au-brand"
            className="au-input"
            type="text"
            placeholder="Brand or company name"
            maxLength={120}
            value={form.brand}
            onChange={set("brand")}
          />
        </div>
        <div className="au-field">
          <label className="au-label" htmlFor="au-industry">
            Industry
          </label>
          <input
            id="au-industry"
            className="au-input"
            type="text"
            placeholder="e.g. D2C skincare, SaaS"
            maxLength={120}
            value={form.industry}
            onChange={set("industry")}
          />
        </div>
      </div>
      <div className="au-grid2">
        <div className="au-field">
          <label className="au-label" htmlFor="au-social">
            Instagram / social handles
          </label>
          <input
            id="au-social"
            className="au-input"
            type="text"
            placeholder="@brandname, LinkedIn page, etc."
            maxLength={200}
            value={form.social}
            onChange={set("social")}
          />
        </div>
        <div className="au-field">
          <label className="au-label" htmlFor="au-competitors">
            Main competitor(s)
          </label>
          <input
            id="au-competitors"
            className="au-input"
            type="text"
            placeholder="competitor1.com, competitor2.com"
            maxLength={200}
            value={form.competitors}
            onChange={set("competitors")}
          />
        </div>
      </div>
      <div className="au-field">
        <label className="au-label" htmlFor="au-context">
          Anything else worth knowing
        </label>
        <textarea
          id="au-context"
          className="au-input"
          placeholder="Known ad spend, target market, specific concerns — optional"
          maxLength={1000}
          value={form.context}
          onChange={set("context")}
        />
      </div>

      {withHoneypot && (
        <div className="au-hp" aria-hidden="true">
          <label htmlFor="au-hp">Leave this empty</label>
          <input
            id="au-hp"
            tabIndex={-1}
            autoComplete="off"
            value={form.hp}
            onChange={set("hp")}
          />
        </div>
      )}

      <button className="au-btn" type="submit" disabled={busy}>
        {busy ? busyLabel : submitLabel}
      </button>
    </form>
  );
}
