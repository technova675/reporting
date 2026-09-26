"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicAudit } from "@/lib/publicAudit";
import { AuditProgress, AuditReport } from "./AuditReport";
import { rememberAudit } from "./history";

const POLL_MS = 4000;

/**
 * Shows a public audit and keeps it current. While the run is in flight it
 * polls the public endpoint (which also nudges the worker); once it lands the
 * report renders in place and polling stops.
 */
export function PublicAuditLive({
  initial,
  initialPaused,
  bookingUrl,
}: {
  initial: PublicAudit;
  initialPaused: boolean;
  bookingUrl: string | null;
}) {
  const [audit, setAudit] = useState(initial);
  const [paused, setPaused] = useState(initialPaused);
  const inFlight = audit.status === "queued" || audit.status === "running";

  useEffect(() => {
    if (!inFlight) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/public/audits/${initial.id}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { audit: PublicAudit; paused: boolean };
        if (cancelled) return;
        setAudit(data.audit);
        setPaused(data.paused);
      } catch {
        /* transient; the next poll retries */
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [inFlight, initial.id]);

  // Keep this browser's "Past audits" list in step with the server.
  useEffect(() => {
    rememberAudit({
      id: audit.id,
      website: audit.website,
      brand: audit.brandName,
      createdAt: audit.createdAt,
      score: audit.overallScore,
      status: audit.status,
    });
  }, [audit.id, audit.website, audit.brandName, audit.createdAt, audit.overallScore, audit.status]);

  if (inFlight) {
    return (
      <>
        <p className="au-lede">
          Auditing <b>{audit.website}</b>. You can leave this page open or come
          back to this link later — the audit runs on our side either way.
        </p>
        <AuditProgress
          step={audit.progressStep}
          detail={audit.progressDetail}
          queuePosition={audit.queuePosition}
          paused={paused}
        />
      </>
    );
  }

  if (audit.status === "failed") {
    return (
      <div className="au-card">
        <div className="au-error" role="alert">
          The audit of {audit.website} could not be completed. This usually
          means the model service was busy — we retried a few times before
          giving up.
        </div>
        <div className="au-actions">
          <Link href="/audit" className="au-btn-ghost">
            Run another audit
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AuditReport
      audit={audit}
      meta={new Date(audit.createdAt).toLocaleDateString()}
      footer={
        <div className="au-cta">
          <h3>Ready to fix these?</h3>
          <p>
            This audit is the first step of Adbibe&apos;s Growth Audit tier.
            Book a free 15-minute strategy call to turn these findings into a
            plan.
          </p>
          <div className="au-actions">
            {bookingUrl && (
              <a
                href={bookingUrl}
                className="au-btn"
                style={{ flex: 1, minWidth: 180 }}
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a free strategy call →
              </a>
            )}
            <Link href="/audit" className="au-btn-ghost">
              Run another audit
            </Link>
          </div>
        </div>
      }
    />
  );
}
