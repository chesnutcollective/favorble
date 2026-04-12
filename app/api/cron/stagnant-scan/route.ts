import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import {
  cases,
  caseStageTransitions,
  tasks,
  communications,
  caseAssignments,
  users,
} from "@/db/schema";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import { recordSupervisorEvent, linkArtifactToEvent } from "@/lib/services/supervisor-events";
import { createNotification } from "@/lib/services/notify";
import { suggestStagnantCaseNextAction } from "@/lib/services/stagnant-suggestions";

/**
 * Cron endpoint that scans for stagnant cases — cases where nothing has
 * happened in the configured window (default 14 days):
 *   - no stage transition
 *   - no task update (created_at or updated_at)
 *   - no communication created
 *
 * For each stagnant case we record a `stagnant_case` supervisor event
 * and ping the case manager. Deduped by dedupe key so repeated sweeps
 * don't re-notify about the same stale case.
 *
 * Scheduled via vercel.json → every 4 hours.
 * Authenticated via CRON_SECRET Bearer token.
 */

const STAGNANT_DAYS = 14;
const MAX_CASES_PER_RUN = 50;

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    logger.error("Cron stagnant-scan unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - STAGNANT_DAYS * 24 * 60 * 60 * 1000);

  let recorded = 0;
  let notified = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    // Find active cases that haven't been touched in `cutoff` days.
    // Touched = stage_entered_at > cutoff OR updated_at > cutoff OR
    //           any task.updated_at > cutoff OR any communication.created_at > cutoff.
    //
    // Simplified: start from active cases with stage_entered_at < cutoff
    // AND updated_at < cutoff, then per-case check tasks / communications.
    const candidates = await db
      .select({
        id: cases.id,
        organizationId: cases.organizationId,
        caseNumber: cases.caseNumber,
        stageEnteredAt: cases.stageEnteredAt,
        updatedAt: cases.updatedAt,
      })
      .from(cases)
      .where(
        and(
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
          sql`${cases.stageEnteredAt} < ${cutoff.toISOString()}`,
          sql`${cases.updatedAt} < ${cutoff.toISOString()}`,
        ),
      )
      .limit(MAX_CASES_PER_RUN * 2); // overfetch — some will fail the task/comm check

    logger.info("Cron stagnant-scan candidate query", {
      candidateCount: candidates.length,
      cutoff: cutoff.toISOString(),
    });

    for (const c of candidates) {
      if (recorded >= MAX_CASES_PER_RUN) break;

      // Check recent task activity (createdAt or updatedAt within cutoff)
      const [recentTask] = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.caseId, c.id),
            sql`(${tasks.updatedAt} > ${cutoff.toISOString()} OR ${tasks.createdAt} > ${cutoff.toISOString()})`,
          ),
        )
        .limit(1);
      if (recentTask) {
        skipped++;
        continue;
      }

      // Check recent communication
      const [recentComm] = await db
        .select({ id: communications.id })
        .from(communications)
        .where(
          and(
            eq(communications.caseId, c.id),
            gt(communications.createdAt, cutoff),
          ),
        )
        .limit(1);
      if (recentComm) {
        skipped++;
        continue;
      }

      // Check recent stage transition (just in case)
      const [recentTransition] = await db
        .select({ id: caseStageTransitions.id })
        .from(caseStageTransitions)
        .where(
          and(
            eq(caseStageTransitions.caseId, c.id),
            gt(caseStageTransitions.transitionedAt, cutoff),
          ),
        )
        .orderBy(desc(caseStageTransitions.transitionedAt))
        .limit(1);
      if (recentTransition) {
        skipped++;
        continue;
      }

      // Compute days since last activity using the most recent of
      // stageEnteredAt / updatedAt
      const lastActivity = new Date(
        Math.max(
          c.stageEnteredAt.getTime(),
          c.updatedAt.getTime(),
        ),
      );
      const daysIdle = Math.floor(
        (now.getTime() - lastActivity.getTime()) / (24 * 60 * 60 * 1000),
      );

      const summary = `Case ${c.caseNumber} has had no activity in ${daysIdle} days`;

      // SM-3: ask Claude for a per-case next-action recommendation.
      // Wrapped in try/catch — failures fall back to a generic line so
      // a hung LLM never blocks the sweep.
      let recommendedAction = "Review case with case manager";
      try {
        recommendedAction = await suggestStagnantCaseNextAction({
          caseId: c.id,
          daysStagnant: daysIdle,
        });
      } catch (err) {
        logger.warn("stagnant-scan: suggestion failed, using fallback", {
          caseId: c.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Find the case manager for this case (falls back to primary assignee)
      const [assignee] = await db
        .select({
          userId: caseAssignments.userId,
          role: users.role,
        })
        .from(caseAssignments)
        .leftJoin(users, eq(users.id, caseAssignments.userId))
        .where(
          and(
            eq(caseAssignments.caseId, c.id),
            isNull(caseAssignments.unassignedAt),
          ),
        )
        .orderBy(desc(caseAssignments.isPrimary))
        .limit(1);

      try {
        const eventId = await recordSupervisorEvent({
          organizationId: c.organizationId,
          caseId: c.id,
          eventType: "stagnant_case",
          summary,
          recommendedAction,
          assignedUserId: assignee?.userId ?? null,
          payload: {
            daysIdle,
            lastStageEnteredAt: c.stageEnteredAt.toISOString(),
            lastUpdatedAt: c.updatedAt.toISOString(),
          },
        });
        if (!eventId) {
          errors.push(`recordSupervisorEvent failed for case ${c.id}`);
          continue;
        }
        recorded++;

        // Notify the case manager, if any
        if (assignee?.userId) {
          const notifBody = [
            `What happened: ${summary}.`,
            `What to do: ${recommendedAction}`,
          ].join("\n");
          const notifId = await createNotification({
            organizationId: c.organizationId,
            userId: assignee.userId,
            caseId: c.id,
            title: "Stagnant case",
            body: notifBody.slice(0, 300),
            priority: "normal",
            actionLabel: "Review case",
            actionHref: `/cases/${c.id}/supervisor-timeline`,
            dedupeKey: `stagnant:${c.id}`,
            sourceEventId: eventId,
          });
          if (notifId) {
            notified++;
            await linkArtifactToEvent(eventId, "notification", notifId);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`case ${c.id}: ${msg}`);
        logger.error("Cron stagnant-scan case processing failed", {
          caseId: c.id,
          error: msg,
        });
      }
    }
  } catch (err) {
    logger.error("Cron stagnant-scan query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Query failed" },
      { status: 500 },
    );
  }

  const summary = {
    recorded,
    notified,
    skipped,
    errorCount: errors.length,
    stagnantDays: STAGNANT_DAYS,
  };
  logger.info("Cron stagnant-scan sweep complete", summary);

  return NextResponse.json({ success: true, ...summary });
}
