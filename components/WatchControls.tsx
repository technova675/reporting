"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAutomation } from "./AutomationProvider";
import { WATCH_CADENCES } from "@/lib/types";

/** Pause, re-cadence, scan now, delete. Server page refreshes after each. */
export function WatchControls({
  watchId,
  enabled,
  cadence,
  scanPending,
}: {
  watchId: string;
  enabled: boolean;
  cadence: string;
  scanPending: boolean;
}) {
  const router = useRouter();
  const { notifyMutation } = useAutomation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    await fetch(`/api/watches/${watchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    notifyMutation();
    router.refresh();
    setBusy(false);
  }

  async function scanNow() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/watches/${watchId}`, { method: "POST" });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Could not start a scan.");
    }
    notifyMutation();
    router.refresh();
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/watches/${watchId}`, { method: "DELETE" });
    notifyMutation();
    router.push("/admin/competitors");
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <select
          className="field w-auto"
          value={cadence}
          disabled={busy}
          onChange={(e) => patch({ cadence: e.target.value })}
        >
          {WATCH_CADENCES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => patch({ enabled: !enabled })}
        >
          {enabled ? "Pause watch" : "Resume watch"}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || scanPending}
          onClick={scanNow}
        >
          {scanPending ? "Scanning…" : "Scan now"}
        </button>
      </div>
      {error && <p className="text-[11px] text-danger">{error}</p>}
      <button
        type="button"
        className="btn btn-quiet btn-sm text-danger"
        disabled={busy}
        onClick={remove}
      >
        Delete watch
      </button>
    </div>
  );
}
