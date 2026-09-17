"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Fetches a JSON endpoint on mount and whenever `revision` changes.
 *
 * Extracted so every list page shares one loading/erroring story, and so the
 * state updates happen inside an async callback rather than synchronously in an
 * effect body.
 */
export function useResource<T>(
  url: string,
  select: (body: unknown) => T,
  revision: number,
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    fetch(url, { cache: "no-store", signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        return res.json();
      })
      .then((body: unknown) => {
        setData(select(body));
        setError(null);
      })
      .catch((err: unknown) => {
        // An abort is a navigation, not a failure worth showing.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Request failed.");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
    // `select` is expected to be a stable module-level function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, revision, nonce]);

  return { data, loading, error, reload };
}
