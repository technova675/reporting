"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { useAutomation } from "./AutomationProvider";

const NAV = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/leads", label: "Outbound" },
  { href: "/admin/audits", label: "Audits" },
  { href: "/admin/automation", label: "Automation" },
  { href: "/admin/blueprint", label: "Blueprint" },
  { href: "/admin/settings", label: "Settings" },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <Brand />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setNavOpen((v) => !v)}
          aria-expanded={navOpen}
        >
          {navOpen ? "Close" : "Menu"}
        </button>
      </header>

      <nav
        className={`${
          navOpen ? "block" : "hidden"
        } shrink-0 border-b border-line bg-surface px-3 py-3 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-56 lg:border-r lg:border-b-0 lg:px-3 lg:py-5`}
      >
        <div className="mb-5 hidden px-2 lg:block">
          <Brand />
        </div>
        <ul className="flex flex-wrap gap-1 lg:flex-col lg:gap-0.5">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setNavOpen(false)}
                  className={`block rounded-md px-3 py-2 text-[13px] font-medium ${
                    active
                      ? "bg-accent-soft text-accent-text"
                      : "text-muted hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 hidden lg:block">
          <WorkerStatus />
        </div>
      </nav>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2">
      <span className="grid h-6 w-6 place-items-center rounded bg-accent text-[12px] font-bold text-white">
        A
      </span>
      <span className="text-[13px] font-semibold tracking-tight">
        Adbibe Console
      </span>
    </Link>
  );
}

/** The one place the operator can see whether the worker is actually alive. */
function WorkerStatus() {
  const { settings, pending, hasApiKey, stats, error } = useAutomation();

  const state = !hasApiKey
    ? { label: "No API key", tone: "text-danger", dot: "bg-danger" }
    : error
      ? { label: "Disconnected", tone: "text-danger", dot: "bg-danger" }
      : !settings?.enabled
        ? { label: "Paused", tone: "text-muted", dot: "bg-faint" }
        : pending
          ? { label: "Working", tone: "text-info", dot: "bg-info live-dot" }
          : { label: "Idle", tone: "text-ok", dot: "bg-ok" };

  const queued = stats?.jobs.queued ?? 0;
  const running = stats?.jobs.running ?? 0;

  return (
    <div className="rounded-md border border-line bg-surface-2 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${state.dot}`} />
        <span className={`text-[12px] font-medium ${state.tone}`}>
          {state.label}
        </span>
      </div>
      <div className="mono mt-1.5 text-[11px] text-faint">
        {running} running · {queued} queued
      </div>
    </div>
  );
}
