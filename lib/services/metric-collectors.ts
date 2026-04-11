import "server-only";

import { db } from "@/db/drizzle";
import {
  tasks,
  cases,
  caseAssignments,
  caseStages,
  caseStageTransitions,
  leads,
  calendarEvents,
  rfcRequests,
  documents,
  outboundMail,
  ereCredentials,
} from "@/db/schema";
import { callRecordings, callQcReviews } from "@/db/schema/call-qc";
import { and, eq, gte, lt, lte, isNull, isNotNull, sql, inArray } from "drizzle-orm";
import { getRoleMetricPack } from "@/lib/services/role-metrics";
import { logger } from "@/lib/logger/server";

/**
 * Metric collector library. For each metric key defined in
 * `ROLE_METRICS`, a collector pulls the raw rows and returns a numeric
 * value (+ optional context). Used by the nightly rollup cron and the
 * on-demand performance snapshot seeder.
 *
 * Every collector:
 *   - Takes a `CollectorInput` (user + period window)
 *   - Returns `{ value: number, context?: object }`
 *   - Catches its own errors and returns `{ value: 0, context: { error } }`
 *     so a single broken metric never kills the rollup
 */

export type CollectorUser = {
  id: string;
  organizationId: string;
  role: string;
  team: string | null;
};

export type CollectorInput = {
  user: CollectorUser;
  periodStart: Date;
  periodEnd: Date;
};

export type CollectorResult = {
  value: number;
  context?: Record<string, unknown>;
};

export type MetricCollector = (input: CollectorInput) => Promise<CollectorResult>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeNumber(n: number | null | undefined): number {
  if (n === null || n === undefined || Number.isNaN(n)) return 0;
  return Number(n);
}

/** Days in the period window (at least 1). */
function periodDays(input: CollectorInput): number {
  const ms = input.periodEnd.getTime() - input.periodStart.getTime();
  const days = Math.max(1, Math.round(ms / 86_400_000));
  return days;
}

