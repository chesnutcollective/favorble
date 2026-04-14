/**
 * Reciprocal Rank Fusion.
 *
 * Industry-standard way to merge ranked lists from different rankers
 * (BM25 lexical, vector cosine semantic, identifier exact-match) without
 * calibrating scores across wildly different scales. Each ranker
 * contributes `1 / (k + rank)` to the final score for every document it
 * returns. The sum across rankers is the merged score. Higher is better.
 *
 * `k` is a smoothing constant — 60 is the canonical default from the
 * original paper. Higher values flatten the curve so lower-ranked hits
 * still contribute; lower values concentrate the score at the top.
 */

import type { EntityType, SearchResult } from "./types";
import { DEFAULT_TYPE_CAPS } from "./types";

export type RankedList = Array<{
  id: string;
  entityType: EntityType;
  entityId: string;
  row: Omit<SearchResult, "score" | "ranks">;
}>;

export function reciprocalRankFusion(
  lexical: RankedList,
  semantic: RankedList,
  opts: {
    k?: number;
    typeCaps?: Partial<Record<EntityType, number>>;
    maxResults?: number;
    /** Per-entity-affinity boosts applied after fusion. Key is entity id. */
    affinityBoosts?: Record<string, number>;
  } = {},
): SearchResult[] {
  const k = opts.k ?? 60;
  const caps = opts.typeCaps ?? DEFAULT_TYPE_CAPS;
  const maxResults = opts.maxResults ?? 30;
  const boosts = opts.affinityBoosts ?? {};

  const merged = new Map<
    string,
    {
      row: Omit<SearchResult, "score" | "ranks">;
      score: number;
      ranks: { lexical?: number; semantic?: number };
    }
  >();

  for (let i = 0; i < lexical.length; i++) {
    const hit = lexical[i];
    const rank = i + 1;
    const existing = merged.get(hit.id);
    const add = 1 / (k + rank);
    if (existing) {
      existing.score += add;
      existing.ranks.lexical = rank;
    } else {
      merged.set(hit.id, {
        row: hit.row,
        score: add,
        ranks: { lexical: rank },
      });
    }
  }

  for (let i = 0; i < semantic.length; i++) {
    const hit = semantic[i];
    const rank = i + 1;
    const existing = merged.get(hit.id);
    const add = 1 / (k + rank);
    if (existing) {
      existing.score += add;
      existing.ranks.semantic = rank;
    } else {
      merged.set(hit.id, {
        row: hit.row,
        score: add,
        ranks: { semantic: rank },
      });
    }
  }

  // Apply per-entity affinity boosts. Boosts are additive on the
  // normalized-ish RRF score. A "my case" boost of +0.02 meaningfully
  // reshuffles the top 5 without obliterating strong lexical hits.
  for (const entry of merged.values()) {
    const boost = boosts[entry.row.entityId];
    if (boost) entry.score += boost;
  }

  // Normalize to 0..1 for the UI. The max possible RRF score for a
  // single ranker is 1/(k+1) ≈ 0.0164; after boosts plus 2 rankers the
  // practical maximum is small but positive. Normalize by the observed
  // maximum in the batch.
  const scored: SearchResult[] = [];
  let maxScore = 0;
  for (const entry of merged.values()) {
    if (entry.score > maxScore) maxScore = entry.score;
  }
  for (const entry of merged.values()) {
    scored.push({
      ...entry.row,
      score: maxScore > 0 ? entry.score / maxScore : 0,
      ranks: entry.ranks,
    });
  }

  // Sort by fused score descending, then apply per-type caps.
  scored.sort((a, b) => b.score - a.score);

  const perTypeCount = new Map<EntityType, number>();
  const capped: SearchResult[] = [];
  for (const hit of scored) {
    const cap = caps[hit.entityType] ?? 5;
    const count = perTypeCount.get(hit.entityType) ?? 0;
    if (count >= cap) continue;
    perTypeCount.set(hit.entityType, count + 1);
    capped.push(hit);
    if (capped.length >= maxResults) break;
  }

  return capped;
}
