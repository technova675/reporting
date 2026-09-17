"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-renders a server page on an interval. Used on the audit detail page while
 * a run is still in flight, so the result appears without a manual reload.
 */
export function AutoRefresh({ everyMs = 4000 }: { everyMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);

  return null;
}