/** Wrap a raw collector in a safe try/catch that returns a 0-value on failure. */
function safe(collector: MetricCollector): MetricCollector {
  return async (input) => {
    try {
      return await collector(input);
    } catch (err) {
      logger.warn("metric collector failed", {
        userId: input.user.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        value: 0,
        context: {
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  };
}

// ---------------------------------------------------------------------------
// Collectors — shared / generic
// ---------------------------------------------------------------------------

/**
 * Share of tasks assigned to the user in the period that were completed
 * on or before their due date (or period end if no due date).
 */
const taskCompletionRate: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(case when ${tasks.status} = 'completed' then 1 end)::int`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.organizationId, user.organizationId),
        eq(tasks.assignedToId, user.id),
        gte(tasks.createdAt, periodStart),
        lt(tasks.createdAt, periodEnd),
        isNull(tasks.deletedAt),
      ),
    );
  const total = safeNumber(rows[0]?.total);
  const completed = safeNumber(rows[0]?.completed);
  if (total === 0) {
    return { value: 0, context: { sampleSize: 0, note: "no tasks in window" } };
  }
  return {
    value: Math.round((completed / total) * 100 * 100) / 100,
    context: { total, completed },
  };
};

/**
 * Average response time in minutes — proxied via the delta between
 * inbound and the next outbound message on the same case, grouped by
 * the user who sent the outbound. Minimal schema doesn't have
 * respondedAt/responseTimeSeconds yet.
 */
const avgResponseTimeMinutes: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  const result = await db.execute<{ avg_minutes: number; n: number }>(sql`
    WITH outbound AS (
      SELECT
        c.case_id,
        c.created_at AS responded_at,
        (
          SELECT MAX(inb.created_at)
          FROM communications inb
          WHERE inb.case_id = c.case_id
            AND inb.created_at < c.created_at
            AND inb.type IN ('email_inbound', 'message_inbound', 'phone_inbound')
        ) AS prev_inbound
      FROM communications c
      WHERE c.organization_id = ${user.organizationId}
        AND c.user_id = ${user.id}::uuid
        AND c.type IN ('email_outbound', 'message_outbound', 'phone_outbound')
        AND c.created_at >= ${periodStart}
        AND c.created_at < ${periodEnd}
    )
    SELECT
      COALESCE(AVG(EXTRACT(EPOCH FROM (responded_at - prev_inbound)) / 60), 0)::float AS avg_minutes,
      COUNT(prev_inbound)::int AS n
    FROM outbound
    WHERE prev_inbound IS NOT NULL
  `);
  const row = result[0];
  const avgMinutes = safeNumber(row?.avg_minutes);
  const count = safeNumber(row?.n);
  if (count === 0) {
    return { value: 0, context: { sampleSize: 0 } };
  }
  return {
    value: Math.round(avgMinutes * 100) / 100,
    context: { sampleSize: count },
  };
};

/**
 * Count of "unread" inbound messages across cases assigned to this user.
 * Schema has no readAt column yet; we approximate as inbound messages
 * from the last 7 days on assigned cases where no outbound reply exists.
 */
const unreadMessagesBacklog: MetricCollector = async ({ user }) => {
  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  const result = await db.execute<{ c: number }>(sql`
    SELECT COUNT(*)::int AS c
    FROM communications inb
    INNER JOIN case_assignments ca
      ON ca.case_id = inb.case_id
      AND ca.user_id = ${user.id}::uuid
      AND ca.unassigned_at IS NULL
    WHERE inb.organization_id = ${user.organizationId}
      AND inb.type IN ('email_inbound', 'message_inbound', 'phone_inbound')
      AND inb.created_at >= ${cutoff}
      AND NOT EXISTS (
        SELECT 1 FROM communications outb
        WHERE outb.case_id = inb.case_id
          AND outb.created_at > inb.created_at
          AND outb.type IN ('email_outbound', 'message_outbound', 'phone_outbound')
      )
  `);
  return { value: safeNumber(result[0]?.c) };
};

/**
 * Active case count owned by this user (via any assignment role).
 */
const activeCases: MetricCollector = async ({ user }) => {
  const rows = await db
    .select({
      c: sql<number>`count(distinct ${cases.id})::int`,
    })
    .from(caseAssignments)
    .innerJoin(
      cases,
      and(
        eq(caseAssignments.caseId, cases.id),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
      ),
    )
    .where(
      and(
        eq(caseAssignments.userId, user.id),
        isNull(caseAssignments.unassignedAt),
      ),
    );
  return { value: safeNumber(rows[0]?.c) };
};

/**
 * Count of stage transitions this user initiated (transitioned_by) in the
 * period, normalized to a per-day rate.
 */
const applicationsFiledPerDay: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  // stage transitions into stages with code containing "filed" or
  // owning_team = filing + transitioned_by = user
  const rows = await db
    .select({
      c: sql<number>`count(*)::int`,
    })
    .from(caseStageTransitions)
    .innerJoin(caseStages, eq(caseStageTransitions.toStageId, caseStages.id))
    .where(
      and(
        eq(caseStageTransitions.transitionedBy, user.id),
        gte(caseStageTransitions.transitionedAt, periodStart),
        lt(caseStageTransitions.transitionedAt, periodEnd),
        sql`(${caseStages.code} ILIKE '%filed%' OR ${caseStages.owningTeam} = 'filing')`,
      ),
    );
  const total = safeNumber(rows[0]?.c);
  const days = periodDays({ user, periodStart, periodEnd });
  return {
    value: Math.round((total / days) * 100) / 100,
    context: { total, days },
  };
};

/**
 * MR requests sent per day — RFC requests the user owns plus outbound
 * mail tagged "medical records".
 */
const mrRequestsSentPerDay: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  const rfcRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(rfcRequests)
    .where(
      and(
        eq(rfcRequests.organizationId, user.organizationId),
        eq(rfcRequests.assignedTo, user.id),
        gte(rfcRequests.requestedAt, periodStart),
        lt(rfcRequests.requestedAt, periodEnd),
      ),
    );
  const mailRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(outboundMail)
    .where(
      and(
        eq(outboundMail.organizationId, user.organizationId),
        eq(outboundMail.sentBy, user.id),
        gte(outboundMail.sentAt, periodStart),
        lt(outboundMail.sentAt, periodEnd),
      ),
    );
  const total = safeNumber(rfcRows[0]?.c) + safeNumber(mailRows[0]?.c);
  const days = periodDays({ user, periodStart, periodEnd });
  return {
    value: Math.round((total / days) * 100) / 100,
    context: {
      rfcRequests: safeNumber(rfcRows[0]?.c),
      outboundMail: safeNumber(mailRows[0]?.c),
      days,
    },
  };
};

/**
 * New leads touched by the user per day in the period. Counts leads
 * where createdBy = user OR assignedToId = user within the window.
 */
const newLeadsHandledPerDay: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(leads)
    .where(
      and(
        eq(leads.organizationId, user.organizationId),
        sql`(${leads.createdBy} = ${user.id} OR ${leads.assignedToId} = ${user.id})`,
        gte(leads.createdAt, periodStart),
        lt(leads.createdAt, periodEnd),
        isNull(leads.deletedAt),
      ),
    );
  const total = safeNumber(rows[0]?.c);
  const days = periodDays({ user, periodStart, periodEnd });
  return {
    value: Math.round((total / days) * 100) / 100,
    context: { total, days },
  };
};

/**
 * Lead conversion rate: share of leads touched by user in the window
 * that converted to a case.
 */
const leadConversionRate: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      converted: sql<number>`count(case when ${leads.convertedAt} is not null then 1 end)::int`,
    })
    .from(leads)
    .where(
      and(
        eq(leads.organizationId, user.organizationId),
        sql`(${leads.createdBy} = ${user.id} OR ${leads.assignedToId} = ${user.id})`,
        gte(leads.createdAt, periodStart),
        lt(leads.createdAt, periodEnd),
        isNull(leads.deletedAt),
      ),
    );
  const total = safeNumber(rows[0]?.total);
  const converted = safeNumber(rows[0]?.converted);
  if (total === 0) return { value: 0, context: { sampleSize: 0 } };
  return {
    value: Math.round((converted / total) * 100 * 100) / 100,
    context: { total, converted },
  };
};

/**
 * Win rate for attorneys / hearing advocates in the last 180d. We look
 * at all closed decisions for cases where the user was assigned (not
 * just the period, because wins per day is too sparse).
 */
const winRate: MetricCollector = async ({ user }) => {
  const rows = await db
    .select({
      won: sql<number>`count(distinct case when ${cases.status} = 'closed_won' then ${cases.id} end)::int`,
      lost: sql<number>`count(distinct case when ${cases.status} = 'closed_lost' then ${cases.id} end)::int`,
    })
    .from(caseAssignments)
    .innerJoin(
      cases,
      and(
        eq(caseAssignments.caseId, cases.id),
        inArray(cases.status, ["closed_won", "closed_lost"]),
        isNull(cases.deletedAt),
      ),
    )
    .where(eq(caseAssignments.userId, user.id));
  const won = safeNumber(rows[0]?.won);
  const lost = safeNumber(rows[0]?.lost);
  if (won + lost === 0) return { value: 0, context: { sampleSize: 0 } };
  return {
    value: Math.round((won / (won + lost)) * 100 * 100) / 100,
    context: { won, lost },
  };
};

/**
 * Hearings scheduled for this user in the next 7 days.
 */
const hearingsThisWeek: MetricCollector = async ({ user }) => {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86_400_000);
  const rows = await db
    .select({
      c: sql<number>`count(distinct ${calendarEvents.id})::int`,
    })
    .from(calendarEvents)
    .innerJoin(
      caseAssignments,
      and(
        eq(caseAssignments.caseId, calendarEvents.caseId),
        eq(caseAssignments.userId, user.id),
        isNull(caseAssignments.unassignedAt),
      ),
    )
    .where(
      and(
        eq(calendarEvents.organizationId, user.organizationId),
        eq(calendarEvents.eventType, "hearing"),
        gte(calendarEvents.startAt, now),
        lt(calendarEvents.startAt, weekFromNow),
        isNull(calendarEvents.deletedAt),
      ),
    );
  return { value: safeNumber(rows[0]?.c) };
};

/**
 * Number of cases assigned to user whose stageEnteredAt is more than
 * 14 days ago (no stage movement in 14+ days).
 */
const stagnantCaseCount: MetricCollector = async ({ user }) => {
  const cutoff = new Date(Date.now() - 14 * 86_400_000);
  const rows = await db
    .select({
      c: sql<number>`count(distinct ${cases.id})::int`,
    })
    .from(caseAssignments)
    .innerJoin(
      cases,
      and(
        eq(caseAssignments.caseId, cases.id),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
      ),
    )
    .where(
      and(
        eq(caseAssignments.userId, user.id),
        isNull(caseAssignments.unassignedAt),
        lt(cases.stageEnteredAt, cutoff),
      ),
    );
  return { value: safeNumber(rows[0]?.c) };
};

/**
 * Count of stage transitions owned by the user in the period
 * (normalized to the period window, not per-day).
 */
const stageTransitionsPerWeek: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(caseStageTransitions)
    .where(
      and(
        eq(caseStageTransitions.transitionedBy, user.id),
        gte(caseStageTransitions.transitionedAt, periodStart),
        lt(caseStageTransitions.transitionedAt, periodEnd),
      ),
    );
  const total = safeNumber(rows[0]?.c);
  const days = periodDays({ user, periodStart, periodEnd });
  const perWeek = (total / days) * 7;
  return {
    value: Math.round(perWeek * 100) / 100,
    context: { total, days },
  };
};

/**
 * Contracts sent per day by this user. Counted via outboundMail where
 * the notes contain "contract" OR via lead signature requests created
 * in the period.
 */
const contractsSentPerDay: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(outboundMail)
    .where(
      and(
        eq(outboundMail.organizationId, user.organizationId),
        eq(outboundMail.sentBy, user.id),
        gte(outboundMail.sentAt, periodStart),
        lt(outboundMail.sentAt, periodEnd),
        sql`${outboundMail.notes} ILIKE '%contract%'`,
      ),
    );
  const total = safeNumber(rows[0]?.c);
  const days = periodDays({ user, periodStart, periodEnd });
  return {
    value: Math.round((total / days) * 100) / 100,
    context: { total, days, note: "proxied via outbound mail 'contract' notes" },
  };
};

/**
 * Follow-up compliance — share of tasks created for this user with
 * title containing "follow" or "follow-up" that were completed before
 * their due date.
 */
const followUpComplianceRate: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      onTime: sql<number>`count(case when ${tasks.status} = 'completed' and (${tasks.completedAt} <= ${tasks.dueDate} or ${tasks.dueDate} is null) then 1 end)::int`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.organizationId, user.organizationId),
        eq(tasks.assignedToId, user.id),
        gte(tasks.createdAt, periodStart),
        lt(tasks.createdAt, periodEnd),
        sql`${tasks.title} ILIKE '%follow%'`,
        isNull(tasks.deletedAt),
      ),
    );
  const total = safeNumber(rows[0]?.total);
  const onTime = safeNumber(rows[0]?.onTime);
  if (total === 0) return { value: 0, context: { sampleSize: 0 } };
  return {
    value: Math.round((onTime / total) * 100 * 100) / 100,
    context: { total, onTime },
  };
};

// ---------------------------------------------------------------------------
// Filing-specific
// ---------------------------------------------------------------------------

const avgTimeReadyToFiledHours: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  // Find "filed" transitions in the window by this user, look up the
  // previous transition for the same case, compute avg hours between.
  const result = await db.execute<{ avg_hours: number; n: number }>(sql`
    WITH filed AS (
      SELECT t.case_id, t.transitioned_at AS filed_at,
        LAG(t.transitioned_at) OVER (PARTITION BY t.case_id ORDER BY t.transitioned_at) AS prev_at
      FROM case_stage_transitions t
      INNER JOIN case_stages s ON s.id = t.to_stage_id
      WHERE t.transitioned_by = ${user.id}
        AND (s.code ILIKE '%filed%' OR s.owning_team = 'filing')
        AND t.transitioned_at >= ${periodStart}
        AND t.transitioned_at < ${periodEnd}
    )
    SELECT
      COALESCE(AVG(EXTRACT(EPOCH FROM (filed_at - prev_at)) / 3600), 0)::float AS avg_hours,
      COUNT(prev_at)::int AS n
    FROM filed
    WHERE prev_at IS NOT NULL
  `);
  const row = result[0];
  return {
    value: Math.round(safeNumber(row?.avg_hours) * 100) / 100,
    context: { sampleSize: safeNumber(row?.n) },
  };
};

const queueDepth: MetricCollector = async ({ user }) => {
  // Cases in "ready to file" stages (owning_team = filing) where no
  // filed transition has happened yet.
  const rows = await db
    .select({
      c: sql<number>`count(distinct ${cases.id})::int`,
    })
    .from(cases)
    .innerJoin(caseStages, eq(cases.currentStageId, caseStages.id))
    .where(
      and(
        eq(cases.organizationId, user.organizationId),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
        eq(caseStages.owningTeam, "filing"),
      ),
    );
  return {
    value: safeNumber(rows[0]?.c),
    context: { note: "org-wide filing queue" },
  };
};

const filingErrorRate: MetricCollector = async () => {
  // We don't currently record filing rejections; return 0 with a note.
  return { value: 0, context: { note: "no filing rejection data available" } };
};

// ---------------------------------------------------------------------------
// Medical records / PHI / hearings
// ---------------------------------------------------------------------------

const mrRequestTurnaroundDays: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  const result = await db.execute<{ avg_days: number; n: number }>(sql`
    SELECT
      COALESCE(AVG(EXTRACT(EPOCH FROM (received_at - requested_at)) / 86400), 0)::float AS avg_days,
      COUNT(*)::int AS n
    FROM rfc_requests
    WHERE assigned_to = ${user.id}
      AND organization_id = ${user.organizationId}
      AND received_at IS NOT NULL
      AND requested_at IS NOT NULL
      AND requested_at >= ${periodStart}
      AND requested_at < ${periodEnd}
  `);
  const row = result[0];
  return {
    value: Math.round(safeNumber(row?.avg_days) * 100) / 100,
    context: { sampleSize: safeNumber(row?.n) },
  };
};

const recordsCompleteByHearingDate: MetricCollector = async ({ user }) => {
  // Share of user-assigned cases with a hearing in the next 14 days
  // whose mrStatus = 'complete' or equivalent.
  const cutoff = new Date(Date.now() + 14 * 86_400_000);
  const rows = await db
    .select({
      total: sql<number>`count(distinct ${cases.id})::int`,
      complete: sql<number>`count(distinct case when ${cases.mrStatus} = 'complete' then ${cases.id} end)::int`,
    })
    .from(cases)
    .innerJoin(
      caseAssignments,
      and(
        eq(caseAssignments.caseId, cases.id),
        eq(caseAssignments.userId, user.id),
        isNull(caseAssignments.unassignedAt),
      ),
    )
    .where(
      and(
        eq(cases.organizationId, user.organizationId),
        isNull(cases.deletedAt),
        isNotNull(cases.hearingDate),
        lte(cases.hearingDate, cutoff),
      ),
    );
  const total = safeNumber(rows[0]?.total);
  const complete = safeNumber(rows[0]?.complete);
  if (total === 0) return { value: 0, context: { sampleSize: 0 } };
  return {
    value: Math.round((complete / total) * 100 * 100) / 100,
    context: { total, complete },
  };
};

const rfcFormsCompletedPerWeek: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(rfcRequests)
    .where(
      and(
        eq(rfcRequests.organizationId, user.organizationId),
        eq(rfcRequests.assignedTo, user.id),
        eq(rfcRequests.status, "completed"),
        gte(rfcRequests.completedAt, periodStart),
        lt(rfcRequests.completedAt, periodEnd),
      ),
    );
  const total = safeNumber(rows[0]?.c);
  const days = periodDays({ user, periodStart, periodEnd });
  const perWeek = (total / days) * 7;
  return {
    value: Math.round(perWeek * 100) / 100,
    context: { total, days },
  };
};

const phiSheetsCompletedPerWeek: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, user.organizationId),
        eq(cases.phiSheetWriterId, user.id),
        eq(cases.phiSheetStatus, "complete"),
        gte(cases.phiSheetCompletedAt, periodStart),
        lt(cases.phiSheetCompletedAt, periodEnd),
      ),
    );
  const total = safeNumber(rows[0]?.c);
  const days = periodDays({ user, periodStart, periodEnd });
  const perWeek = (total / days) * 7;
  return {
    value: Math.round(perWeek * 100) / 100,
    context: { total, days },
  };
};

const phiSheetTurnaroundHours: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  const result = await db.execute<{ avg_hours: number; n: number }>(sql`
    SELECT
      COALESCE(AVG(EXTRACT(EPOCH FROM (phi_sheet_completed_at - phi_sheet_started_at)) / 3600), 0)::float AS avg_hours,
      COUNT(*)::int AS n
    FROM cases
    WHERE phi_sheet_writer_id = ${user.id}
      AND organization_id = ${user.organizationId}
      AND phi_sheet_completed_at IS NOT NULL
      AND phi_sheet_started_at IS NOT NULL
      AND phi_sheet_completed_at >= ${periodStart}
      AND phi_sheet_completed_at < ${periodEnd}
  `);
  const row = result[0];
  return {
    value: Math.round(safeNumber(row?.avg_hours) * 100) / 100,
    context: { sampleSize: safeNumber(row?.n) },
  };
};

const overduePhiSheetCount: MetricCollector = async ({ user }) => {
  // Assigned PHI sheets whose case hearing date is within 7 days and
  // PHI sheet isn't complete.
  const cutoff = new Date(Date.now() + 7 * 86_400_000);
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, user.organizationId),
        eq(cases.phiSheetWriterId, user.id),
        sql`${cases.phiSheetStatus} != 'complete'`,
        isNotNull(cases.hearingDate),
        lt(cases.hearingDate, cutoff),
      ),
    );
  return { value: safeNumber(rows[0]?.c) };
};

const phiReviewCycleCount: MetricCollector = async () => {
  return {
    value: 0,
    context: { note: "no PHI review cycle data recorded" },
  };
};

const prepCompletionRate: MetricCollector = async ({ user }) => {
  // Share of this user's upcoming hearings (next 30 days) where
  // phiSheetStatus = 'complete' at least 3 days before.
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 86_400_000);
  const rows = await db
    .select({
      total: sql<number>`count(distinct ${cases.id})::int`,
      prepped: sql<number>`count(distinct case when ${cases.phiSheetStatus} = 'complete' then ${cases.id} end)::int`,
    })
    .from(cases)
    .innerJoin(
      caseAssignments,
      and(
        eq(caseAssignments.caseId, cases.id),
        eq(caseAssignments.userId, user.id),
        isNull(caseAssignments.unassignedAt),
      ),
    )
    .where(
      and(
        eq(cases.organizationId, user.organizationId),
        isNull(cases.deletedAt),
        isNotNull(cases.hearingDate),
        gte(cases.hearingDate, now),
        lt(cases.hearingDate, end),
      ),
    );
  const total = safeNumber(rows[0]?.total);
  const prepped = safeNumber(rows[0]?.prepped);
  if (total === 0) return { value: 0, context: { sampleSize: 0 } };
  return {
    value: Math.round((prepped / total) * 100 * 100) / 100,
    context: { total, prepped },
  };
};

const avgCaseAgeDays: MetricCollector = async ({ user }) => {
  const result = await db.execute<{ avg_days: number }>(sql`
    SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 86400), 0)::float AS avg_days
    FROM cases c
    INNER JOIN case_assignments ca ON ca.case_id = c.id AND ca.user_id = ${user.id} AND ca.unassigned_at IS NULL
    WHERE c.organization_id = ${user.organizationId}
      AND c.status = 'active'
      AND c.deleted_at IS NULL
  `);
  return {
    value: Math.round(safeNumber(result[0]?.avg_days) * 10) / 10,
  };
};

const clientNps: MetricCollector = async () => {
  return { value: 0, context: { note: "NPS not implemented" } };
};

// ---------------------------------------------------------------------------
// Hearings advocate
// ---------------------------------------------------------------------------

const hearingsRepresentedPerWeek: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  const rows = await db
    .select({
      c: sql<number>`count(distinct ${calendarEvents.id})::int`,
    })
    .from(calendarEvents)
    .innerJoin(
      caseAssignments,
      and(
        eq(caseAssignments.caseId, calendarEvents.caseId),
        eq(caseAssignments.userId, user.id),
        isNull(caseAssignments.unassignedAt),
      ),
    )
    .where(
      and(
        eq(calendarEvents.organizationId, user.organizationId),
        eq(calendarEvents.eventType, "hearing"),
        gte(calendarEvents.startAt, periodStart),
        lt(calendarEvents.startAt, periodEnd),
        isNull(calendarEvents.deletedAt),
      ),
    );
  const total = safeNumber(rows[0]?.c);
  const days = periodDays({ user, periodStart, periodEnd });
  const perWeek = (total / days) * 7;
  return {
    value: Math.round(perWeek * 100) / 100,
    context: { total, days },
  };
};

const avgTranscriptQcScore: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  const rows = await db
    .select({
      avg: sql<number>`COALESCE(AVG(${callQcReviews.overallScore}), 0)::float`,
      n: sql<number>`count(*)::int`,
    })
    .from(callQcReviews)
    .innerJoin(callRecordings, eq(callQcReviews.callRecordingId, callRecordings.id))
    .where(
      and(
        eq(callRecordings.userId, user.id),
        gte(callQcReviews.createdAt, periodStart),
        lt(callQcReviews.createdAt, periodEnd),
      ),
    );
  return {
    value: Math.round(safeNumber(rows[0]?.avg) * 100) / 100,
    context: { sampleSize: safeNumber(rows[0]?.n) },
  };
};

// ---------------------------------------------------------------------------
// Fee collection, appeals, pre-hearing, post-hearing, mail clerk, reviewer
// ---------------------------------------------------------------------------

const stubMetric = (note: string): MetricCollector => async () => ({
  value: 0,
  context: { note },
});

// Fee collection
const feePetitionFilingDays: MetricCollector = stubMetric(
  "fee petition filing data not tracked yet",
);
const feeCollectionRate: MetricCollector = stubMetric(
  "fee collection rate requires billing integration",
);
const delinquentFeeFollowupCompliance: MetricCollector = stubMetric(
  "delinquent fee followup not tracked yet",
);

// Appeals council
const acBriefsSubmittedPerWeek: MetricCollector = stubMetric(
  "AC brief tracking not implemented",
);
const acBriefsOnTimeRate: MetricCollector = stubMetric(
  "AC on-time tracking not implemented",
);
const acGrantRate: MetricCollector = stubMetric(
  "AC grant rate requires decision tracking",
);

// Pre-hearing prep
const prehearingBriefsDraftedPerWeek: MetricCollector = stubMetric(
  "pre-hearing brief tracking not implemented",
);
const briefOnTimeRate: MetricCollector = stubMetric(
  "brief on-time tracking not implemented",
);
const evidenceIncorporationRate: MetricCollector = stubMetric(
  "evidence incorporation tracking not implemented",
);

// Post-hearing
const postHearingProcessingDays: MetricCollector = stubMetric(
  "post-hearing processing days not tracked yet",
);
const clientNotificationCompliance: MetricCollector = stubMetric(
  "client notification compliance not tracked yet",
);

// Mail clerk
const mailItemsProcessedPerDay: MetricCollector = async ({
  user,
  periodStart,
  periodEnd,
}) => {
  // Documents created by the mail clerk in the period.
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(documents)
    .where(
      and(
        eq(documents.organizationId, user.organizationId),
        eq(documents.createdBy, user.id),
        gte(documents.createdAt, periodStart),
        lt(documents.createdAt, periodEnd),
        isNull(documents.deletedAt),
      ),
    );
  const total = safeNumber(rows[0]?.c);
  const days = periodDays({ user, periodStart, periodEnd });
  return {
    value: Math.round((total / days) * 100) / 100,
    context: { total, days },
  };
};
const avgMailRoutingMinutes: MetricCollector = stubMetric(
  "mail routing time not tracked yet",
);
const unprocessedMailAgingHours: MetricCollector = stubMetric(
  "unprocessed mail aging not tracked yet",
);

// Reviewer
const intakeReviewBacklog: MetricCollector = stubMetric(
  "intake review backlog not tracked yet",
);
const avgReviewTurnaroundHours: MetricCollector = stubMetric(
  "review turnaround not tracked yet",
);

// Admin
const activeEreCredentials: MetricCollector = async ({ user }) => {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(ereCredentials)
    .where(
      and(
        eq(ereCredentials.organizationId, user.organizationId),
        eq(ereCredentials.isActive, true),
      ),
    );
  return { value: safeNumber(rows[0]?.c) };
};

// ---------------------------------------------------------------------------
// Collector registry — every metricKey in ROLE_METRICS should have an entry.
// ---------------------------------------------------------------------------

const COLLECTORS: Record<string, MetricCollector> = {
  // Shared
  task_completion_rate: safe(taskCompletionRate),
  avg_response_time_minutes: safe(avgResponseTimeMinutes),
  unread_messages_backlog: safe(unreadMessagesBacklog),
  active_cases: safe(activeCases),
  stage_transitions_per_week: safe(stageTransitionsPerWeek),
  stagnant_case_count: safe(stagnantCaseCount),
  follow_up_compliance_rate: safe(followUpComplianceRate),

  // Intake
  new_leads_handled_per_day: safe(newLeadsHandledPerDay),
  lead_conversion_rate: safe(leadConversionRate),
  contracts_sent_per_day: safe(contractsSentPerDay),

  // Filing
  applications_filed_per_day: safe(applicationsFiledPerDay),
  avg_time_ready_to_filed_hours: safe(avgTimeReadyToFiledHours),
  queue_depth: safe(queueDepth),
  filing_error_rate: safe(filingErrorRate),

  // Medical records
  mr_requests_sent_per_day: safe(mrRequestsSentPerDay),
  mr_request_turnaround_days: safe(mrRequestTurnaroundDays),
  records_complete_by_hearing_date: safe(recordsCompleteByHearingDate),
  rfc_forms_completed_per_week: safe(rfcFormsCompletedPerWeek),

  // PHI sheet writer
  phi_sheets_completed_per_week: safe(phiSheetsCompletedPerWeek),
  phi_sheet_turnaround_hours: safe(phiSheetTurnaroundHours),
  overdue_phi_sheet_count: safe(overduePhiSheetCount),
  phi_review_cycle_count: safe(phiReviewCycleCount),

  // Attorney / hearing advocate
  hearings_this_week: safe(hearingsThisWeek),
  win_rate: safe(winRate),
  prep_completion_rate: safe(prepCompletionRate),
  avg_case_age_days: safe(avgCaseAgeDays),
  client_nps: safe(clientNps),

  // Hearing advocate
  hearings_represented_per_week: safe(hearingsRepresentedPerWeek),
  avg_transcript_qc_score: safe(avgTranscriptQcScore),

  // Fee collection
  fee_petition_filing_days: safe(feePetitionFilingDays),
  fee_collection_rate: safe(feeCollectionRate),
  delinquent_fee_followup_compliance: safe(delinquentFeeFollowupCompliance),

  // Appeals council
  ac_briefs_submitted_per_week: safe(acBriefsSubmittedPerWeek),
  ac_briefs_on_time_rate: safe(acBriefsOnTimeRate),
  ac_grant_rate: safe(acGrantRate),

  // Pre-hearing prep
  prehearing_briefs_drafted_per_week: safe(prehearingBriefsDraftedPerWeek),
  brief_on_time_rate: safe(briefOnTimeRate),
  evidence_incorporation_rate: safe(evidenceIncorporationRate),

  // Post-hearing
  post_hearing_processing_days: safe(postHearingProcessingDays),
  client_notification_compliance: safe(clientNotificationCompliance),

  // Mail clerk
  mail_items_processed_per_day: safe(mailItemsProcessedPerDay),
  avg_mail_routing_minutes: safe(avgMailRoutingMinutes),
  unprocessed_mail_aging_hours: safe(unprocessedMailAgingHours),

  // Reviewer
  intake_review_backlog: safe(intakeReviewBacklog),
  avg_review_turnaround_hours: safe(avgReviewTurnaroundHours),

  // Admin
  active_ere_credentials: safe(activeEreCredentials),
};

// ---------------------------------------------------------------------------
// Rollup API
// ---------------------------------------------------------------------------

export type CollectedMetric = {
  metricKey: string;
  value: number;
  context?: Record<string, unknown>;
};

/**
 * Run every collector defined in the user's role pack and return the
 * results keyed by metricKey.
 */
export async function collectAllMetricsForUser(
  user: CollectorUser,
  periodStart: Date,
  periodEnd: Date,
): Promise<Record<string, CollectedMetric>> {
  const pack = getRoleMetricPack(user.role);
  const out: Record<string, CollectedMetric> = {};
  for (const metric of pack.metrics) {
    const collector = COLLECTORS[metric.metricKey];
    if (!collector) {
      out[metric.metricKey] = {
        metricKey: metric.metricKey,
        value: 0,
        context: { note: "no collector registered" },
      };
      continue;
    }
    const result = await collector({ user, periodStart, periodEnd });
    out[metric.metricKey] = {
      metricKey: metric.metricKey,
      value: result.value,
      context: result.context,
    };
  }
  return out;
}

/**
 * Expose the raw collector map for advanced use cases (tests, seeders).
 */
export function getCollectorForMetric(metricKey: string): MetricCollector | null {
  return COLLECTORS[metricKey] ?? null;
}
