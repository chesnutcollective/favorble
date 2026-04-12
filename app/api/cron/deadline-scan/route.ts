import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import {
  cases,
  rfcRequests,
  caseAssignments,
  users,
  feePetitions,
  hearingOutcomes,
  supervisorEvents,
} from "@/db/schema";
import { and, desc, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import {
  recordSupervisorEvent,
  linkArtifactToEvent,
} from "@/lib/services/supervisor-events";
import { createNotification } from "@/lib/services/notify";
import { SSA_DEADLINE_RULES } from "@/lib/services/ssa-deadlines";
import type { SsaDeadlineType } from "@/lib/services/ssa-deadlines";

/**
 * Cron endpoint that scans for approaching SSA deadlines.
 *
 * Scans for:
 * 1. five_day_evidence_rule — hearing within 14 days, evidence not ready
 * 2. appeal_deadline_approaching — (existing, part of rule 1 path)
 * 3. fee_petition — favorable decision >30 days old, no fee petition filed
 * 4. rfc_follow_up — open RFC requests with due date within 5 days
 * 5. mr_follow_up — open RFC requests (MR-related) approaching deadline
 * 6. good_cause_response — denial >50 days old with no action taken
 * 7. appeal_reconsideration — denial with 65-day window closing
 *
 * Notifications use a dedupe key so repeated hourly sweeps don't spam.
 *
 * Scheduled via vercel.json -> every hour.
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
          const notifBody = [
            `What happened: ${summary}.`,
            `What to do: ${recommendedAction}`,
          ].join("\n");
          const notifId = await createNotification({
            organizationId: c.organizationId,
            userId: assignee.userId,
            caseId: c.id,
            title: rule.label,
            body: notifBody.slice(0, 300),
            priority: daysUntil <= 5 ? "urgent" : "high",
            actionLabel: "Review case",
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
    logger.error("Cron deadline-scan hearing query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    errors.push(`hearing scan: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ----- Helper: record event + notify for a given rule -----
  async function recordAndNotify(input: {
    orgId: string;
    caseId: string;
    caseNumber: string;
    ruleType: SsaDeadlineType;
    summaryText: string;
    recommendedAction: string;
    payload: Record<string, unknown>;
    priority: "urgent" | "high" | "normal";
  }) {
    const rule = SSA_DEADLINE_RULES[input.ruleType];

    const [assignee] = await db
      .select({ userId: caseAssignments.userId })
      .from(caseAssignments)
      .where(
        and(
          eq(caseAssignments.caseId, input.caseId),
          isNull(caseAssignments.unassignedAt),
        ),
      )
      .orderBy(desc(caseAssignments.isPrimary))
      .limit(1);

    const eventId = await recordSupervisorEvent({
      organizationId: input.orgId,
      caseId: input.caseId,
      eventType: "appeal_deadline_approaching",
      summary: input.summaryText,
      recommendedAction: input.recommendedAction,
      assignedUserId: assignee?.userId ?? null,
      payload: { ruleType: input.ruleType, ...input.payload },
    });
    if (!eventId) {
      errors.push(`recordSupervisorEvent failed for case ${input.caseId} rule ${input.ruleType}`);
      return;
    }
    recorded++;

    if (assignee?.userId) {
      const notifId = await createNotification({
        organizationId: input.orgId,
        userId: assignee.userId,
        caseId: input.caseId,
        title: rule.label,
        body: input.summaryText.slice(0, 300),
        priority: input.priority,
        actionLabel: "Open case",
        actionHref: `/cases/${input.caseId}/supervisor-timeline`,
        dedupeKey: `deadline:${input.caseId}:${input.ruleType}`,
        sourceEventId: eventId,
      });
      if (notifId) {
        notified++;
        await linkArtifactToEvent(eventId, "notification", notifId);
      }
    }
  }

  // ----- Rule: fee_petition -----
  // Cases with a favorable decision >30 days old and no fee petition filed
  try {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

    const favorableOutcomes = await db
      .select({
        caseId: hearingOutcomes.caseId,
        organizationId: hearingOutcomes.organizationId,
        outcomeReceivedAt: hearingOutcomes.outcomeReceivedAt,
      })
      .from(hearingOutcomes)
      .where(
        and(
          eq(hearingOutcomes.outcome, "favorable"),
          isNotNull(hearingOutcomes.outcomeReceivedAt),
          sql`${hearingOutcomes.outcomeReceivedAt} <= ${thirtyDaysAgo.toISOString()}`,
          sql`${hearingOutcomes.outcomeReceivedAt} >= ${sixtyDaysAgo.toISOString()}`,
        ),
      )
      .limit(MAX_CASES_PER_RUN);

    for (const outcome of favorableOutcomes) {
      // Check if a fee petition already exists
      const [existingPetition] = await db
        .select({ id: feePetitions.id })
        .from(feePetitions)
        .where(eq(feePetitions.caseId, outcome.caseId))
        .limit(1);
      if (existingPetition) continue;

      const [caseRow] = await db
        .select({ caseNumber: cases.caseNumber })
        .from(cases)
        .where(and(eq(cases.id, outcome.caseId), isNull(cases.deletedAt)))
        .limit(1);
      if (!caseRow) continue;

      const daysSinceDecision = Math.floor(
        (now.getTime() - (outcome.outcomeReceivedAt?.getTime() ?? now.getTime())) / 86400000,
      );

      await recordAndNotify({
        orgId: outcome.organizationId,
        caseId: outcome.caseId,
        caseNumber: caseRow.caseNumber,
        ruleType: "fee_petition",
        summaryText: `Case ${caseRow.caseNumber}: favorable decision received ${daysSinceDecision} days ago but no fee petition has been filed (60-day deadline)`,
        recommendedAction: "File fee petition with SSA before the 60-day window closes.",
        payload: { daysSinceDecision, outcomeReceivedAt: outcome.outcomeReceivedAt?.toISOString() },
        priority: daysSinceDecision >= 50 ? "urgent" : "high",
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`fee_petition scan: ${msg}`);
    logger.error("Cron deadline-scan fee_petition failed", { error: msg });
  }

  // ----- Rule: rfc_follow_up -----
  // Open RFC requests with due date within 5 days
  try {
    const fiveDaysFromNow = new Date(now.getTime() + 5 * 86400000);

    const approachingRfcs = await db
      .select({
        id: rfcRequests.id,
        caseId: rfcRequests.caseId,
        organizationId: rfcRequests.organizationId,
        dueDate: rfcRequests.dueDate,
        providerName: rfcRequests.providerName,
      })
      .from(rfcRequests)
      .where(
        and(
          sql`${rfcRequests.status} NOT IN ('received', 'completed')`,
          isNotNull(rfcRequests.dueDate),
          sql`${rfcRequests.dueDate} >= ${now.toISOString()}`,
          sql`${rfcRequests.dueDate} <= ${fiveDaysFromNow.toISOString()}`,
        ),
      )
      .limit(MAX_CASES_PER_RUN);

    for (const rfc of approachingRfcs) {
      if (!rfc.dueDate) continue;

      const [caseRow] = await db
        .select({ caseNumber: cases.caseNumber })
        .from(cases)
        .where(and(eq(cases.id, rfc.caseId), isNull(cases.deletedAt)))
        .limit(1);
      if (!caseRow) continue;

      const daysUntilDue = Math.ceil(
        (rfc.dueDate.getTime() - now.getTime()) / 86400000,
      );

      await recordAndNotify({
        orgId: rfc.organizationId,
        caseId: rfc.caseId,
        caseNumber: caseRow.caseNumber,
        ruleType: "rfc_follow_up",
        summaryText: `Case ${caseRow.caseNumber}: RFC from ${rfc.providerName ?? "provider"} is due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`,
        recommendedAction: "Follow up with treating physician on RFC form before the deadline.",
        payload: { dueDate: rfc.dueDate.toISOString(), providerName: rfc.providerName, daysUntilDue },
        priority: daysUntilDue <= 2 ? "urgent" : "high",
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`rfc_follow_up scan: ${msg}`);
    logger.error("Cron deadline-scan rfc_follow_up failed", { error: msg });
  }

  // ----- Rule: mr_follow_up -----
  // Open RFC requests (MR perspective) that were requested >10 days ago
  // and have no due date set, or overdue. Reminder for MR team to follow up.
  try {
    const tenDaysAgo = new Date(now.getTime() - 10 * 86400000);

    const staleMrRequests = await db
      .select({
        id: rfcRequests.id,
        caseId: rfcRequests.caseId,
        organizationId: rfcRequests.organizationId,
        requestedAt: rfcRequests.requestedAt,
        providerName: rfcRequests.providerName,
      })
      .from(rfcRequests)
      .where(
        and(
          eq(rfcRequests.status, "requested"),
          isNotNull(rfcRequests.requestedAt),
          sql`${rfcRequests.requestedAt} <= ${tenDaysAgo.toISOString()}`,
        ),
      )
      .limit(MAX_CASES_PER_RUN);

    for (const mr of staleMrRequests) {
      const [caseRow] = await db
        .select({ caseNumber: cases.caseNumber })
        .from(cases)
        .where(and(eq(cases.id, mr.caseId), isNull(cases.deletedAt)))
        .limit(1);
      if (!caseRow) continue;

      const daysSinceRequest = Math.floor(
        (now.getTime() - (mr.requestedAt?.getTime() ?? now.getTime())) / 86400000,
      );

      await recordAndNotify({
        orgId: mr.organizationId,
        caseId: mr.caseId,
        caseNumber: caseRow.caseNumber,
        ruleType: "mr_follow_up",
        summaryText: `Case ${caseRow.caseNumber}: medical records from ${mr.providerName ?? "provider"} requested ${daysSinceRequest} days ago with no response`,
        recommendedAction: "Follow up with provider on outstanding medical records request.",
        payload: { requestedAt: mr.requestedAt?.toISOString(), providerName: mr.providerName, daysSinceRequest },
        priority: daysSinceRequest >= 14 ? "urgent" : "high",
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`mr_follow_up scan: ${msg}`);
    logger.error("Cron deadline-scan mr_follow_up failed", { error: msg });
  }

  // ----- Rule: good_cause_response -----
  // Cases where a denial_received supervisor event exists and we're >50 days
  // since the denial with no subsequent appeal action taken (no later
  // supervisor event for that case beyond the denial)
  try {
    const fiftyDaysAgo = new Date(now.getTime() - 50 * 86400000);
    const sixtyFiveDaysAgo = new Date(now.getTime() - 65 * 86400000);

    const denialEvents = await db
      .select({
        id: supervisorEvents.id,
        caseId: supervisorEvents.caseId,
        organizationId: supervisorEvents.organizationId,
        createdAt: supervisorEvents.createdAt,
      })
      .from(supervisorEvents)
      .where(
        and(
          eq(supervisorEvents.eventType, "denial_received"),
          sql`${supervisorEvents.createdAt} <= ${fiftyDaysAgo.toISOString()}`,
          sql`${supervisorEvents.createdAt} >= ${sixtyFiveDaysAgo.toISOString()}`,
        ),
      )
      .limit(MAX_CASES_PER_RUN);

    for (const evt of denialEvents) {
      if (!evt.caseId) continue;

      // Check if any follow-up action was taken after the denial
      const [followUp] = await db
        .select({ id: supervisorEvents.id })
        .from(supervisorEvents)
        .where(
          and(
            eq(supervisorEvents.caseId, evt.caseId),
            sql`${supervisorEvents.eventType} IN ('appeal_filed', 'reconsideration_filed', 'good_cause_submitted')`,
            sql`${supervisorEvents.createdAt} > ${evt.createdAt.toISOString()}`,
          ),
        )
        .limit(1);
      if (followUp) continue;

      const [caseRow] = await db
        .select({ caseNumber: cases.caseNumber })
        .from(cases)
        .where(and(eq(cases.id, evt.caseId), eq(cases.status, "active"), isNull(cases.deletedAt)))
        .limit(1);
      if (!caseRow) continue;

      const daysSinceDenial = Math.floor(
        (now.getTime() - evt.createdAt.getTime()) / 86400000,
      );

      await recordAndNotify({
        orgId: evt.organizationId,
        caseId: evt.caseId,
        caseNumber: caseRow.caseNumber,
        ruleType: "good_cause_response",
        summaryText: `Case ${caseRow.caseNumber}: denial received ${daysSinceDenial} days ago, approaching 65-day appeal window with no action taken`,
        recommendedAction: "File appeal or document good cause for late filing before the 65-day window closes.",
        payload: { denialDate: evt.createdAt.toISOString(), daysSinceDenial },
        priority: daysSinceDenial >= 58 ? "urgent" : "high",
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`good_cause_response scan: ${msg}`);
    logger.error("Cron deadline-scan good_cause_response failed", { error: msg });
  }

  // ----- Rule: appeal_reconsideration -----
  // Cases with denial_received where the 65-day window is closing (50-65 days)
  // and no reconsideration has been filed. Uses the same denial events but
  // with a slightly different framing.
  try {
    const fiftyDaysAgo = new Date(now.getTime() - 50 * 86400000);
    const sixtyFiveDaysAgo = new Date(now.getTime() - 65 * 86400000);

    const reconDenials = await db
      .select({
        id: supervisorEvents.id,
        caseId: supervisorEvents.caseId,
        organizationId: supervisorEvents.organizationId,
        createdAt: supervisorEvents.createdAt,
      })
      .from(supervisorEvents)
      .where(
        and(
          eq(supervisorEvents.eventType, "denial_received"),
          sql`${supervisorEvents.createdAt} <= ${fiftyDaysAgo.toISOString()}`,
          sql`${supervisorEvents.createdAt} >= ${sixtyFiveDaysAgo.toISOString()}`,
        ),
      )
      .limit(MAX_CASES_PER_RUN);

    for (const evt of reconDenials) {
      if (!evt.caseId) continue;

      // Check for any reconsideration filing
      const [recon] = await db
        .select({ id: supervisorEvents.id })
        .from(supervisorEvents)
        .where(
          and(
            eq(supervisorEvents.caseId, evt.caseId),
            sql`${supervisorEvents.eventType} IN ('reconsideration_filed', 'appeal_filed')`,
            sql`${supervisorEvents.createdAt} > ${evt.createdAt.toISOString()}`,
          ),
        )
        .limit(1);
      if (recon) continue;

      const [caseRow] = await db
        .select({ caseNumber: cases.caseNumber })
        .from(cases)
        .where(and(eq(cases.id, evt.caseId), eq(cases.status, "active"), isNull(cases.deletedAt)))
        .limit(1);
      if (!caseRow) continue;

      const daysSinceDenial = Math.floor(
        (now.getTime() - evt.createdAt.getTime()) / 86400000,
      );
      const daysRemaining = 65 - daysSinceDenial;

      await recordAndNotify({
        orgId: evt.organizationId,
        caseId: evt.caseId,
        caseNumber: caseRow.caseNumber,
        ruleType: "appeal_reconsideration",
        summaryText: `Case ${caseRow.caseNumber}: ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining to file Request for Reconsideration (denial was ${daysSinceDenial} days ago)`,
        recommendedAction: "File Request for Reconsideration before the 65-day deadline.",
        payload: { denialDate: evt.createdAt.toISOString(), daysSinceDenial, daysRemaining },
        priority: daysRemaining <= 7 ? "urgent" : "high",
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`appeal_reconsideration scan: ${msg}`);
    logger.error("Cron deadline-scan appeal_reconsideration failed", { error: msg });
  }

  const scanSummary = {
    recorded,
    notified,
    errorCount: errors.length,
    hearingWindowDays: HEARING_WINDOW_DAYS,
  };
  logger.info("Cron deadline-scan sweep complete", scanSummary);

  return NextResponse.json({ success: true, ...scanSummary });
}
