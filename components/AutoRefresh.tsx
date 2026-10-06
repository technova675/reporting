"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-renders a server page on an interval. Used on the audit detail page while
 * a run is still in flight, so the result appears without a manual reload.
 *
 * `pingUrl`, when given, is fetched first on each interval. It must be a route
 * handler: work started from a page render's after() is not reliably kept
 * alive on Vercel, so anything that moves a job forward belongs there.
 */
export function AutoRefresh({
  everyMs = 4000,
  pingUrl,
}: {
  everyMs?: number;
  pingUrl?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(async () => {
      if (pingUrl) await fetch(pingUrl, { cache: "no-store" }).catch(() => undefined);
      router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs, pingUrl]);

  return null;
}
