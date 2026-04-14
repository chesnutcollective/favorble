"use server";

import { after } from "next/server";
import { db } from "@/db/drizzle";
import {
  coachingFlags,
  coachingDrafts,
  aiDrafts,
  users,
  trainingGaps,
} from "@/db/schema";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger/server";
import {
  draftCoachingConversation,
  draftCoachingCallScript,
} from "@/lib/services/coaching-draft";

/**
 * Coaching server actions (CC-1 through CC-4). These power the
 * `/coaching` pages — list, detail, generate, resolve, dismiss.
 */

export type CoachingFlagStatus =
  | "open"
  | "in_progress"
  | "resolved"
  | "dismissed";

export type CoachingFlagListItem = {
  id: string;
  subjectUserId: string;
  subjectName: string;
  role: string;
  metricKey: string;
  severity: number;
  status: CoachingFlagStatus;
  summary: string;
  classification: string | null;
  detectedAt: string;
  supervisorName: string | null;
};

export type CoachingFlagFilters = {
  /** Filter by severity band. "high" → severity >= 6. */
  severity?: "high";
  /** Filter by classification. "none" → NULL classification. */
  classification?: "people" | "process" | "none";
  /** Time window relative to now. "7d" → last 7 days (applied to resolvedAt). */
  window?: "7d";
};

/**
 * List coaching flags visible to the current session user. Admins see
 * every flag in the org; everyone else sees the flags where they are
 * the assigned supervisor.
 */
export async function getCoachingFlags(
  status?: CoachingFlagStatus,
  filters: CoachingFlagFilters = {},
): Promise<CoachingFlagListItem[]> {
  const session = await requireSession();

  const conditions = [eq(coachingFlags.organizationId, session.organizationId)];
  if (status) {
    conditions.push(eq(coachingFlags.status, status));
  }
  if (session.role !== "admin") {
    conditions.push(eq(coachingFlags.supervisorUserId, session.id));
  }
  if (filters.severity === "high") {
    conditions.push(gte(coachingFlags.severity, 6));
  }
  if (filters.classification === "none") {
    conditions.push(isNull(coachingFlags.classification));
  } else if (filters.classification) {
    conditions.push(eq(coachingFlags.classification, filters.classification));
  }
  if (filters.window === "7d") {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    conditions.push(gte(coachingFlags.resolvedAt, sevenDaysAgo));
  }

  const subjectUser = alias(users, "subject_user");
  const supervisorUser = alias(users, "supervisor_user");

  const rows = await db
    .select({
      id: coachingFlags.id,
      subjectUserId: coachingFlags.subjectUserId,
      subjectFirstName: subjectUser.firstName,
      subjectLastName: subjectUser.lastName,
      supervisorFirstName: supervisorUser.firstName,
      supervisorLastName: supervisorUser.lastName,
      role: coachingFlags.role,
      metricKey: coachingFlags.metricKey,
      severity: coachingFlags.severity,
      status: coachingFlags.status,
      summary: coachingFlags.summary,
      classification: coachingFlags.classification,
      detectedAt: coachingFlags.detectedAt,
    })
    .from(coachingFlags)
    .leftJoin(subjectUser, eq(subjectUser.id, coachingFlags.subjectUserId))
    .leftJoin(
      supervisorUser,
      eq(supervisorUser.id, coachingFlags.supervisorUserId),
    )
    .where(and(...conditions))
    .orderBy(desc(coachingFlags.severity), desc(coachingFlags.detectedAt))
    .limit(200);

  return rows.map((r) => ({
    id: r.id,
    subjectUserId: r.subjectUserId,
    subjectName:
      r.subjectFirstName && r.subjectLastName
        ? `${r.subjectFirstName} ${r.subjectLastName}`
        : "Unknown",
    role: r.role,
    metricKey: r.metricKey,
    severity: r.severity,
    status: r.status as CoachingFlagStatus,
    summary: r.summary,
    classification: r.classification ?? null,
    detectedAt: r.detectedAt.toISOString(),
    supervisorName:
      r.supervisorFirstName && r.supervisorLastName
        ? `${r.supervisorFirstName} ${r.supervisorLastName}`
        : null,
  }));
}

