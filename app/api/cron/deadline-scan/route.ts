import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import {
  cases,
  rfcRequests,
  caseAssignments,
  users,
} from "@/db/schema";
import { and, desc, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import {
  recordSupervisorEvent,
  linkArtifactToEvent,
} from "@/lib/services/supervisor-events";
import { createNotification } from "@/lib/services/notify";
import { SSA_DEADLINE_RULES } from "@/lib/services/ssa-deadlines";

/**
 * Cron endpoint that scans for approaching SSA deadlines.
 *
 * For the MVP we detect the simplest high-value rule: cases with a
 * hearing in the next 14 days that are missing either a complete PHI
 * sheet or a completed RFC (i.e. medical records aren't ready). These
 * qualify as "five-day evidence rule" risks (deadline SA-5).
 *
 * If the hearing is inside the 65-day window, we also surface
 * `appeal_deadline_approaching` for any case whose hearing is close
 * and that lacks a completed PHI sheet.
 *
 * Notifications use a dedupe key so repeated hourly sweeps don't spam.
 *
 * Scheduled via vercel.json → every hour.
 * Authenticated via CRON_SECRET Bearer token.
 */

const HEARING_WINDOW_DAYS = 14;
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
    logger.error("Cron deadline-scan unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowEnd = new Date(
    now.getTime() + HEARING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  let recorded = 0;
  let notified = 0;
  const errors: string[] = [];

  try {
    // Cases with a hearing inside the window
    const upcoming = await db
      .select({
        id: cases.id,
        organizationId: cases.organizationId,
        caseNumber: cases.caseNumber,
        hearingDate: cases.hearingDate,
        phiSheetStatus: cases.phiSheetStatus,
      })
      .from(cases)
      .where(
        and(
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
          isNotNull(cases.hearingDate),
          sql`${cases.hearingDate} >= ${now.toISOString()}`,
          sql`${cases.hearingDate} <= ${windowEnd.toISOString()}`,
        ),
      )
      .limit(MAX_CASES_PER_RUN);

    logger.info("Cron deadline-scan candidate query", {
      candidateCount: upcoming.length,
      windowEnd: windowEnd.toISOString(),
    });

    for (const c of upcoming) {
      if (!c.hearingDate) continue;

      const hearingDate = c.hearingDate;
      const daysUntil = Math.ceil(
        (hearingDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );

      const phiComplete = c.phiSheetStatus === "complete";

      // Check for missing / incomplete RFC requests
      const openRfcs = await db
        .select({ id: rfcRequests.id, status: rfcRequests.status })
        .from(rfcRequests)
        .where(
          and(
            eq(rfcRequests.caseId, c.id),
            sql`${rfcRequests.status} NOT IN ('received', 'completed')`,
          ),
        );
      const mrMissing = openRfcs.length > 0;

      if (phiComplete && !mrMissing) {
        // Nothing to flag
        continue;
      }

      // Pick the rule. Five-day evidence rule is primary when a hearing
      // is imminent and evidence/PHI isn't ready.
      const ruleType: "five_day_evidence_rule" | "appeal_deadline_approaching" =
        "five_day_evidence_rule";
      const rule = SSA_DEADLINE_RULES[ruleType];

      const missingParts: string[] = [];
      if (!phiComplete) missingParts.push("PHI sheet");
      if (mrMissing) missingParts.push("medical records");

      const summary = `Case ${c.caseNumber} has a hearing in ${daysUntil} day${
        daysUntil === 1 ? "" : "s"
      } but is missing ${missingParts.join(" and ")}`;
      const recommendedAction = `${rule.label}: submit evidence at least 5 business days before the hearing.`;

      // Find the case manager / primary assignee
      const [assignee] = await db
        .select({ userId: caseAssignments.userId, role: users.role })
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
          eventType: "appeal_deadline_approaching",
          summary,
          recommendedAction,
          assignedUserId: assignee?.userId ?? null,
          payload: {
            ruleType,
            hearingDate: hearingDate.toISOString(),
            daysUntilHearing: daysUntil,
            phiComplete,
            openRfcCount: openRfcs.length,
          },
        });
        if (!eventId) {
          errors.push(`recordSupervisorEvent failed for case ${c.id}`);
          continue;
        }
        recorded++;

        if (assignee?.userId) {
          const notifId = await createNotification({
            organizationId: c.organizationId,
            userId: assignee.userId,
            caseId: c.id,
            title: rule.label,
            body: summary,
            priority: daysUntil <= 5 ? "urgent" : "high",
            actionLabel: "Open case",
            actionHref: `/cases/${c.id}/supervisor-timeline`,
            dedupeKey: `deadline:${c.id}:${ruleType}`,
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
        logger.error("Cron deadline-scan case processing failed", {
          caseId: c.id,
          error: msg,
        });
      }
    }
  } catch (err) {
    logger.error("Cron deadline-scan query failed", {
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
    errorCount: errors.length,
    hearingWindowDays: HEARING_WINDOW_DAYS,
  };
  logger.info("Cron deadline-scan sweep complete", summary);

  return NextResponse.json({ success: true, ...summary });
}
