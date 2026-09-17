"use client";

import { useState } from "react";
import { WATCH_CADENCES, WATCH_FOCUS } from "@/lib/types";
import type { WatchFocus } from "@/lib/types";

const DEFAULT_FOCUS: WatchFocus[] = ["offers", "positioning", "ads"];

export function NewWatchForm({
  onCreated,
  automationPaused,
}: {
  onCreated: () => void;
  automationPaused: boolean;
}) {
  const [clientName, setClientName] = useState("");
  const [label, setLabel] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [focus, setFocus] = useState<WatchFocus[]>(DEFAULT_FOCUS);
  const [cadence, setCadence] = useState("weekly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleFocus(item: WatchFocus) {
    setFocus((current) =>
      current.includes(item)
        ? current.filter((f) => f !== item)
        : [...current, item],
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, label, competitors, focus, cadence }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Could not create the watch.");
        return;
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the watch.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-5 p-5">
      <h2 className="mb-3 text-[13px] font-semibold">New watch</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <Label>Client</Label>
          <input
            className="field"
            placeholder="Nova Skincare"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />
        </label>
        <label className="block">
          <Label>Label (optional)</Label>
          <input
            className="field"
            placeholder="Defaults to the client name"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
      </div>

      <label className="mt-3 block">
        <Label>Competitor domains</Label>
        <textarea
          className="field mono min-h-20 text-[12px]"
          placeholder={"minimalistbeauty.in\ndotandkey.com\nplumgoodness.com"}
          value={competitors}
          onChange={(e) => setCompetitors(e.target.value)}
        />
        <span className="mt-1 block text-[11px] text-muted">
          One per line or comma separated. Up to eight — each one adds roughly
          three searches to every scan.
        </span>
      </label>

      <div className="mt-3">
        <Label>Watch for</Label>
        <div className="flex flex-wrap gap-1.5">
          {WATCH_FOCUS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => toggleFocus(item)}
              className={`btn btn-sm ${
                focus.includes(item) ? "btn-primary" : "btn-ghost"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <Label>Cadence</Label>
        <div className="flex flex-wrap gap-1.5">
          {WATCH_CADENCES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCadence(item)}
              className={`btn btn-sm ${
                cadence === item ? "btn-primary" : "btn-ghost"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {error}
        </p>
      )}
      {automationPaused && (
        <p className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-[12px] text-warn">
          Automation is paused — the baseline scan will queue but not run until
          you start the worker.
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary mt-4"
        onClick={submit}
        disabled={busy || !clientName.trim() || !competitors.trim()}
      >
        {busy ? "Creating…" : "Create watch and scan baseline"}
      </button>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-faint">
      {children}
    </span>
  );
}
