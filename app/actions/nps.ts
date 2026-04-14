"use server";

import { db } from "@/db/drizzle";
import {
  npsResponses,
  npsActionItems,
  npsCampaigns,
  cases,
  contacts,
  users,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, desc, eq, gte, sql } from "drizzle-orm";

/**
 * Hard-coded industry benchmark NPS for legal services.
 * Used for comparison on the overview page until a real benchmark feed
 * is wired up.
 */
const INDUSTRY_BENCHMARK_NPS = 35;

export type NpsCategory = "promoter" | "passive" | "detractor";

export type NpsOverview = {
  npsScore: number;
  totalResponses: number;
  promoters: number;
  passives: number;
  detractors: number;
  promoterPct: number;
  passivePct: number;
  detractorPct: number;
  topPositiveComments: { id: string; score: number; comment: string }[];
  topNegativeComments: { id: string; score: number; comment: string }[];
  trend: { date: string; score: number; responses: number }[];
  periodDays: number;
  industryBenchmark: number;
};

export type NpsResponseRow = {
  id: string;
  score: number;
  category: NpsCategory;
  comment: string | null;
  caseId: string;
  caseNumber: string | null;
  claimantName: string | null;
  respondedAt: string | null;
  channel: string;
};

export type NpsActionItemRow = {
  id: string;
  responseId: string;
  status: "open" | "in_progress" | "resolved";
  assigneeName: string | null;
  notes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  score: number | null;
  caseNumber: string | null;
};

export type NpsResponseFilters = {
  category?: NpsCategory;
  periodDays?: number;
};

export type NpsActionItemFilters = {
  status?: "open" | "in_progress" | "resolved";
};

function periodCutoff(periodDays: number): Date | null {
  if (!Number.isFinite(periodDays) || periodDays <= 0) return null;
  return new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
}

/**
 * Overview metrics — headline NPS, distribution, trend, top comments.
 *
 * period = number of days back (0 / negative = all time). Defaults to 90.
 */
