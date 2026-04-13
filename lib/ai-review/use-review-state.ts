"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  decodeStateFromUrl,
  encodeStateToUrl,
} from "@/lib/ai-review/saved-views";
import type { ReviewMode, ReviewQuery } from "@/lib/ai-review/types";

/**
 * Single source of truth for the AI Review Queue's UI state.
 *
 * - URL is canonical: ?mode=focus&view=triage&q=case:HS-05827
 * - Updates use the History API (replaceState) so back/forward work.
 * - Mode + query + view are derived from the URL on every render.
 *
 * Three update primitives:
 *   setMode(mode)            switch focus ↔ table ↔ canvas
 *   setQuery(query)          replace the structured query (e.g. from chips)
 *   setQueryString(string)   parse and replace (from the bar input)
 */
export function useReviewState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Snapshot the URL once per render — re-derive on each.
  const params = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );
  const decoded = useMemo(() => decodeStateFromUrl(params), [params]);

  const replace = useCallback(
    (next: { mode?: ReviewMode; query?: ReviewQuery; view?: string }) => {
      const merged = {
        mode: next.mode ?? decoded.mode,
        query: next.query ?? decoded.query,
        view: next.view ?? decoded.view,
      };
      const search = encodeStateToUrl(merged);
      startTransition(() => {
        router.replace(`${pathname}${search}`, { scroll: false });
      });
    },
    [decoded, pathname, router],
  );

  const setMode = useCallback(
    (mode: ReviewMode) => replace({ mode }),
    [replace],
  );
  const setQuery = useCallback(
    (query: ReviewQuery) => replace({ query, view: undefined }),
    [replace],
  );
  const setView = useCallback(
    (view: string | undefined) => replace({ view }),
    [replace],
  );

  return {
    mode: decoded.mode,
    query: decoded.query,
    activeViewId: decoded.view,
    setMode,
    setQuery,
    setView,
    isPending,
  };
}

/**
 * Generic "fetch on query change" helper. Every mode uses the same
 * server action, so this hook centralizes debounce + abort + loading.
 *
 * Caller passes the fetcher; we handle the rest.
 */
export function useFetchOnQuery<T>(
  query: ReviewQuery,
  fetcher: (q: ReviewQuery) => Promise<T>,
  debounceMs = 200,
): { data: T | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // Stringify once for the dep array — ReviewQuery objects re-create each
  // render, but the canonical string only changes when filters do.
  const key = JSON.stringify(query);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const next = await fetcher(query);
        if (!cancelled) setData(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [key, reloadToken]);

  return { data, loading, reload: () => setReloadToken((t) => t + 1) };
}
