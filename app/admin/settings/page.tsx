"use client";

import { useState } from "react";
import { useAutomation } from "@/components/AutomationProvider";
import { PageHeader, Tag } from "@/components/ui";
import { SERVICES } from "@/lib/types";
import type { AutomationSettings } from "@/lib/types";

export default function SettingsPage() {
  const { settings, hasApiKey, updateSettings, loading } = useAutomation();

  if (!settings) {
    return (
      <div className="text-[13px] text-muted">
        {loading ? "Loading…" : "Settings unavailable."}
      </div>
    );
  }

  return (
    <SettingsForm
      key={`${settings.model}:${settings.sequenceDelaysDays.join("-")}`}
      initialModel={settings.model}
      initialDelays={settings.sequenceDelaysDays}
      hasApiKey={hasApiKey}
      updateSettings={updateSettings}
    />
  );
}

/**
 * Keyed on the server values, so a settings change made elsewhere remounts the
 * form with fresh defaults instead of being synced in an effect.
 */
function SettingsForm({
  initialModel,
  initialDelays,
  hasApiKey,
  updateSettings,
}: {
  initialModel: string;
  initialDelays: [number, number, number];
  hasApiKey: boolean;
  updateSettings: (patch: Partial<AutomationSettings>) => Promise<void>;
}) {
  const [model, setModel] = useState(initialModel);
  const [delays, setDelays] = useState<[number, number, number]>(initialDelays);
  const [saved, setSaved] = useState(false);

  async function save() {
    await updateSettings({ model, sequenceDelaysDays: delays });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Model, sequence timing, and what this workspace knows about Adbibe."
      />

      <section className="card mb-4 p-5">
        <h2 className="mb-3 text-[13px] font-semibold">Model</h2>
        <label className="block max-w-sm">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-faint">
            Model ID
          </span>
          <input
            className="field mono"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </label>
        <p className="mt-2 text-[12px] text-muted">
          Research runs with adaptive thinking and the web search tool. Audits
          run at high effort, lead research at medium — audits search harder, so
          they cost more per run.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[12px] text-muted">API key:</span>
          {hasApiKey ? (
            <Tag tone="ok">detected</Tag>
          ) : (
            <Tag tone="danger">not set</Tag>
          )}
        </div>
      </section>

      <section className="card mb-4 p-5">
        <h2 className="mb-1 text-[13px] font-semibold">Follow-up cadence</h2>
        <p className="mb-3 text-[12px] text-muted">
          Days after the previous touch. These set when a follow-up becomes due —
          they never trigger a send.
        </p>
        <div className="flex flex-wrap gap-4">
          {(["Initial", "Follow-up 1", "Follow-up 2"] as const).map(
            (label, i) => (
              <label key={label} className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-faint">
                  {label}
                </span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  className="field mono w-24"
                  value={delays[i]}
                  disabled={i === 0}
                  onChange={(e) => {
                    const next = [...delays] as [number, number, number];
                    next[i] = Number(e.target.value);
                    setDelays(next);
                  }}
                />
              </label>
            ),
          )}
        </div>
      </section>

      <section className="card mb-4 p-5">
        <h2 className="mb-1 text-[13px] font-semibold">Services offered</h2>
        <p className="mb-3 text-[12px] text-muted">
          Research is constrained to recommend exactly one of these — the model
          cannot invent a service Adbibe does not sell.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SERVICES.map((service) => (
            <Tag key={service} tone="accent">
              {service}
            </Tag>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={save}>
          Save settings
        </button>
        {saved && <span className="text-[12px] text-ok">Saved.</span>}
      </div>
    </div>
  );
}