export async function getNpsOverview(period = 90): Promise<NpsOverview> {
  const session = await requireSession();
  const cutoff = periodCutoff(period);

  const baseConds = [eq(npsResponses.organizationId, session.organizationId)];
  if (cutoff) {
    baseConds.push(gte(npsResponses.createdAt, cutoff));
  }

  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  let totalResponses = 0;
  let topPositiveComments: NpsOverview["topPositiveComments"] = [];
  let topNegativeComments: NpsOverview["topNegativeComments"] = [];
  let trend: NpsOverview["trend"] = [];

  try {
    const buckets = await db
      .select({
        category: npsResponses.category,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(npsResponses)
      .where(and(...baseConds))
      .groupBy(npsResponses.category);

    for (const row of buckets) {
      const c = Number(row.count);
      if (row.category === "promoter") promoters = c;
      else if (row.category === "passive") passives = c;
      else if (row.category === "detractor") detractors = c;
    }
    totalResponses = promoters + passives + detractors;

    // Top 3 positive comments (highest score, non-empty)
    const positive = await db
      .select({
        id: npsResponses.id,
        score: npsResponses.score,
        comment: npsResponses.comment,
      })
      .from(npsResponses)
      .where(
        and(
          ...baseConds,
          sql`${npsResponses.comment} IS NOT NULL`,
          sql`TRIM(${npsResponses.comment}) <> ''`,
          eq(npsResponses.category, "promoter"),
        ),
      )
      .orderBy(desc(npsResponses.score), desc(npsResponses.createdAt))
      .limit(3);

    topPositiveComments = positive
      .filter((r) => r.comment !== null)
      .map((r) => ({ id: r.id, score: r.score, comment: r.comment as string }));

    // Top 3 negative comments (lowest score, non-empty)
    const negative = await db
      .select({
        id: npsResponses.id,
        score: npsResponses.score,
        comment: npsResponses.comment,
      })
      .from(npsResponses)
      .where(
        and(
          ...baseConds,
          sql`${npsResponses.comment} IS NOT NULL`,
          sql`TRIM(${npsResponses.comment}) <> ''`,
          eq(npsResponses.category, "detractor"),
        ),
      )
      .orderBy(npsResponses.score, desc(npsResponses.createdAt))
      .limit(3);

    topNegativeComments = negative
      .filter((r) => r.comment !== null)
      .map((r) => ({ id: r.id, score: r.score, comment: r.comment as string }));

    // 90-day score trend (daily buckets)
    const trendCutoff = periodCutoff(90) ?? new Date(0);
    const trendRows = await db.execute<{
      day: string;
      promoters: number;
      detractors: number;
      total: number;
    }>(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
        SUM(CASE WHEN category = 'promoter' THEN 1 ELSE 0 END)::int AS promoters,
        SUM(CASE WHEN category = 'detractor' THEN 1 ELSE 0 END)::int AS detractors,
        COUNT(*)::int AS total
      FROM nps_responses
      WHERE organization_id = ${session.organizationId}
        AND created_at >= ${trendCutoff}
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY DATE_TRUNC('day', created_at) ASC
    `);

    trend = trendRows.map((r) => {
      const total = Number(r.total);
      const p = Number(r.promoters);
      const d = Number(r.detractors);
      const score = total > 0 ? Math.round(((p - d) / total) * 100) : 0;
      return { date: r.day, score, responses: total };
    });
  } catch {
    // DB unavailable — render empty overview.
  }

  const promoterPct =
    totalResponses > 0 ? (promoters / totalResponses) * 100 : 0;
  const passivePct = totalResponses > 0 ? (passives / totalResponses) * 100 : 0;
  const detractorPct =
    totalResponses > 0 ? (detractors / totalResponses) * 100 : 0;
  const npsScore =
    totalResponses > 0
      ? Math.round(((promoters - detractors) / totalResponses) * 100)
      : 0;

  return {
    npsScore,
    totalResponses,
    promoters,
    passives,
    detractors,
    promoterPct,
    passivePct,
    detractorPct,
    topPositiveComments,
    topNegativeComments,
    trend,
    periodDays: period,
    industryBenchmark: INDUSTRY_BENCHMARK_NPS,
  };
}

/**
 * Paginated-ish list of NPS responses with case + claimant info joined.
 * Callers typically filter by category to power the per-tab list.
 */
export async function getNpsResponses(
  filters: NpsResponseFilters = {},
): Promise<NpsResponseRow[]> {
  const session = await requireSession();
  const cutoff = periodCutoff(filters.periodDays ?? 0);

  const conds = [eq(npsResponses.organizationId, session.organizationId)];
  if (filters.category) {
    conds.push(eq(npsResponses.category, filters.category));
  }
  if (cutoff) {
    conds.push(gte(npsResponses.createdAt, cutoff));
  }

  try {
    const rows = await db
      .select({
        id: npsResponses.id,
        score: npsResponses.score,
        category: npsResponses.category,
        comment: npsResponses.comment,
        respondedAt: npsResponses.respondedAt,
        channel: npsResponses.channel,
        caseId: npsResponses.caseId,
        caseNumber: cases.caseNumber,
        claimantFirst: contacts.firstName,
        claimantLast: contacts.lastName,
      })
      .from(npsResponses)
      .leftJoin(cases, eq(cases.id, npsResponses.caseId))
      .leftJoin(contacts, eq(contacts.id, npsResponses.contactId))
      .where(and(...conds))
      .orderBy(desc(npsResponses.createdAt))
      .limit(250);

    return rows.map((r) => {
      const claimantName =
        [r.claimantFirst, r.claimantLast].filter(Boolean).join(" ").trim() ||
        null;
      return {
        id: r.id,
        score: r.score,
        category: r.category as NpsCategory,
        comment: r.comment,
        caseId: r.caseId,
        caseNumber: r.caseNumber ?? null,
        claimantName,
        respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
        channel: r.channel,
      };
    });
  } catch {
    return [];
  }
}

/**
 * NPS action items — follow-up items opened from responses.
 */
export async function getNpsActionItems(
  filters: NpsActionItemFilters = {},
): Promise<NpsActionItemRow[]> {
  const session = await requireSession();

  const conds = [eq(npsResponses.organizationId, session.organizationId)];
  if (filters.status) {
    conds.push(eq(npsActionItems.status, filters.status));
  }

  try {
    const rows = await db
      .select({
        id: npsActionItems.id,
        responseId: npsActionItems.responseId,
        status: npsActionItems.status,
        notes: npsActionItems.notes,
        resolvedAt: npsActionItems.resolvedAt,
        createdAt: npsActionItems.createdAt,
        assigneeFirst: users.firstName,
        assigneeLast: users.lastName,
        score: npsResponses.score,
        caseNumber: cases.caseNumber,
      })
      .from(npsActionItems)
      .innerJoin(npsResponses, eq(npsResponses.id, npsActionItems.responseId))
      .leftJoin(users, eq(users.id, npsActionItems.assignedToUserId))
      .leftJoin(cases, eq(cases.id, npsResponses.caseId))
      .where(and(...conds))
      .orderBy(desc(npsActionItems.createdAt))
      .limit(250);

    return rows.map((r) => {
      const assigneeName =
        [r.assigneeFirst, r.assigneeLast].filter(Boolean).join(" ").trim() ||
        null;
      return {
        id: r.id,
        responseId: r.responseId,
        status: r.status as NpsActionItemRow["status"],
        assigneeName,
        notes: r.notes,
        resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        score: r.score ?? null,
        caseNumber: r.caseNumber ?? null,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Stub — mark an action item resolved. Full UX wires up in Phase 5.
 */
export async function markActionItemResolved(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (!id) return { ok: false, error: "Missing id" };

  try {
    // Guard: only touch rows whose response belongs to this org.
    const [found] = await db
      .select({ id: npsActionItems.id })
      .from(npsActionItems)
      .innerJoin(npsResponses, eq(npsResponses.id, npsActionItems.responseId))
      .where(
        and(
          eq(npsActionItems.id, id),
          eq(npsResponses.organizationId, session.organizationId),
        ),
      )
      .limit(1);

    if (!found) {
      return { ok: false, error: "Not found" };
    }

    await db
      .update(npsActionItems)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(eq(npsActionItems.id, id));

    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to update" };
  }
}

/**
 * Count of active campaigns — thin convenience used by the overview page.
 */
export async function getActiveCampaignCount(): Promise<number> {
  const session = await requireSession();
  try {
    const [row] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(npsCampaigns)
      .where(
        and(
          eq(npsCampaigns.organizationId, session.organizationId),
          eq(npsCampaigns.isActive, true),
        ),
      );
    return row ? Number(row.count) : 0;
  } catch {
    return 0;
  }
}
