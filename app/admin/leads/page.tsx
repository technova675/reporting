"use client";

import { useCallback, useMemo, useState } from "react";
import { useAutomation } from "@/components/AutomationProvider";
import { ImportPanel } from "@/components/ImportPanel";
import { LeadDrawer } from "@/components/LeadDrawer";
import {
  EmptyState,
  PageHeader,
  StageTag,
  Tag,
  relativeTime,
} from "@/components/ui";
import { useResource } from "@/lib/useResource";
import type { Lead } from "@/lib/types";

const selectLeads = (body: unknown) => (body as { leads: Lead[] }).leads;

type Filter = "all" | "needs_you" | "in_sequence" | "won" | "problem";

const FILTERS: { key: Filter; label: string; match: (l: Lead) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  {
    key: "needs_you",
    label: "Needs you",
    match: (l) => l.stage === "drafted" || isDue(l),
  },
  {
    key: "in_sequence",
    label: "In sequence",
    match: (l) => l.stage === "contacted" || l.stage === "follow_up",
  },
  {
    key: "won",
    label: "Won",
    match: (l) => ["replied", "interested", "meeting", "client"].includes(l.stage),
  },
  {
    key: "problem",
    label: "Needs attention",
    match: (l) =>
      l.stage === "failed" || (l.research !== null && !l.research.hook),
  },
];

function isDue(lead: Lead): boolean {
  if (!lead.nextTouchAt) return false;
  if (!["contacted", "follow_up"].includes(lead.stage)) return false;
  return Date.parse(lead.nextTouchAt) <= Date.now();
}

export default function LeadsPage() {
  const { revision, notifyMutation, settings } = useAutomation();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // `revision` bumps whenever the worker finishes a job, which re-fetches.
  const { data, loading, reload } = useResource("/api/leads", selectLeads, revision);
  const leads = useMemo(() => data ?? [], [data]);

  const visible = useMemo(() => {
    const match = FILTERS.find((f) => f.key === filter)?.match ?? (() => true);
    const q = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (!match(lead)) return false;
      if (!q) return true;
      return [lead.name, lead.company, lead.website, lead.email, lead.owner]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [leads, filter, query]);

  const selected = leads.find((l) => l.id === selectedId) ?? null;

  const mutate = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        reload();
        notifyMutation();
      }
    },
    [reload, notifyMutation],
  );

  const remove = useCallback(
    async (id: string) => {
      await fetch(`/api/leads/${id}`, { method: "DELETE" });
      setSelectedId(null);
      reload();
      notifyMutation();
    },
    [reload, notifyMutation],
  );

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [f.key, leads.filter(f.match).length]),
      ) as Record<Filter, number>,
    [leads],
  );

  return (
    <div>
      <PageHeader
        title="Outbound"
        description="Every lead, what the research actually found, and where it sits in the pipeline. Drafts are written for you; sending stays manual."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setImportOpen((v) => !v)}
          >
            {importOpen ? "Close importer" : "Import leads"}
          </button>
        }
      />

      {importOpen && (
        <ImportPanel
          onImported={() => {
            setImportOpen(false);
            reload();
            notifyMutation();
          }}
          automationPaused={!settings?.enabled}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`btn btn-sm ${
                filter === f.key ? "btn-primary" : "btn-ghost"
              }`}
            >
              {f.label}
              <span className="mono opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <input
          className="field ml-auto max-w-56"
          placeholder="Search name, company, email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-[13px] text-muted">Loading leads…</div>
      ) : visible.length === 0 ? (
        <EmptyState title={leads.length ? "Nothing matches" : "No leads yet"}>
          {leads.length
            ? "Try a different filter or clear the search."
            : "Paste a lead list to start. The worker researches each one and writes a draft only when it finds something specific to say."}
        </EmptyState>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-[11px] uppercase tracking-wider text-faint">
                <th className="px-4 py-2.5 font-medium">Lead</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">
                  Hook
                </th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">
                  Next touch
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => setSelectedId(lead.id)}
                  className="cursor-pointer hover:bg-surface-2"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{lead.name}</div>
                    <div className="text-[12px] text-muted">
                      {lead.company}
                      {lead.website && ` · ${lead.website}`}
                    </div>
                  </td>
                  <td className="hidden max-w-sm px-4 py-3 md:table-cell">
                    {lead.research?.hook ? (
                      <span className="line-clamp-2 text-[12px] text-muted">
                        {lead.research.hook}
                      </span>
                    ) : lead.research ? (
                      <Tag tone="warn">no hook found</Tag>
                    ) : (
                      <span className="text-[12px] text-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StageTag stage={lead.stage} />
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <span
                      className={`mono text-[12px] ${
                        isDue(lead) ? "text-warn" : "text-faint"
                      }`}
                    >
                      {lead.nextTouchAt ? relativeTime(lead.nextTouchAt) : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <LeadDrawer
          key={`${selected.id}:${selected.updatedAt}`}
          lead={selected}
          onClose={() => setSelectedId(null)}
          onMutate={mutate}
          onDelete={remove}
        />
      )}
    </div>
  );
}
