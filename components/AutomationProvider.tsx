"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { AutomationSettings, Batch, Job } from "@/lib/types";
import type { Stats } from "@/lib/stats";

/**
 * Client-side driver for the worker.
 *
 * The queue itself lives on the server; this just keeps a heartbeat going while
 * the console is open so an operator sees a batch drain in front of them. The
 * unattended path is the same `/api/automation/tick` endpoint on a scheduler —
 * nothing here is load-bearing for correctness.
 */

interface Snapshot {
  settings: AutomationSettings | null;
  hasApiKey: boolean;
  pending: boolean;
  jobs: Job[];
  batches: Batch[];
  stats: Stats | null;
}

interface AutomationContextValue extends Snapshot {
  loading: boolean;
  error: string | null;
  /** Bumps whenever server state changed, so lists know to refetch. */
  revision: number;
  refresh: () => Promise<void>;
  runTickNow: () => Promise<void>;
  updateSettings: (patch: Partial<AutomationSettings>) => Promise<void>;
  clearFinishedJobs: () => Promise<void>;
  notifyMutation: () => void;
}

const EMPTY: Snapshot = {
  settings: null,
  hasApiKey: false,
  pending: false,
  jobs: [],
  batches: [],
  stats: null,
};

const AutomationContext = createContext<AutomationContextValue | null>(null);

/** Poll fast while work is draining, slowly when the queue is idle. */
const ACTIVE_POLL_MS = 2500;
const IDLE_POLL_MS = 20_000;

export function AutomationProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  // Ticking is async and slower than the poll interval; this stops a backlog of
  // overlapping ticks building up if one request is slow.
  const ticking = useRef(false);
  const mounted = useRef(true);

  const apply = useCallback((next: Partial<Snapshot>) => {
    if (!mounted.current) return;
    setSnapshot((prev) => ({ ...prev, ...next }));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/automation", { cache: "no-store" });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = (await res.json()) as Snapshot;
      apply(data);
      setError(null);
    } catch (err) {
      if (mounted.current) {
        setError(
          err instanceof Error ? err.message : "Could not reach the server.",
        );
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [apply]);

  const runTickNow = useCallback(async () => {
    if (ticking.current) return;
    ticking.current = true;
    try {
      const res = await fetch("/api/automation/tick", { method: "POST" });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = (await res.json()) as {
        ran: number;
        pending: boolean;
        jobs: Job[];
        stats: Stats;
      };
      apply({ pending: data.pending, jobs: data.jobs, stats: data.stats });
      // A completed job means leads or audits changed underneath the open page.
      if (data.ran > 0) setRevision((r) => r + 1);
      setError(null);
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : "Tick failed.");
      }
    } finally {
      ticking.current = false;
    }
  }, [apply]);

  const updateSettings = useCallback(
    async (patch: Partial<AutomationSettings>) => {
      const res = await fetch("/api/automation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Could not save settings.");
      const data = (await res.json()) as { settings: AutomationSettings };
      apply({ settings: data.settings });
    },
    [apply],
  );

  const clearFinishedJobs = useCallback(async () => {
    await fetch("/api/automation", { method: "DELETE" });
    await refresh();
  }, [refresh]);

  const notifyMutation = useCallback(() => {
    setRevision((r) => r + 1);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    // Deferred to a microtask so the first snapshot never lands synchronously
    // inside the effect body.
    Promise.resolve().then(refresh);
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  // The heartbeat: one interval that both advances the queue and re-reads state.
  useEffect(() => {
    const active = snapshot.pending && (snapshot.settings?.enabled ?? false);
    const delay = active
      ? Math.min(
          ACTIVE_POLL_MS,
          (snapshot.settings?.tickIntervalSec ?? 5) * 1000,
        )
      : IDLE_POLL_MS;

    const timer = setInterval(() => {
      if (active) void runTickNow();
      else void refresh();
    }, delay);

    return () => clearInterval(timer);
  }, [
    snapshot.pending,
    snapshot.settings?.enabled,
    snapshot.settings?.tickIntervalSec,
    runTickNow,
    refresh,
  ]);

  return (
    <AutomationContext.Provider
      value={{
        ...snapshot,
        loading,
        error,
        revision,
        refresh,
        runTickNow,
        updateSettings,
        clearFinishedJobs,
        notifyMutation,
      }}
    >
      {children}
    </AutomationContext.Provider>
  );
}

export function useAutomation(): AutomationContextValue {
  const ctx = useContext(AutomationContext);
  if (!ctx) {
    throw new Error("useAutomation must be used inside an AutomationProvider.");
  }
  return ctx;
}
