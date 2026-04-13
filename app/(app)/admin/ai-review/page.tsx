import type { Metadata } from "next";
import {
  getFacetCounts,
  getNextEntry,
  getReviewEntriesV2,
} from "@/app/actions/ai-review";
import {
  decodeStateFromUrl,
} from "@/lib/ai-review/saved-views";
import { AiReviewWorkspace } from "./workspace";

export const metadata: Metadata = {
  title: "AI Review Queue",
};

/**
 * Server entry — decodes state from the URL, fires the initial data
 * fetches in parallel, and hands everything to the workspace client.
 *
 * The URL is the canonical state container:
 *   ?mode=focus|table|canvas&view=triage&q=case:HS-05827+confidence:<60
 */
export default async function AiReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") params.set(k, v);
    else if (Array.isArray(v) && v[0]) params.set(k, v[0]);
  }
  const decoded = decodeStateFromUrl(params);

  const [facets, initialFocusEntry, initialList] = await Promise.all([
    getFacetCounts(decoded.query),
    decoded.mode === "focus"
      ? getNextEntry(decoded.query)
      : Promise.resolve(null),
    decoded.mode !== "focus"
      ? getReviewEntriesV2({ ...decoded.query, pageSize: 50 })
      : Promise.resolve({ entries: [], totalCount: 0, hasMore: false }),
  ]);

  return (
    <AiReviewWorkspace
      initialMode={decoded.mode}
      initialView={decoded.view}
      initialQuery={decoded.query}
      initialFacets={facets}
      initialFocusEntry={initialFocusEntry}
      initialList={initialList}
    />
  );
}
