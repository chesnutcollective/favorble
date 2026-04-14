import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { logger } from "@/lib/logger/server";

// ---------------------------------------------------------------------------
// Configuration constants
// ---------------------------------------------------------------------------

/**
 * Average hourly rate ($/hr) used to translate hours saved into dollars. A
 * conservative "loaded" rate that accounts for salary + benefits + overhead
 * for paralegal / case-manager work.
 */
export const AI_HOURLY_RATE_USD = 75;

/**
 * Baseline author-time (in minutes) assumed for a single AI-assisted draft.
 * If the humans had to write the same message from scratch, we estimate it
 * would take roughly this long.
 */
export const AVG_MINUTES_PER_DRAFT = 12;

/**
 * When a staff member edits an AI draft, some of the "saved time" is clawed
 * back. We model this as a linear penalty against the mean edit distance
 * (capped at 1.0). A fully rewritten draft (editDistance = 1.0) is treated
 * as saving only REWRITE_FLOOR_RATIO of the baseline.
 */
export const REWRITE_FLOOR_RATIO = 0.2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AiSavings = {
  hoursSaved: number;
  dollarsSaved: number;
  aiEnabledCases: number;
  approvedDraftCount: number;
};

const EMPTY: AiSavings = {
  hoursSaved: 0,
  dollarsSaved: 0,
  aiEnabledCases: 0,
  approvedDraftCount: 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(n: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/**
 * Compute the savings multiplier from a mean edit-distance in [0, 1].
 *
 *   distance = 0   → saved full baseline (multiplier = 1)
 *   distance = 1   → saved only REWRITE_FLOOR_RATIO of baseline
 *   linear in between
 */
function savingsMultiplier(meanEditDistance: number): number {
  const clamped = Math.max(0, Math.min(1, meanEditDistance));
  return 1 - clamped * (1 - REWRITE_FLOOR_RATIO);
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Compute AI-assisted authoring savings for an organization over the last
 * `sinceDays` days. Gracefully degrades to zeros when the `ai_drafts` table
 * is absent (fresh environment, pre-migration) or the DB is unreachable.
 */
export async function getAiSavings(
  organizationId: string,
  sinceDays = 7,
): Promise<AiSavings> {
  if (!organizationId) return EMPTY;

  const since = new Date(Date.now() - sinceDays * 86400 * 1000);

  try {
    // We query via raw SQL + to_regclass so we can detect a missing table
    // without the query itself throwing. Older environments will not yet
    // have ai_drafts and should silently return zeros.
    const existsResult = await db.execute<{ exists: boolean }>(sql`
      SELECT to_regclass('public.ai_drafts') IS NOT NULL AS exists
    `);
    const tableExists = Boolean(
      // drizzle-orm's execute returns an array-like result set
      (existsResult as unknown as Array<{ exists: boolean }>)[0]?.exists,
    );
    if (!tableExists) return EMPTY;

    const rows = await db.execute<{
      approved_drafts: string | number;
      ai_enabled_cases: string | number;
      mean_edit_distance: string | number | null;
    }>(sql`
      SELECT
        COUNT(*)::bigint AS approved_drafts,
        COUNT(DISTINCT case_id)::bigint AS ai_enabled_cases,
        AVG(
          COALESCE(NULLIF(edit_distance, 'NaN'::float8), 0)
        )::float8 AS mean_edit_distance
      FROM ai_drafts
      WHERE organization_id = ${organizationId}
        AND status = 'approved'
        AND created_at >= ${since.toISOString()}
    `);

    const row = (rows as unknown as Array<{
      approved_drafts: string | number;
      ai_enabled_cases: string | number;
      mean_edit_distance: string | number | null;
    }>)[0];

    if (!row) return EMPTY;

    const approvedDraftCount = Number(row.approved_drafts) || 0;
    const aiEnabledCases = Number(row.ai_enabled_cases) || 0;
    const meanEditDistance = Number(row.mean_edit_distance ?? 0) || 0;

    if (approvedDraftCount === 0) return EMPTY;

    const rawMinutes = approvedDraftCount * AVG_MINUTES_PER_DRAFT;
    const effectiveMinutes = rawMinutes * savingsMultiplier(meanEditDistance);
    const hoursSaved = round(effectiveMinutes / 60, 1);
    const dollarsSaved = Math.round(hoursSaved * AI_HOURLY_RATE_USD);

    return {
      hoursSaved,
      dollarsSaved,
      aiEnabledCases,
      approvedDraftCount,
    };
  } catch (error) {
    logger.error("Failed to compute AI savings", { organizationId, error });
    return EMPTY;
  }
}
