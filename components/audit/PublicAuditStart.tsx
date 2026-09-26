"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { AuditForm } from "./AuditForm";
import type { AuditFormValues } from "./AuditForm";
import { scoreColor } from "./AuditReport";
import { readHistory, rememberAudit } from "./history";
import type { HistoryEntry } from "./history";

const NO_HISTORY: HistoryEntry[] = [];
let cached: { raw: string; list: HistoryEntry[] } | null = null;

/** Snapshot must be referentially stable between renders, so memoize on the raw JSON. */
function historySnapshot(): HistoryEntry[] {
  const list = readHistory();
  const raw = JSON.stringify(list);
  if (!cached || cached.raw !== raw) cached = { raw, list };
  return cached.list;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function PublicAuditStart() {
  const router = useRouter();
  const history = useSyncExternalStore(subscribe, historySnapshot, () => NO_HISTORY);

  async function start(values: AuditFormValues): Promise<string | null> {
    const res = await fetch("/api/public/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string | null;
      error?: string;
    };
    if (!res.ok) return data.error ?? "The audit could not be started. Please try again.";
    if (!data.id) return null;

    rememberAudit({
      id: data.id,
      website: values.website.trim(),
      brand: values.brand.trim() || null,
      createdAt: new Date().toISOString(),
      score: null,
      status: "queued",
    });
    router.push(`/audit/${data.id}`);
    return null;
  }

  return (
    <>
      <AuditForm onSubmit={start} withHoneypot busyLabel="Starting your audit…" />

      <section className="au-history">
        <h3>Past audits</h3>
        {history.length === 0 ? (
          <p className="au-empty">No audits run yet.</p>
        ) : (
          history.map((entry) => (
            <Link key={entry.id} href={`/audit/${entry.id}`} className="au-hist-item">
              <div style={{ minWidth: 0 }}>
                <div className="au-hist-name">{entry.brand || entry.website}</div>
                <div className="au-hist-date">
                  {new Date(entry.createdAt).toLocaleDateString()} · {entry.website}
                </div>
              </div>
              <div className="au-hist-right">
                {entry.status !== "complete" && (
                  <span className="au-status" data-s={entry.status}>
                    {entry.status}
                  </span>
                )}
                <span className="au-hist-score" style={{ color: scoreColor(entry.score) }}>
                  {entry.score ?? "—"}
                </span>
              </div>
            </Link>
          ))
        )}
      </section>
    </>
  );
}
