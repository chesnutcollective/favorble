import "server-only";
import { db } from "@/db/drizzle";
import { feedback, type FeedbackRow } from "@/db/schema/feedback";
import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { FeedbackCategory, FeedbackStatus } from "./constants";

export type FeedbackStatusHistoryEntry = {
  status: FeedbackStatus;
  timestamp: string;
  source: string;
};

export async function createFeedback(input: {
  organizationId: string;
  userId: string | null;
  userEmail: string;
  userName: string | null;
  message: string;
  category: FeedbackCategory;
  pageUrl: string | null;
  pageTitle: string | null;
  context?: Record<string, unknown>;
}): Promise<FeedbackRow> {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(feedback)
    .values({
      organizationId: input.organizationId,
      userId: input.userId,
      userEmail: input.userEmail,
      userName: input.userName,
      message: input.message,
      category: input.category,
      pageUrl: input.pageUrl,
      pageTitle: input.pageTitle,
      context: input.context ?? {},
      statusHistory: [
        { status: "open", timestamp: now, source: "user" },
      ] satisfies FeedbackStatusHistoryEntry[],
    })
    .returning();
  return row;
}

export async function getFeedbackList(params: {
  organizationId: string;
  status?: FeedbackStatus;
  category?: FeedbackCategory;
}): Promise<FeedbackRow[]> {
  const conditions = [eq(feedback.organizationId, params.organizationId)];
  if (params.status) conditions.push(eq(feedback.status, params.status));
  if (params.category) conditions.push(eq(feedback.category, params.category));

  return db
    .select()
    .from(feedback)
    .where(and(...conditions))
    .orderBy(desc(feedback.createdAt));
}

export type FeedbackStats = {
  total: number;
  open: number;
  /** Items with status=open AND created more than 48h ago — actionable triage backlog */
  needsTriage: number;
  thisWeek: number;
  lastWeek: number;
  byCategory: Array<{ category: FeedbackCategory; count: number }>;
  byStatus: Array<{ status: FeedbackStatus; count: number }>;
};

export async function getFeedbackStats(
  organizationId: string,
): Promise<FeedbackStats> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const [totalsRow] = await db
    .select({
      total: count(),
      open: sql<number>`count(*) filter (where ${feedback.status} = 'open')`,
      needsTriage: sql<number>`count(*) filter (where ${feedback.status} = 'open' and ${feedback.createdAt} <= ${twoDaysAgo.toISOString()})`,
    })
    .from(feedback)
    .where(eq(feedback.organizationId, organizationId));

  const [thisWeekRow] = await db
    .select({ c: count() })
    .from(feedback)
    .where(
      and(
        eq(feedback.organizationId, organizationId),
        gte(feedback.createdAt, weekAgo),
      ),
    );

  const [lastWeekRow] = await db
    .select({ c: count() })
    .from(feedback)
    .where(
      and(
        eq(feedback.organizationId, organizationId),
        gte(feedback.createdAt, twoWeeksAgo),
        lt(feedback.createdAt, weekAgo),
      ),
    );

  const categoryRows = await db
    .select({ category: feedback.category, c: count() })
    .from(feedback)
    .where(eq(feedback.organizationId, organizationId))
    .groupBy(feedback.category);

  const statusRows = await db
    .select({ status: feedback.status, c: count() })
    .from(feedback)
    .where(eq(feedback.organizationId, organizationId))
    .groupBy(feedback.status);

  return {
    total: Number(totalsRow?.total ?? 0),
    open: Number(totalsRow?.open ?? 0),
    needsTriage: Number(totalsRow?.needsTriage ?? 0),
    thisWeek: Number(thisWeekRow?.c ?? 0),
    lastWeek: Number(lastWeekRow?.c ?? 0),
    byCategory: categoryRows.map((r) => ({
      category: r.category as FeedbackCategory,
      count: Number(r.c),
    })),
    byStatus: statusRows.map((r) => ({
      status: r.status as FeedbackStatus,
      count: Number(r.c),
    })),
  };
}

export async function updateFeedbackStatus(params: {
  organizationId: string;
  id: string;
  status?: FeedbackStatus;
  adminNotes?: string | null;
  resolvedLink?: string | null;
  source?: string;
}): Promise<FeedbackRow | null> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (params.status !== undefined) updates.status = params.status;
  if (params.adminNotes !== undefined) updates.adminNotes = params.adminNotes;
  if (params.resolvedLink !== undefined)
    updates.resolvedLink = params.resolvedLink;

  if (params.status) {
    const entry: FeedbackStatusHistoryEntry = {
      status: params.status,
      timestamp: new Date().toISOString(),
      source: params.source ?? "admin",
    };
    updates.statusHistory = sql`coalesce(${feedback.statusHistory}, '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb`;
  }

  const [row] = await db
    .update(feedback)
    .set(updates)
    .where(
      and(
        eq(feedback.id, params.id),
        eq(feedback.organizationId, params.organizationId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function bulkUpdateFeedbackStatus(params: {
  organizationId: string;
  ids: string[];
  status: FeedbackStatus;
  source?: string;
}): Promise<number> {
  if (params.ids.length === 0) return 0;
  const entry = JSON.stringify([
    {
      status: params.status,
      timestamp: new Date().toISOString(),
      source: params.source ?? "admin",
    },
  ]);
  const rows = await db
    .update(feedback)
    .set({
      status: params.status,
      updatedAt: new Date(),
      statusHistory: sql`coalesce(${feedback.statusHistory}, '[]'::jsonb) || ${entry}::jsonb`,
    })
    .where(
      and(
        eq(feedback.organizationId, params.organizationId),
        inArray(feedback.id, params.ids),
      ),
    )
    .returning({ id: feedback.id });
  return rows.length;
}

export async function promoteFeedbackByStatus(params: {
  organizationId: string;
  fromStatus: FeedbackStatus;
  toStatus: FeedbackStatus;
  source?: string;
}): Promise<number> {
  const entry = JSON.stringify([
    {
      status: params.toStatus,
      timestamp: new Date().toISOString(),
      source: params.source ?? "promote-api",
    },
  ]);
  const rows = await db
    .update(feedback)
    .set({
      status: params.toStatus,
      updatedAt: new Date(),
      statusHistory: sql`coalesce(${feedback.statusHistory}, '[]'::jsonb) || ${entry}::jsonb`,
    })
    .where(
      and(
        eq(feedback.organizationId, params.organizationId),
        eq(feedback.status, params.fromStatus),
      ),
    )
    .returning({ id: feedback.id });
  return rows.length;
}

export async function deleteFeedback(params: {
  organizationId: string;
  ids: string[];
}): Promise<number> {
  if (params.ids.length === 0) return 0;
  const rows = await db
    .delete(feedback)
    .where(
      and(
        eq(feedback.organizationId, params.organizationId),
        inArray(feedback.id, params.ids),
      ),
    )
    .returning({ id: feedback.id });
  return rows.length;
}
