/**
 * The "Past audits" list on the public page. Per-browser convenience only —
 * the audits themselves live on the server; this just remembers which ids
 * this visitor started. Storage can be unavailable (private mode, blocked
 * site data), so every access is guarded and failure means an empty list.
 */

export interface HistoryEntry {
  id: string;
  website: string;
  brand: string | null;
  createdAt: string;
  score: number | null;
  status: string;
}

const KEY = "adbibe:audit-history";

export function readHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberAudit(entry: HistoryEntry): void {
  try {
    const rest = readHistory().filter((e) => e.id !== entry.id);
    window.localStorage.setItem(KEY, JSON.stringify([entry, ...rest].slice(0, 20)));
  } catch {
    /* best effort */
  }
}