export type CoachingFlagDetail = CoachingFlagListItem & {
  suggestedActionSteps: Array<{
    label: string;
    description?: string | null;
    dueDate?: string | null;
  }>;
  notes: string | null;
  resolvedAt: string | null;
};

export async function getCoachingFlagById(
  flagId: string,
): Promise<CoachingFlagDetail | null> {
  const session = await requireSession();

  const [row] = await db
    .select({
      id: coachingFlags.id,
      organizationId: coachingFlags.organizationId,
      subjectUserId: coachingFlags.subjectUserId,
      supervisorUserId: coachingFlags.supervisorUserId,
      role: coachingFlags.role,
      metricKey: coachingFlags.metricKey,
      severity: coachingFlags.severity,
      status: coachingFlags.status,
      summary: coachingFlags.summary,
      classification: coachingFlags.classification,
      suggestedActionSteps: coachingFlags.suggestedActionSteps,
      notes: coachingFlags.notes,
      detectedAt: coachingFlags.detectedAt,
      resolvedAt: coachingFlags.resolvedAt,
    })
    .from(coachingFlags)
    .where(
      and(
        eq(coachingFlags.id, flagId),
        eq(coachingFlags.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!row) return null;

  const subjectName = await (async () => {
    const [u] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, row.subjectUserId))
      .limit(1);
    return u ? `${u.firstName} ${u.lastName}` : "Unknown";
  })();

  const supervisorName = row.supervisorUserId
    ? await (async () => {
        const [u] = await db
          .select({ firstName: users.firstName, lastName: users.lastName })
          .from(users)
          .where(eq(users.id, row.supervisorUserId!))
          .limit(1);
        return u ? `${u.firstName} ${u.lastName}` : null;
      })()
    : null;

  const actionSteps = Array.isArray(row.suggestedActionSteps)
    ? (row.suggestedActionSteps as Array<{
        label: string;
        description?: string | null;
        dueDate?: string | null;
      }>)
    : [];

  return {
    id: row.id,
    subjectUserId: row.subjectUserId,
    subjectName,
    role: row.role,
    metricKey: row.metricKey,
    severity: row.severity,
    status: row.status as CoachingFlagStatus,
    summary: row.summary,
    classification: row.classification ?? null,
    detectedAt: row.detectedAt.toISOString(),
    supervisorName,
    suggestedActionSteps: actionSteps,
    notes: row.notes,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

export type CoachingDraftItem = {
  id: string;
  kind: "conversation" | "call_script";
  title: string;
  body: string;
  examples: Array<{
    caseId: string | null;
    eventDate: string;
    observation: string;
  }>;
  createdAt: string;
};

export async function getCoachingDraftsForFlag(
  flagId: string,
): Promise<CoachingDraftItem[]> {
  const session = await requireSession();

  const convRows = await db
    .select({
      id: coachingDrafts.id,
      title: coachingDrafts.title,
      body: coachingDrafts.body,
      examples: coachingDrafts.examples,
      createdAt: coachingDrafts.createdAt,
      organizationId: coachingDrafts.organizationId,
    })
    .from(coachingDrafts)
    .where(
      and(
        eq(coachingDrafts.coachingFlagId, flagId),
        eq(coachingDrafts.organizationId, session.organizationId),
      ),
    )
    .orderBy(desc(coachingDrafts.createdAt));

  const scriptRows = await db
    .select({
      id: aiDrafts.id,
      title: aiDrafts.title,
      body: aiDrafts.body,
      structuredFields: aiDrafts.structuredFields,
      createdAt: aiDrafts.createdAt,
      organizationId: aiDrafts.organizationId,
    })
    .from(aiDrafts)
    .where(
      and(
        eq(aiDrafts.organizationId, session.organizationId),
        eq(aiDrafts.type, "coaching_conversation"),
      ),
    )
    .orderBy(desc(aiDrafts.createdAt))
    .limit(20);

  const scriptsForFlag = scriptRows.filter((r) => {
    const sf = r.structuredFields as { flagId?: string } | null;
    return sf?.flagId === flagId;
  });

  const drafts: CoachingDraftItem[] = [
    ...convRows.map((r) => ({
      id: r.id,
      kind: "conversation" as const,
      title: r.title,
      body: r.body,
      examples: Array.isArray(r.examples)
        ? (r.examples as Array<{
            caseId: string | null;
            eventDate: string;
            observation: string;
          }>)
        : [],
      createdAt: r.createdAt.toISOString(),
    })),
    ...scriptsForFlag.map((r) => ({
      id: r.id,
      kind: "call_script" as const,
      title: r.title,
      body: r.body,
      examples: [] as Array<{
        caseId: string | null;
        eventDate: string;
        observation: string;
      }>,
      createdAt: r.createdAt.toISOString(),
    })),
  ];

  drafts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return drafts;
}

export async function generateCoachingDraft(flagId: string) {
  const session = await requireSession();

  // Guard: flag must belong to this org
  const [flag] = await db
    .select({ id: coachingFlags.id })
    .from(coachingFlags)
    .where(
      and(
        eq(coachingFlags.id, flagId),
        eq(coachingFlags.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!flag) {
    return { success: false, error: "Flag not found" };
  }

  after(async () => {
    try {
      await draftCoachingConversation({ flagId });
    } catch (err) {
      logger.error("generateCoachingDraft after() failed", {
        flagId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  revalidatePath(`/coaching/${flagId}`);
  return { success: true };
}

export async function generateCoachingScript(flagId: string) {
  const session = await requireSession();

  const [flag] = await db
    .select({ id: coachingFlags.id })
    .from(coachingFlags)
    .where(
      and(
        eq(coachingFlags.id, flagId),
        eq(coachingFlags.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!flag) {
    return { success: false, error: "Flag not found" };
  }

  after(async () => {
    try {
      await draftCoachingCallScript({ flagId });
    } catch (err) {
      logger.error("generateCoachingScript after() failed", {
        flagId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  revalidatePath(`/coaching/${flagId}`);
  return { success: true };
}

export async function resolveCoachingFlag(flagId: string, notes?: string) {
  const session = await requireSession();

  await db
    .update(coachingFlags)
    .set({
      status: "resolved",
      resolvedAt: new Date(),
      notes: notes ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(coachingFlags.id, flagId),
        eq(coachingFlags.organizationId, session.organizationId),
      ),
    );

  revalidatePath("/coaching");
  revalidatePath(`/coaching/${flagId}`);
  return { success: true };
}

export async function dismissCoachingFlag(flagId: string, reason: string) {
  const session = await requireSession();

  await db
    .update(coachingFlags)
    .set({
      status: "dismissed",
      notes: reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(coachingFlags.id, flagId),
        eq(coachingFlags.organizationId, session.organizationId),
      ),
    );

  revalidatePath("/coaching");
  revalidatePath(`/coaching/${flagId}`);
  return { success: true };
}

export type TrainingGapItem = {
  id: string;
  role: string;
  metricKey: string;
  affectedUserCount: number;
  totalUserCount: number;
  summary: string;
  recommendation: string | null;
  detectedAt: string;
};

export async function getTrainingGaps(): Promise<TrainingGapItem[]> {
  const session = await requireSession();

  const rows = await db
    .select({
      id: trainingGaps.id,
      role: trainingGaps.role,
      metricKey: trainingGaps.metricKey,
      affectedUserCount: trainingGaps.affectedUserCount,
      totalUserCount: trainingGaps.totalUserCount,
      summary: trainingGaps.summary,
      recommendation: trainingGaps.recommendation,
      detectedAt: trainingGaps.detectedAt,
    })
    .from(trainingGaps)
    .where(eq(trainingGaps.organizationId, session.organizationId))
    .orderBy(desc(trainingGaps.detectedAt))
    .limit(200);

  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    metricKey: r.metricKey,
    affectedUserCount: r.affectedUserCount,
    totalUserCount: r.totalUserCount,
    summary: r.summary,
    recommendation: r.recommendation,
    detectedAt: r.detectedAt.toISOString(),
  }));
}
