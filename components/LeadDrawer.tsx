"use client";

import { useEffect, useState } from "react";
import { StageTag, Tag, relativeTime, stageLabel } from "./ui";
import type { Lead, LeadStage } from "@/lib/types";

/**
 * Detail panel for a single lead: what the research found, the drafts, and the
 * stage controls. The stage buttons are the only way the funnel moves — the
 * engine never advances a lead past "drafted" on its own.
 */

const NEXT_STAGES: Partial<Record<LeadStage, LeadStage[]>> = {
  drafted: ["contacted"],
  contacted: ["follow_up", "replied", "lost"],
  follow_up: ["follow_up", "replied", "lost"],
  replied: ["interested", "lost"],
  interested: ["meeting", "lost"],
  meeting: ["client", "lost"],
};

const SEQUENCE_LABELS = ["Day 0 · Initial", "Day 3 · Follow-up 1", "Day 7 · Follow-up 2"];

interface Props {
  lead: Lead;
  onClose: () => void;
  onMutate: (id: string, body: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/**
 * The parent keys this on the lead's `updatedAt`, so when the worker finishes
 * research while the drawer is open it remounts with the new drafts rather than
 * syncing them in an effect.
 */
export function LeadDrawer({ lead, onClose, onMutate, onDelete }: Props) {
  const [subject, setSubject] = useState(lead.drafts?.emailSubject ?? "");
  const [body, setBody] = useState(lead.drafts?.emailBody ?? "");
  const [linkedin, setLinkedin] = useState(lead.drafts?.linkedinMessage ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dirty =
    subject !== (lead.drafts?.emailSubject ?? "") ||
    body !== (lead.drafts?.emailBody ?? "") ||
    linkedin !== (lead.drafts?.linkedinMessage ?? "");

  async function saveDrafts() {
    setSaving(true);
    await onMutate(lead.id, {
      drafts: {
        emailSubject: subject,
        emailBody: body,
        linkedinMessage: linkedin,
      },
    });
    setSaving(false);
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-line bg-surface">
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-line bg-surface px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold">{lead.name}</h2>
            <p className="text-[12px] text-muted">
              {lead.company}
              {lead.website && ` · ${lead.website}`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StageTag stage={lead.stage} />
              {lead.research?.service && (
                <Tag tone="accent">{lead.research.service}</Tag>
              )}
              {lead.owner !== "unassigned" && <Tag>{lead.owner}</Tag>}
            </div>
          </div>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="flex-1 space-y-5 px-5 py-5">
          {lead.error && (
            <div className="rounded-md bg-danger-soft px-3 py-2.5 text-[12px] text-danger">
              <b>Research failed:</b> {lead.error}
            </div>
          )}

          {/* Research */}
          <section>
            <SectionLabel>Research</SectionLabel>
            {!lead.research ? (
              <p className="text-[13px] text-muted">
                {lead.stage === "researching"
                  ? "Researching now…"
                  : "Not researched yet."}
              </p>
            ) : (
              <>
                <p className="text-[13px] leading-relaxed">
                  {lead.research.summary}
                </p>
                {lead.research.hook ? (
                  <div className="mt-3 rounded-md border-l-2 border-accent bg-accent-soft px-3 py-2.5">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-accent-text">
                      The hook
                    </div>
                    <p className="mt-1 text-[13px]">{lead.research.hook}</p>
                  </div>
                ) : (
                  <div className="mt-3 rounded-md bg-warn-soft px-3 py-2.5 text-[12px] text-warn">
                    No hook cleared the bar, so no drafts were written. Sending a
                    generic email here costs more than sending nothing — either
                    re-run the research or work this one by hand.
                  </div>
                )}
                {lead.research.sources.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[12px] text-muted">
                      {lead.research.sources.length} source
                      {lead.research.sources.length === 1 ? "" : "s"}
                    </summary>
                    <ul className="mono mt-2 space-y-1 text-[11px]">
                      {lead.research.sources.map((url) => (
                        <li key={url} className="truncate">
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent-text hover:underline"
                          >
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </section>

          {/* Drafts */}
          {lead.drafts && (
            <section>
              <div className="flex items-center justify-between">
                <SectionLabel>Drafts</SectionLabel>
                {dirty && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={saveDrafts}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save edits"}
                  </button>
                )}
              </div>

              <label className="mt-1 block text-[11px] text-faint">Subject</label>
              <input
                className="field mt-1"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />

              <label className="mt-3 block text-[11px] text-faint">Email</label>
              <textarea
                className="field mt-1 min-h-32"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-quiet btn-sm mt-1"
                onClick={() => copy(`${subject}\n\n${body}`, "email")}
              >
                {copied === "email" ? "Copied" : "Copy email"}
              </button>

              <label className="mt-3 block text-[11px] text-faint">
                LinkedIn message
              </label>
              <textarea
                className="field mt-1 min-h-20"
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-quiet btn-sm mt-1"
                onClick={() => copy(linkedin, "li")}
              >
                {copied === "li" ? "Copied" : "Copy message"}
              </button>

              <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-[12px] text-muted">
                Copy and send these yourself. Nothing here sends email, and
                automating LinkedIn messages outside their official API breaks
                LinkedIn&apos;s terms and risks the account.
              </p>
            </section>
          )}

          {/* Sequence */}
          {["contacted", "follow_up"].includes(lead.stage) && (
            <section>
              <SectionLabel>Sequence</SectionLabel>
              <div className="flex gap-2">
                {SEQUENCE_LABELS.map((label, i) => (
                  <div
                    key={label}
                    className={`flex-1 rounded-md border px-2.5 py-2 text-center text-[11px] ${
                      i === lead.sequenceStep
                        ? "border-accent bg-accent-soft text-accent-text"
                        : i < lead.sequenceStep
                          ? "border-line bg-surface-2 text-faint"
                          : "border-line text-muted"
                    }`}
                  >
                    {label}
                  </div>
                ))}
              </div>
              {lead.nextTouchAt && (
                <p className="mono mt-2 text-[12px] text-muted">
                  Next touch due {relativeTime(lead.nextTouchAt)}
                </p>
              )}
            </section>
          )}

          {/* Stage controls */}
          <section>
            <SectionLabel>Move to</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {(NEXT_STAGES[lead.stage] ?? []).map((stage) => (
                <button
                  key={stage}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onMutate(lead.id, { stage })}
                >
                  {stage === "follow_up" && lead.stage === "follow_up"
                    ? "Sent next follow-up"
                    : stage === "contacted"
                      ? "Sent — mark contacted"
                      : stageLabel(stage)}
                </button>
              ))}
              {(NEXT_STAGES[lead.stage] ?? []).length === 0 && (
                <p className="text-[13px] text-muted">
                  {lead.stage === "client"
                    ? "Won. Nothing left to move."
                    : "No stage moves available from here."}
                </p>
              )}
            </div>
          </section>

          {/* Notes + history */}
          <section>
            <SectionLabel>Add a note</SectionLabel>
            <div className="flex gap-2">
              <input
                className="field"
                placeholder="What happened?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!note.trim()}
                onClick={async () => {
                  await onMutate(lead.id, { note });
                  setNote("");
                }}
              >
                Add
              </button>
            </div>
          </section>

          <section>
            <SectionLabel>History</SectionLabel>
            <ul className="space-y-2">
              {[...lead.events].reverse().map((event, i) => (
                <li key={`${event.at}-${i}`} className="flex gap-3 text-[12px]">
                  <span className="mono w-14 shrink-0 text-faint">
                    {relativeTime(event.at)}
                  </span>
                  <span className="text-muted">
                    {describeEvent(event.type, event.from, event.to)}
                    {event.detail && (
                      <span className="block text-faint">{event.detail}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-line bg-surface px-5 py-3">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onMutate(lead.id, { requeueResearch: true })}
          >
            Re-run research
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm text-danger"
            onClick={() => onDelete(lead.id)}
          >
            Delete lead
          </button>
        </footer>
      </aside>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">
      {children}
    </h3>
  );
}

function describeEvent(
  type: string,
  from?: LeadStage,
  to?: LeadStage,
): string {
  switch (type) {
    case "created":
      return "Imported into the pipeline";
    case "research_started":
      return "Research started";
    case "research_complete":
      return "Research complete";
    case "research_failed":
      return "Research failed";
    case "stage_change":
      return `Moved ${from ? stageLabel(from) : "?"} → ${to ? stageLabel(to) : "?"}`;
    case "draft_edited":
      return "Drafts edited";
    default:
      return "Note";
  }
}
