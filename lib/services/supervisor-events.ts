import "server-only";
import { db } from "@/db/drizzle";
import { supervisorEvents } from "@/db/schema";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

/**
 * Supervisor event bus service.
 *
 * Records "things that happened on a case" (denial received, missed
 * deadline, stagnant case, etc.) and tracks the app's response lifecycle
 * (file updated → draft created → task assigned → resolved).
 *
 * Feeds SA-1, SA-5, SA-8 and the case supervisor timeline UI.
 */

export type SupervisorEventRow = typeof supervisorEvents.$inferSelect;

/** A single lifecycle step recorded on a supervisor event. */
export type SupervisorEventStep = {
  at: string; // ISO
  status: SupervisorEventRow["status"];
  by: string; // "system" | userId
  note?: string;
};

export type RecordSupervisorEventInput = {
  organizationId: string;
  caseId?: string | null;
  eventType: SupervisorEventRow["eventType"];
  summary: string;
  payload?: unknown;
  recommendedAction?: string | null;
  assignedUserId?: string | null;
};

/**
 * Insert a new supervisor event with status='detected'. The initial
 * "detected" step is seeded into `steps` so the timeline always has at
 * least one entry to render.
 */
export async function recordSupervisorEvent(
  input: RecordSupervisorEventInput,
): Promise<string | null> {
  try {
    const nowIso = new Date().toISOString();
    const initialStep: SupervisorEventStep = {
      at: nowIso,
      status: "detected",
      by: "system",
      note: input.summary,
    };

    const [row] = await db
      .insert(supervisorEvents)
      .values({
        organizationId: input.organizationId,
        caseId: input.caseId ?? null,
        eventType: input.eventType,
        status: "detected",
        summary: input.summary,
        payload: (input.payload ?? null) as unknown as object | null,
        recommendedAction: input.recommendedAction ?? null,
        assignedUserId: input.assignedUserId ?? null,
        steps: [initialStep],
      })
      .returning({ id: supervisorEvents.id });

    return row?.id ?? null;
  } catch (err) {
    logger.error("recordSupervisorEvent failed", {
      error: err instanceof Error ? err.message : String(err),
      eventType: input.eventType,
      caseId: input.caseId ?? null,
    });
    return null;
  }
}

/**
 * Advance a supervisor event to a new status and append a step entry.
 * When newStatus is 'resolved' or 'dismissed', `resolvedAt` is stamped.
 */
export async function advanceSupervisorEvent(
  id: string,
  newStatus: SupervisorEventRow["status"],
  step: SupervisorEventStep,
): Promise<void> {
  try {
    const isTerminal = newStatus === "resolved" || newStatus === "dismissed";
    await db
      .update(supervisorEvents)
      .set({
        status: newStatus,
        // Append the step to the existing JSONB array
        steps: sql`COALESCE(${supervisorEvents.steps}, '[]'::jsonb) || ${sql.raw(
          `'${JSON.stringify([step]).replace(/'/g, "''")}'::jsonb`,
        )}`,
        resolvedAt: isTerminal ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(supervisorEvents.id, id));
  } catch (err) {
    logger.error("advanceSupervisorEvent failed", {
      error: err instanceof Error ? err.message : String(err),
      id,
      newStatus,
    });
  }
}

/**
 * Link an artifact (task, draft, or notification) to a supervisor event
 * by appending the id to the appropriate array column.
 */
export async function linkArtifactToEvent(
  id: string,
  kind: "task" | "draft" | "notification",
  artifactId: string,
): Promise<void> {
  try {
    const column =
      kind === "task"
        ? supervisorEvents.linkedTaskIds
        : kind === "draft"
          ? supervisorEvents.linkedDraftIds
          : supervisorEvents.linkedNotificationIds;

    await db
      .update(supervisorEvents)
      .set({
        // COALESCE handles NULL → empty array, then append
        [kind === "task"
          ? "linkedTaskIds"
          : kind === "draft"
            ? "linkedDraftIds"
            : "linkedNotificationIds"]:
          sql`array_append(COALESCE(${column}, ARRAY[]::uuid[]), ${artifactId}::uuid)`,
        updatedAt: new Date(),
      })
      .where(eq(supervisorEvents.id, id));
  } catch (err) {
    logger.error("linkArtifactToEvent failed", {
      error: err instanceof Error ? err.message : String(err),
      id,
      kind,
      artifactId,
    });
  }
}

/**
 * Fetch all supervisor events for a case, newest first.
 */
export async function getSupervisorEventsForCase(
  caseId: string,
): Promise<SupervisorEventRow[]> {
  return await db
    .select()
    .from(supervisorEvents)
    .where(eq(supervisorEvents.caseId, caseId))
    .orderBy(desc(supervisorEvents.detectedAt));
}

/**
 * Fetch all open (non-resolved) supervisor events assigned to a user.
 * Dismissed events are treated as resolved and excluded from this feed.
 */
export async function getOpenSupervisorEventsForUser(
  userId: string,
): Promise<SupervisorEventRow[]> {
  return await db
    .select()
    .from(supervisorEvents)
    .where(
      and(
        eq(supervisorEvents.assignedUserId, userId),
        ne(supervisorEvents.status, "resolved"),
      ),
    )
    .orderBy(desc(supervisorEvents.detectedAt));
}
