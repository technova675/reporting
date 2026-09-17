"use client";

import { useState } from "react";

const SAMPLE = `Priya Sharma, Nova Skincare, novaskincare.in, priya@novaskincare.in, linkedin.com/in/priyasharma
Rahul Mehta, Fitly App, fitlyapp.com, rahul@fitlyapp.com, linkedin.com/in/rahulmehta
Ananya Rao, Bloom Bakes, bloombakes.in, ananya@bloombakes.in, linkedin.com/in/ananyarao`;

interface Props {
  onImported: () => void | Promise<void>;
  automationPaused: boolean;
}

/**
 * Bulk import. Unlike the old browser-only prototype there is no batch ceiling
 * here — the list goes into the queue and the worker drains it at whatever
 * concurrency the settings allow, so a thousand leads is a scheduling question,
 * not a "paste fewer rows" question.
 */
export function ImportPanel({ onImported, automationPaused }: Props) {
  const [raw, setRaw] = useState("");
  const [owner, setOwner] = useState("");
  const [autoResearch, setAutoResearch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const rowCount = raw.split("\n").filter((l) => l.trim()).length;

  async function submit() {
    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw, owner, autoResearch }),
      });
      const data = (await res.json()) as {
        error?: string;
        warnings?: string[];
        created?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
        setWarnings(data.warnings ?? []);
        return;
      }
      setWarnings(data.warnings ?? []);
      setRaw("");
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-5 p-5">
      <h2 className="text-[13px] font-semibold">Import a lead list</h2>
      <p className="mt-0.5 mb-3 text-[12px] text-muted">
        One lead per line:{" "}
        <code className="mono">name, company, website, email, linkedin</code>.
        Rows with no website and no LinkedIn are skipped — there would be nothing
        to research.
      </p>

      <textarea
        className="field mono min-h-36 text-[12px]"
        placeholder={SAMPLE}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          className="field max-w-44"
          placeholder="Owner (optional)"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        />
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={autoResearch}
            onChange={(e) => setAutoResearch(e.target.checked)}
          />
          Queue research on import
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => setRaw(SAMPLE)}
          >
            Load sample
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={busy || rowCount === 0}
          >
            {busy
              ? "Importing…"
              : `Import ${rowCount || ""} lead${rowCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      {autoResearch && automationPaused && (
        <p className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-[12px] text-warn">
          Automation is paused, so these will sit in the queue until you start
          the worker on the Automation page.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {error}
        </p>
      )}

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-md bg-surface-2 px-3 py-2 text-[12px] text-muted">
          {warnings.map((w) => (
            <li key={w}>· {w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
