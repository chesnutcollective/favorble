"use server";

import { db } from "@/db/drizzle";
import {
  npsResponses,
  npsActionItems,
  npsCampaigns,
  cases,
  caseStages,
  caseAssignments,
  contacts,
  users,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { ensurePortalSession } from "@/lib/auth/portal-session";
import { logPortalActivity } from "@/lib/services/portal-activity";
import { logPhiModification } from "@/lib/services/hipaa-audit";
import { logger } from "@/lib/logger/server";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
      .filter((r) => r.comment !== null && r.score !== null)
      .map((r) => ({
        id: r.id,
        score: r.score as number,
        comment: r.comment as string,
      }));

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
      .filter((r) => r.comment !== null && r.score !== null)
      .map((r) => ({
        id: r.id,
        score: r.score as number,
        comment: r.comment as string,
      }));

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

  // Only surface answered surveys (post A2, rows are enqueued with
  // score/category null at stage transition and filled in on submit).
  const conds = [
    eq(npsResponses.organizationId, session.organizationId),
    sql`${npsResponses.score} IS NOT NULL`,
    sql`${npsResponses.category} IS NOT NULL`,
  ];
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

    return rows
      .filter((r) => r.score !== null && r.category !== null)
      .map((r) => {
        const claimantName =
          [r.claimantFirst, r.claimantLast].filter(Boolean).join(" ").trim() ||
          null;
        return {
          id: r.id,
          score: r.score as number,
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

// ───────────────────────────────────────────────────────────────
// Phase 5 A2: campaign management + survey submission.
// ───────────────────────────────────────────────────────────────

export type CampaignChannel = "email" | "sms" | "portal";

export type NpsCampaignListRow = {
  id: string;
  name: string;
  channel: CampaignChannel;
  delayDays: number;
  triggerStageId: string | null;
  triggerStageName: string | null;
  isActive: boolean;
  createdAt: string;
};

export async function listNpsCampaigns(): Promise<NpsCampaignListRow[]> {
  const session = await requireSession();
  try {
    const rows = await db
      .select({
        id: npsCampaigns.id,
        name: npsCampaigns.name,
        channel: npsCampaigns.channel,
        delayDays: npsCampaigns.delayDays,
        triggerStageId: npsCampaigns.triggerStageId,
        triggerStageName: caseStages.name,
        isActive: npsCampaigns.isActive,
        createdAt: npsCampaigns.createdAt,
      })
      .from(npsCampaigns)
      .leftJoin(caseStages, eq(caseStages.id, npsCampaigns.triggerStageId))
      .where(eq(npsCampaigns.organizationId, session.organizationId))
      .orderBy(desc(npsCampaigns.createdAt));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      channel: r.channel as CampaignChannel,
      delayDays: r.delayDays,
      triggerStageId: r.triggerStageId ?? null,
      triggerStageName: r.triggerStageName ?? null,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch (error) {
    logger.error("listNpsCampaigns failed", { error });
    return [];
  }
}

export async function listTriggerStageOptions(): Promise<
  { id: string; name: string }[]
> {
  const session = await requireSession();
  try {
    const rows = await db
      .select({ id: caseStages.id, name: caseStages.name })
      .from(caseStages)
      .where(
        and(
          eq(caseStages.organizationId, session.organizationId),
          isNull(caseStages.deletedAt),
        ),
      )
      .orderBy(caseStages.displayOrder);
    return rows;
  } catch {
    return [];
  }
}

export type CreateNpsCampaignInput = {
  name: string;
  triggerStageId: string | null;
  delayDays: number;
  channel: CampaignChannel;
};

export async function createNpsCampaign(
  input: CreateNpsCampaignInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await requireSession();
  if (session.role !== "admin") {
    return { ok: false, error: "Only admins can create campaigns" };
  }
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required" };
  if (!["email", "sms", "portal"].includes(input.channel)) {
    return { ok: false, error: "Invalid channel" };
  }
  const delayDays = Number.isFinite(input.delayDays)
    ? Math.max(0, Math.floor(input.delayDays))
    : 0;

  try {
    const [row] = await db
      .insert(npsCampaigns)
      .values({
        organizationId: session.organizationId,
        name,
        triggerStageId: input.triggerStageId,
        delayDays,
        channel: input.channel,
        isActive: true,
        createdBy: session.id,
      })
      .returning({ id: npsCampaigns.id });

    await logPhiModification({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "nps_campaign",
      entityId: row.id,
      operation: "create",
      action: "nps_campaign_created",
      metadata: {
        name,
        triggerStageId: input.triggerStageId,
        channel: input.channel,
        delayDays,
      },
    });

    revalidatePath("/admin/settings/nps-campaigns");
    return { ok: true, id: row.id };
  } catch (error) {
    logger.error("createNpsCampaign failed", { error });
    return { ok: false, error: "Failed to create campaign" };
  }
}

export async function toggleNpsCampaign(
  id: string,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (session.role !== "admin") {
    return { ok: false, error: "Only admins can modify campaigns" };
  }
  try {
    const [existing] = await db
      .select({ id: npsCampaigns.id })
      .from(npsCampaigns)
      .where(
        and(
          eq(npsCampaigns.id, id),
          eq(npsCampaigns.organizationId, session.organizationId),
        ),
      )
      .limit(1);
    if (!existing) return { ok: false, error: "Not found" };

    await db
      .update(npsCampaigns)
      .set({ isActive })
      .where(eq(npsCampaigns.id, id));

    await logPhiModification({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "nps_campaign",
      entityId: id,
      operation: "update",
      action: isActive ? "nps_campaign_activated" : "nps_campaign_deactivated",
      metadata: { isActive },
    });

    revalidatePath("/admin/settings/nps-campaigns");
    return { ok: true };
  } catch (error) {
    logger.error("toggleNpsCampaign failed", { error });
    return { ok: false, error: "Failed to update" };
  }
}

export async function deleteNpsCampaign(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (session.role !== "admin") {
    return { ok: false, error: "Only admins can delete campaigns" };
  }
  try {
    const [existing] = await db
      .select({ id: npsCampaigns.id })
      .from(npsCampaigns)
      .where(
        and(
          eq(npsCampaigns.id, id),
          eq(npsCampaigns.organizationId, session.organizationId),
        ),
      )
      .limit(1);
    if (!existing) return { ok: false, error: "Not found" };

    await db.delete(npsCampaigns).where(eq(npsCampaigns.id, id));

    await logPhiModification({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "nps_campaign",
      entityId: id,
      operation: "delete",
      action: "nps_campaign_deleted",
    });

    revalidatePath("/admin/settings/nps-campaigns");
    return { ok: true };
  } catch (error) {
    logger.error("deleteNpsCampaign failed", { error });
    return { ok: false, error: "Failed to delete" };
  }
}

// ───────────────────────────────────────────────────────────────
// Client survey submission (called from /portal/nps/[responseId]).
// ───────────────────────────────────────────────────────────────

function categoryForScore(score: number): NpsCategory {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

export type SubmitNpsResponseResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Submit a score+comment from the claimant's survey page.
 *
 * Guarded by `ensurePortalSession` — the caller must be the claimant whose
 * contact_id is on the row (or a staff impersonator; impersonated submits
 * are rejected to avoid polluting analytics with staff test clicks).
 *
 * Detractor rule: if score ≤ 6, an nps_action_items row is opened against
 * the case's primary attorney (falls back to the first active assignment).
 */
export async function submitNpsResponse(
  responseId: string,
  score: number,
  comment: string | null,
): Promise<SubmitNpsResponseResult> {
  const session = await ensurePortalSession();

  if (!responseId) return { ok: false, error: "Missing responseId" };
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    return { ok: false, error: "Invalid score" };
  }
  if (session.isImpersonating) {
    // Don't let staff browsing the portal submit fake NPS data.
    return { ok: false, error: "Impersonation cannot submit" };
  }

  try {
    const [row] = await db
      .select({
        id: npsResponses.id,
        organizationId: npsResponses.organizationId,
        caseId: npsResponses.caseId,
        contactId: npsResponses.contactId,
        respondedAt: npsResponses.respondedAt,
        metadata: npsResponses.metadata,
      })
      .from(npsResponses)
      .where(eq(npsResponses.id, responseId))
      .limit(1);

    if (!row) return { ok: false, error: "Survey not found" };
    if (row.contactId !== session.contact.id) {
      return { ok: false, error: "Forbidden" };
    }
    if (row.respondedAt) {
      return { ok: false, error: "Already submitted" };
    }

    const normalizedScore = Math.round(score);
    const category = categoryForScore(normalizedScore);
    const trimmedComment = comment?.trim() || null;
    const now = new Date();

    const existingMeta =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};

    await db
      .update(npsResponses)
      .set({
        score: normalizedScore,
        category,
        comment: trimmedComment,
        respondedAt: now,
        // If the row was never dispatched (pure portal channel), backfill
        // sent_at so the analytics denominator counts it correctly.
        sentAt: sql`COALESCE(${npsResponses.sentAt}, ${now})`,
        metadata: { ...existingMeta, submittedVia: "portal" },
      })
      .where(eq(npsResponses.id, responseId));

    await logPhiModification({
      organizationId: row.organizationId,
      userId: null,
      entityType: "nps_response",
      entityId: responseId,
      caseId: row.caseId ?? null,
      operation: "update",
      action: "nps_response_submitted",
      metadata: {
        score: normalizedScore,
        category,
        hasComment: !!trimmedComment,
      },
    });

    // Detractor → auto-create an action item for follow-up.
    if (category === "detractor") {
      try {
        let assigneeUserId: string | null = null;
        const [primary] = await db
          .select({
            userId: caseAssignments.userId,
            role: users.role,
            isPrimary: caseAssignments.isPrimary,
          })
          .from(caseAssignments)
          .leftJoin(users, eq(users.id, caseAssignments.userId))
          .where(
            and(
              eq(caseAssignments.caseId, row.caseId),
              isNull(caseAssignments.unassignedAt),
            ),
          )
          .orderBy(
            desc(caseAssignments.isPrimary),
            sql`CASE WHEN ${users.role} = 'attorney' THEN 0 ELSE 1 END`,
          )
          .limit(1);
        if (primary) {
          assigneeUserId = primary.userId;
        }

        await db.insert(npsActionItems).values({
          responseId: row.id,
          status: "open",
          assignedToUserId: assigneeUserId,
          notes: trimmedComment
            ? `Detractor score ${normalizedScore}. Comment: ${trimmedComment.slice(0, 500)}`
            : `Detractor score ${normalizedScore}.`,
        });
      } catch (err) {
        logger.error("submitNpsResponse: action item insert failed", {
          responseId,
          error: err instanceof Error ? err.message : String(err),
        });
        // Don't fail the submit — the score is still recorded.
      }
    }

    await logPortalActivity("submit_nps", "nps_response", responseId, {
      score: normalizedScore,
      category,
    });

    return { ok: true };
  } catch (error) {
    logger.error("submitNpsResponse failed", {
      responseId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: "Failed to submit" };
  }
}
