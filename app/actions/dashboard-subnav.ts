"use server";

import { and, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db/drizzle";
import {
  appealsCouncilBriefs,
  auditLog,
  calendarEvents,
  caseRiskScores,
  cases,
  complianceFindings,
  ereJobs,
  feePetitions,
  hearingOutcomes,
  leads,
  outboundMail,
  providerCredentials,
  rfcRequests,
  supervisorEvents,
  tasks,
  users,
} from "@/db/schema";
import { logger } from "@/lib/logger/server";
import type {
  AdminSubnavData,
  AppealsCouncilSubnavData,
  AttorneySubnavData,
  CaseManagerSubnavData,
  DashboardSubnavData,
  DefaultSubnavData,
  FeeCollectionSubnavData,
  FilingAgentSubnavData,
  IntakeAgentSubnavData,
  MailClerkSubnavData,
  MedicalRecordsSubnavData,
  PhiSheetWriterSubnavData,
  PostHearingSubnavData,
  PreHearingPrepSubnavData,
  ReviewerSubnavData,
  SubnavRecentItem,
} from "@/lib/dashboard-subnav/types";
import { getInboundMailQueue } from "@/app/actions/mail";

function relativeTime(d: Date | null): string {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Per-persona loaders ────────────────────────────────────────────────────

async function loadCaseManagerSubnav(
  orgId: string,
  userId: string,
): Promise<CaseManagerSubnavData> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const fortyEightFromNow = new Date(now.getTime() + 48 * 3600 * 1000);

  const [actionRows, todayCountRow, urgentRow] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        priority: tasks.priority,
        caseId: tasks.caseId,
        caseNumber: cases.caseNumber,
        riskScore: caseRiskScores.score,
      })
      .from(tasks)
      .leftJoin(cases, eq(cases.id, tasks.caseId))
      .leftJoin(caseRiskScores, eq(caseRiskScores.caseId, cases.id))
      .where(
        and(
          eq(tasks.organizationId, orgId),
          eq(tasks.assignedToId, userId),
          inArray(tasks.status, ["pending", "in_progress"]),
          lte(tasks.dueDate, fortyEightFromNow),
          isNull(tasks.deletedAt),
        ),
      )
      .orderBy(tasks.dueDate)
      .limit(8)
      .catch(() => []),
    db
      .select({ n: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, orgId),
          eq(tasks.assignedToId, userId),
          inArray(tasks.status, ["pending", "in_progress"]),
          gte(tasks.dueDate, startOfToday),
          lte(tasks.dueDate, endOfToday),
          isNull(tasks.deletedAt),
        ),
      )
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: count() })
      .from(supervisorEvents)
      .where(
        and(
          eq(supervisorEvents.organizationId, orgId),
          eq(supervisorEvents.status, "awaiting_review"),
        ),
      )
      .catch(() => [{ n: 0 }]),
  ]);

  const nextActions = actionRows.slice(0, 6).map((r) => {
    const overdue = r.dueDate && new Date(r.dueDate).getTime() < Date.now();
    const high = (r.riskScore ?? 0) >= 70 || r.priority === "urgent";
    return {
      id: r.id,
      title: r.title,
      caseId: r.caseId,
      caseNumber: r.caseNumber,
      actionVerb: high ? "Act" : overdue ? "Resolve" : "Review",
      tone: (high ? "bad" : overdue ? "warn" : "info") as
        | "bad"
        | "warn"
        | "info",
    };
  });

  // Cooling threads — placeholder for now (reuses recent supervisor events)
  let coolingThreads: SubnavRecentItem[] = [];
  try {
    const events = await db
      .select({
        id: supervisorEvents.id,
        eventType: supervisorEvents.eventType,
        createdAt: supervisorEvents.createdAt,
        caseId: supervisorEvents.caseId,
      })
      .from(supervisorEvents)
      .where(
        and(
          eq(supervisorEvents.organizationId, orgId),
          inArray(supervisorEvents.status, ["awaiting_review", "detected"]),
        ),
      )
      .orderBy(desc(supervisorEvents.createdAt))
      .limit(5);
    coolingThreads = events.map((e) => ({
      id: e.id,
      title: e.eventType.replace(/_/g, " "),
      meta: relativeTime(e.createdAt),
      href: e.caseId ? `/cases/${e.caseId}` : undefined,
      tone: "amber" as const,
    }));
  } catch (e) {
    logger.error("subnav coolingThreads failed", { error: e });
  }

  return {
    kind: "case_manager",
    nextActions,
    coolingThreads,
    todayTaskCount: todayCountRow[0]?.n ?? 0,
    unreadUrgent: urgentRow[0]?.n ?? 0,
  };
}

async function loadAttorneySubnav(
  orgId: string,
  _userId: string,
): Promise<AttorneySubnavData> {
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 86400000);

  const upcoming = await db
    .select({
      eventId: calendarEvents.id,
      caseId: calendarEvents.caseId,
      start: calendarEvents.startAt,
      caseNumber: cases.caseNumber,
      alj: cases.adminLawJudge,
      mrStatus: cases.mrStatus,
      phiSheetStatus: cases.phiSheetStatus,
    })
    .from(calendarEvents)
    .leftJoin(cases, eq(cases.id, calendarEvents.caseId))
    .where(
      and(
        eq(calendarEvents.organizationId, orgId),
        eq(calendarEvents.eventType, "hearing"),
        gte(calendarEvents.startAt, now),
        lte(calendarEvents.startAt, sevenDays),
        isNull(calendarEvents.deletedAt),
      ),
    )
    .orderBy(calendarEvents.startAt)
    .limit(5)
    .catch(() => []);

  let nextHearing: AttorneySubnavData["nextHearing"] = null;
  if (upcoming[0]) {
    const h = upcoming[0];
    const diff = new Date(h.start).getTime() - Date.now();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    const countdown =
      days > 0 ? `in ${days}d` : hours > 0 ? `in ${hours}h` : "Soon";
    nextHearing = {
      caseId: h.caseId ?? "",
      caseNumber: h.caseNumber,
      alj: h.alj,
      aljWinRate: null,
      countdown,
      prepCheckList: [
        { label: "PHI sheet", ok: h.phiSheetStatus === "complete" },
        { label: "Med records", ok: h.mrStatus === "complete" },
        { label: "Brief", ok: false },
        { label: "ALJ review", ok: false },
      ],
    };
  }

  const recentFeed: SubnavRecentItem[] = upcoming.slice(1, 5).map((h) => ({
    id: h.eventId,
    title: `Case ${h.caseNumber ?? "—"}`,
    meta: `${h.alj ?? "ALJ TBD"} · ${new Date(h.start).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`,
    href: h.caseId ? `/hearings/${h.caseId}` : undefined,
    tone: "blue" as const,
  }));

  return {
    kind: "attorney",
    nextHearing,
    recentFeed,
    hearingsThisWeek: upcoming.length,
  };
}

async function loadReviewerSubnav(orgId: string): Promise<ReviewerSubnavData> {
  // Top "Needs Your Eyes" — blend of compliance, risk, supervisor escalations
  const [comp, risk, sup] = await Promise.all([
    db
      .select({
        id: complianceFindings.id,
        ruleCode: complianceFindings.ruleCode,
        severity: complianceFindings.severity,
        createdAt: complianceFindings.createdAt,
      })
      .from(complianceFindings)
      .where(
        and(
          eq(complianceFindings.organizationId, orgId),
          eq(complianceFindings.status, "open"),
          inArray(complianceFindings.severity, ["critical", "high"]),
        ),
      )
      .orderBy(desc(complianceFindings.createdAt))
      .limit(3)
      .catch(() => []),
    db
      .select({
        id: caseRiskScores.id,
        caseId: caseRiskScores.caseId,
        score: caseRiskScores.score,
        scoredAt: caseRiskScores.scoredAt,
        caseNumber: cases.caseNumber,
      })
      .from(caseRiskScores)
      .innerJoin(cases, eq(cases.id, caseRiskScores.caseId))
      .where(
        and(
          eq(cases.organizationId, orgId),
          gte(caseRiskScores.score, 86),
          isNull(cases.deletedAt),
        ),
      )
      .orderBy(desc(caseRiskScores.score))
      .limit(3)
      .catch(() => []),
    db
      .select({
        id: supervisorEvents.id,
        eventType: supervisorEvents.eventType,
        createdAt: supervisorEvents.createdAt,
        caseId: supervisorEvents.caseId,
      })
      .from(supervisorEvents)
      .where(
        and(
          eq(supervisorEvents.organizationId, orgId),
          eq(supervisorEvents.status, "awaiting_review"),
        ),
      )
      .orderBy(desc(supervisorEvents.createdAt))
      .limit(3)
      .catch(() => []),
  ]);

  const needsYourEyes: ReviewerSubnavData["needsYourEyes"] = [
    ...comp.map((c) => ({
      id: c.id,
      title: c.ruleCode.replace(/_/g, " "),
      severity: (c.severity === "critical" ? "critical" : "high") as
        | "critical"
        | "high",
      href: "/admin/compliance",
    })),
    ...risk.map((r) => ({
      id: r.id,
      title: `Risk ${r.score} · Case ${r.caseNumber ?? "?"}`,
      severity: "high" as const,
      href: r.caseId ? `/cases/${r.caseId}` : undefined,
    })),
    ...sup.map((s) => ({
      id: s.id,
      title: s.eventType.replace(/_/g, " "),
      severity: "medium" as const,
      href: s.caseId ? `/cases/${s.caseId}` : undefined,
    })),
  ].slice(0, 7);

  const recentEscalations: SubnavRecentItem[] = sup.map((s) => ({
    id: s.id,
    title: s.eventType.replace(/_/g, " "),
    meta: relativeTime(s.createdAt),
    href: s.caseId ? `/cases/${s.caseId}` : undefined,
    tone: "amber" as const,
  }));

  return {
    kind: "reviewer",
    needsYourEyes,
    recentEscalations,
    unackedCount: comp.length + sup.length,
  };
}

async function loadAdminSubnav(orgId: string): Promise<AdminSubnavData> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [recentJobs, audit, compRow, userRow] = await Promise.all([
    db
      .select({
        id: ereJobs.id,
        jobType: ereJobs.jobType,
        status: ereJobs.status,
        createdAt: ereJobs.createdAt,
      })
      .from(ereJobs)
      .orderBy(desc(ereJobs.createdAt))
      .limit(5)
      .catch(() => []),
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        createdAt: auditLog.createdAt,
        userId: auditLog.userId,
      })
      .from(auditLog)
      .where(eq(auditLog.organizationId, orgId))
      .orderBy(desc(auditLog.createdAt))
      .limit(5)
      .catch(() => []),
    db
      .select({ n: count() })
      .from(complianceFindings)
      .where(
        and(
          eq(complianceFindings.organizationId, orgId),
          eq(complianceFindings.status, "open"),
        ),
      )
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: count() })
      .from(users)
      .where(
        and(
          eq(users.organizationId, orgId),
          isNull(users.deletedAt),
        ),
      )
      .catch(() => [{ n: 0 }]),
  ]);

  const cronStatus = recentJobs.map((j) => ({
    name: j.jobType,
    lastRunAgo: relativeTime(j.createdAt),
    healthy: j.status !== "failed" && j.status !== "cancelled",
  }));

  const recentAdminEvents: SubnavRecentItem[] = audit.map((a) => ({
    id: a.id,
    title: `${a.action} ${a.entityType}`,
    meta: relativeTime(a.createdAt),
    tone: "blue" as const,
  }));

  return {
    kind: "admin",
    cronStatus,
    recentAdminEvents,
    openCompliance: compRow[0]?.n ?? 0,
    activeUsers: userRow[0]?.n ?? 0,
  };
}

async function loadMailClerkSubnav(
  orgId: string,
): Promise<MailClerkSubnavData> {
  const inbound = await getInboundMailQueue().catch(() => []);
  const oldest = inbound.length > 0 ? Math.max(...inbound.map((i) => i.ageInDays)) : 0;
  const unmatched = inbound.filter((i) => !i.caseId).length;

  const [outboundRow, recentMatched] = await Promise.all([
    db
      .select({ n: count() })
      .from(outboundMail)
      .where(
        and(
          eq(outboundMail.organizationId, orgId),
          isNull(outboundMail.deliveredAt),
          gte(outboundMail.sentAt, new Date(Date.now() - 7 * 86400000)),
        ),
      )
      .catch(() => [{ n: 0 }]),
    db
      .select({
        id: outboundMail.id,
        recipientName: outboundMail.recipientName,
        sentAt: outboundMail.sentAt,
      })
      .from(outboundMail)
      .where(eq(outboundMail.organizationId, orgId))
      .orderBy(desc(outboundMail.sentAt))
      .limit(5)
      .catch(() => []),
  ]);

  return {
    kind: "mail_clerk",
    inboundCount: inbound.length,
    unmatchedCount: unmatched,
    outboundInTransit: outboundRow[0]?.n ?? 0,
    oldestPieceDays: oldest,
    recentMatched: recentMatched.map((r) => ({
      id: r.id,
      title: r.recipientName,
      meta: relativeTime(r.sentAt),
      tone: "blue" as const,
    })),
  };
}

async function loadIntakeAgentSubnav(
  orgId: string,
): Promise<IntakeAgentSubnavData> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [todayRow, contractsRow, recentRows, statusRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(leads)
      .where(
        and(
          eq(leads.organizationId, orgId),
          gte(leads.createdAt, startOfToday),
          lte(leads.createdAt, endOfToday),
          isNull(leads.deletedAt),
        ),
      )
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: count() })
      .from(leads)
      .where(
        and(
          eq(leads.organizationId, orgId),
          eq(leads.status, "contract_sent"),
          isNull(leads.deletedAt),
        ),
      )
      .catch(() => [{ n: 0 }]),
    db
      .select({
        id: leads.id,
        firstName: leads.firstName,
        lastName: leads.lastName,
        convertedAt: leads.convertedAt,
      })
      .from(leads)
      .where(
        and(
          eq(leads.organizationId, orgId),
          sql`${leads.convertedAt} IS NOT NULL`,
          isNull(leads.deletedAt),
        ),
      )
      .orderBy(desc(leads.convertedAt))
      .limit(5)
      .catch(() => []),
    db
      .select({ status: leads.status, n: count() })
      .from(leads)
      .where(
        and(
          eq(leads.organizationId, orgId),
          isNull(leads.deletedAt),
          gte(leads.createdAt, new Date(Date.now() - 30 * 86400000)),
        ),
      )
      .groupBy(leads.status)
      .catch(() => []),
  ]);

  // Bucket rough AI confidence: not_interested + wrong_number = declined,
  // qualifying + interested = borderline, contract_sent + signed = autoApproved
  let autoApproved = 0;
  let borderline = 0;
  let declined = 0;
  const declineReasons = new Map<string, number>();
  for (const r of statusRows) {
    if (
      r.status === "contract_sent" ||
      r.status === "contract_signed" ||
      r.status === "converted"
    ) {
      autoApproved += r.n;
    } else if (
      r.status === "not_interested" ||
      r.status === "wrong_number" ||
      r.status === "do_not_contact"
    ) {
      declined += r.n;
      declineReasons.set(r.status, r.n);
    } else {
      borderline += r.n;
    }
  }

  return {
    kind: "intake_agent",
    aiConfidenceBuckets: { autoApproved, borderline, declined },
    declineReasonTrends: Array.from(declineReasons.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([reason, count]) => ({ reason: reason.replace(/_/g, " "), count })),
    contractsPendingSignature: contractsRow[0]?.n ?? 0,
    newToday: todayRow[0]?.n ?? 0,
    recentConversions: recentRows.map((r) => ({
      id: r.id,
      title: `${r.firstName} ${r.lastName}`,
      meta: relativeTime(r.convertedAt),
      href: `/leads/${r.id}`,
      tone: "green" as const,
    })),
  };
}

async function loadMedicalRecordsSubnav(
  orgId: string,
): Promise<MedicalRecordsSubnavData> {
  const [credRows, rfcRow, recentCases] = await Promise.all([
    db
      .select({
        id: providerCredentials.id,
        providerName: providerCredentials.providerName,
        lastUsedAt: providerCredentials.lastUsedAt,
        isActive: providerCredentials.isActive,
      })
      .from(providerCredentials)
      .where(eq(providerCredentials.organizationId, orgId))
      .catch(() => []),
    db
      .select({ n: count() })
      .from(rfcRequests)
      .where(
        and(
          eq(rfcRequests.organizationId, orgId),
          eq(rfcRequests.status, "requested"),
        ),
      )
      .catch(() => [{ n: 0 }]),
    db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        updatedAt: cases.updatedAt,
      })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(cases.mrStatus, "complete"),
          isNull(cases.deletedAt),
        ),
      )
      .orderBy(desc(cases.updatedAt))
      .limit(5)
      .catch(() => []),
  ]);

  const expiringCredentials = credRows.filter((c) => {
    if (!c.isActive) return false;
    const days = c.lastUsedAt
      ? Math.floor(
          (Date.now() - new Date(c.lastUsedAt).getTime()) / 86400000,
        )
      : 999;
    return days > 30;
  }).length;

  // Provider response time stub — we don't have a true response_time table yet,
  // so we use credential-last-used as a proxy and rank slowest first.
  const providerResponseTimes = credRows
    .filter((c) => c.isActive)
    .map((c) => {
      const days = c.lastUsedAt
        ? Math.floor(
            (Date.now() - new Date(c.lastUsedAt).getTime()) / 86400000,
          )
        : null;
      return { name: c.providerName, avgDays: days, pendingCount: 0 };
    })
    .sort((a, b) => (b.avgDays ?? 0) - (a.avgDays ?? 0))
    .slice(0, 5);

  return {
    kind: "medical_records",
    providerResponseTimes,
    expiringCredentials,
    rfcAwaitingDoctor: rfcRow[0]?.n ?? 0,
    myTeamColor: null,
    recentCompleted: recentCases.map((c) => ({
      id: c.id,
      title: `Case ${c.caseNumber ?? "—"}`,
      meta: relativeTime(c.updatedAt),
      href: `/cases/${c.id}`,
      tone: "green" as const,
    })),
  };
}

async function loadFeeCollectionSubnav(
  orgId: string,
): Promise<FeeCollectionSubnavData> {
  const [recentPayRows, atRiskRow] = await Promise.all([
    db
      .select({
        id: feePetitions.id,
        amount: feePetitions.collectedAmountCents,
        updatedAt: feePetitions.updatedAt,
        caseNumber: cases.caseNumber,
      })
      .from(feePetitions)
      .leftJoin(cases, eq(cases.id, feePetitions.caseId))
      .where(
        and(
          eq(feePetitions.organizationId, orgId),
          sql`COALESCE(${feePetitions.collectedAmountCents}, 0) > 0`,
          gte(feePetitions.updatedAt, new Date(Date.now() - 24 * 3600000)),
        ),
      )
      .orderBy(desc(feePetitions.updatedAt))
      .limit(8)
      .catch(() => []),
    db
      .select({
        sum: sql<number>`COALESCE(SUM(${feePetitions.approvedAmountCents}),0)::int`,
      })
      .from(feePetitions)
      .where(
        and(
          eq(feePetitions.organizationId, orgId),
          eq(feePetitions.status, "approved"),
          sql`COALESCE(${feePetitions.collectedAmountCents}, 0) = 0`,
          lte(feePetitions.approvedAt, new Date(Date.now() - 30 * 86400000)),
        ),
      )
      .catch(() => [{ sum: 0 }]),
  ]);

  // Dispute pipeline — fee_petitions doesn't have a dispute status field;
  // approximate using "withdrawn" + "denied" as proxies so the section has
  // honest data. Replace with real dispute table when it lands.
  const [openDisp, resolvedDisp] = await Promise.all([
    db
      .select({ n: count() })
      .from(feePetitions)
      .where(
        and(
          eq(feePetitions.organizationId, orgId),
          inArray(feePetitions.status, ["denied", "withdrawn"]),
          gte(feePetitions.updatedAt, new Date(Date.now() - 30 * 86400000)),
        ),
      )
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: count() })
      .from(feePetitions)
      .where(
        and(
          eq(feePetitions.organizationId, orgId),
          eq(feePetitions.status, "approved"),
          gte(feePetitions.updatedAt, new Date(Date.now() - 7 * 86400000)),
        ),
      )
      .catch(() => [{ n: 0 }]),
  ]);

  return {
    kind: "fee_collection",
    recentPayments: recentPayRows.map((p) => ({
      id: p.id,
      caseNumber: p.caseNumber,
      amountDollars: Math.round((p.amount ?? 0) / 100),
      relativeTime: relativeTime(p.updatedAt),
    })),
    disputes: {
      opened: openDisp[0]?.n ?? 0,
      underReview: 0,
      resolved7d: resolvedDisp[0]?.n ?? 0,
    },
    totalAtRiskDollars: Math.round((atRiskRow[0]?.sum ?? 0) / 100),
  };
}

async function loadFilingAgentSubnav(): Promise<FilingAgentSubnavData> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const [queueRow, failedRow, recentFailedRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(ereJobs)
      .where(sql`${ereJobs.status} IN ('queued','running','pending')`)
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: count() })
      .from(ereJobs)
      .where(
        and(
          eq(ereJobs.status, "failed"),
          gte(ereJobs.createdAt, sevenDaysAgo),
        ),
      )
      .catch(() => [{ n: 0 }]),
    db
      .select({
        id: ereJobs.id,
        jobType: ereJobs.jobType,
        createdAt: ereJobs.createdAt,
        errorMessage: ereJobs.errorMessage,
      })
      .from(ereJobs)
      .where(
        and(
          eq(ereJobs.status, "failed"),
          gte(ereJobs.createdAt, sevenDaysAgo),
        ),
      )
      .orderBy(desc(ereJobs.createdAt))
      .limit(20)
      .catch(() => []),
  ]);

  // Cluster failures by first 3 keywords from error message — rough clustering
  // pending a real `error_class` column.
  const buckets = new Map<string, number>();
  for (const r of recentFailedRows) {
    const msg = r.errorMessage ?? r.jobType;
    const key = (msg || "unknown").split(/[\s:.,;!?-]+/).slice(0, 2).join(" ").toLowerCase();
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const errorClusters = Array.from(buckets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count]) => ({ label, count }));

  return {
    kind: "filing_agent",
    currentConfidenceThreshold: 85,
    errorClusters,
    ereQueueCount: queueRow[0]?.n ?? 0,
    failedLast7d: failedRow[0]?.n ?? 0,
    recentRejections: recentFailedRows.slice(0, 5).map((r) => ({
      id: r.id,
      title: r.jobType,
      meta: r.errorMessage?.slice(0, 60) ?? relativeTime(r.createdAt),
      tone: "red" as const,
    })),
  };
}

async function loadPhiSheetWriterSubnav(
  orgId: string,
): Promise<PhiSheetWriterSubnavData> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const [weekRow, byAttorney, recentDone, silentRow] = await Promise.all([
    db
      .select({ n: count() })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(cases.phiSheetStatus, "complete"),
          gte(cases.phiSheetCompletedAt, sevenDaysAgo),
        ),
      )
      .catch(() => [{ n: 0 }]),
    db
      .select({
        attorney: cases.adminLawJudge,
        completed: count(),
      })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(cases.phiSheetStatus, "complete"),
          gte(cases.phiSheetCompletedAt, thirtyDaysAgo),
          isNull(cases.deletedAt),
        ),
      )
      .groupBy(cases.adminLawJudge)
      .orderBy(desc(count()))
      .limit(5)
      .catch(() => []),
    db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        completedAt: cases.phiSheetCompletedAt,
      })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(cases.phiSheetStatus, "complete"),
        ),
      )
      .orderBy(desc(cases.phiSheetCompletedAt))
      .limit(5)
      .catch(() => []),
    // Silent-rewrite proxy: sheets returned to in_review after being complete
    db
      .select({ n: count() })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(cases.phiSheetStatus, "in_review"),
          gte(cases.phiSheetStartedAt, thirtyDaysAgo),
        ),
      )
      .catch(() => [{ n: 0 }]),
  ]);

  return {
    kind: "phi_sheet_writer",
    silentRewriteCount: silentRow[0]?.n ?? 0,
    attorneyPairings: byAttorney.map((row) => ({
      attorney: row.attorney ?? "Unassigned",
      sheetsCount: row.completed,
      revisionRate: null, // requires phi_sheet_revisions table
    })),
    sheetsThisWeek: weekRow[0]?.n ?? 0,
    recentApproved: recentDone.map((d) => ({
      id: d.id,
      title: `Case ${d.caseNumber ?? "—"}`,
      meta: relativeTime(d.completedAt),
      href: `/phi-writer/${d.id}`,
      tone: "green" as const,
    })),
  };
}

async function loadAppealsCouncilSubnav(
  orgId: string,
): Promise<AppealsCouncilSubnavData> {
  const sevenDaysOut = new Date(Date.now() + 7 * 86400000);
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [dueRow, grantRow, byAlj] = await Promise.all([
    db
      .select({ n: count() })
      .from(appealsCouncilBriefs)
      .where(
        and(
          eq(appealsCouncilBriefs.organizationId, orgId),
          isNull(appealsCouncilBriefs.filedAt),
          lte(appealsCouncilBriefs.deadlineDate, sevenDaysOut),
        ),
      )
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: count() })
      .from(appealsCouncilBriefs)
      .where(
        and(
          eq(appealsCouncilBriefs.organizationId, orgId),
          eq(appealsCouncilBriefs.outcome, "granted"),
          gte(appealsCouncilBriefs.outcomeAt, startOfMonth),
        ),
      )
      .catch(() => [{ n: 0 }]),
    db
      .select({
        alj: cases.adminLawJudge,
        outcome: appealsCouncilBriefs.outcome,
        n: count(),
      })
      .from(appealsCouncilBriefs)
      .innerJoin(cases, eq(cases.id, appealsCouncilBriefs.caseId))
      .where(
        and(
          eq(appealsCouncilBriefs.organizationId, orgId),
          sql`${appealsCouncilBriefs.outcome} IN ('granted','denied','remanded')`,
        ),
      )
      .groupBy(cases.adminLawJudge, appealsCouncilBriefs.outcome)
      .catch(() => []),
  ]);

  // Compute remand rate per ALJ
  const aljMap = new Map<
    string,
    { total: number; remanded: number }
  >();
  for (const r of byAlj) {
    const alj = r.alj ?? "Unknown";
    const cur = aljMap.get(alj) ?? { total: 0, remanded: 0 };
    cur.total += r.n;
    if (r.outcome === "remanded") cur.remanded += r.n;
    aljMap.set(alj, cur);
  }
  const aljRemandTracker = Array.from(aljMap.entries())
    .filter(([, v]) => v.total >= 2)
    .map(([alj, v]) => ({
      alj,
      totalDecisions: v.total,
      remandedRate: Math.round((v.remanded / v.total) * 100),
    }))
    .sort((a, b) => b.remandedRate - a.remandedRate)
    .slice(0, 5);

  return {
    kind: "appeals_council",
    aljRemandTracker,
    // Placeholder error themes — real data would come from an error_themes table
    recentErrorThemes: [],
    briefsDueIn7d: dueRow[0]?.n ?? 0,
    grantsThisMonth: grantRow[0]?.n ?? 0,
  };
}

async function loadPostHearingSubnav(
  orgId: string,
): Promise<PostHearingSubnavData> {
  const oneDayAgo = new Date(Date.now() - 24 * 3600000);
  const [outcomeRows, blockedRow] = await Promise.all([
    db
      .select({
        id: hearingOutcomes.id,
        outcome: hearingOutcomes.outcome,
        outcomeReceivedAt: hearingOutcomes.outcomeReceivedAt,
        clientNotifiedAt: hearingOutcomes.clientNotifiedAt,
        caseStageAdvancedAt: hearingOutcomes.caseStageAdvancedAt,
        caseId: hearingOutcomes.caseId,
        caseNumber: cases.caseNumber,
      })
      .from(hearingOutcomes)
      .leftJoin(cases, eq(cases.id, hearingOutcomes.caseId))
      .where(eq(hearingOutcomes.organizationId, orgId))
      .orderBy(desc(hearingOutcomes.outcomeReceivedAt))
      .limit(40)
      .catch(() => []),
    db
      .select({ n: count() })
      .from(hearingOutcomes)
      .where(
        and(
          eq(hearingOutcomes.organizationId, orgId),
          isNull(hearingOutcomes.caseStageAdvancedAt),
          isNull(hearingOutcomes.processingCompletedAt),
          lte(hearingOutcomes.outcomeReceivedAt, oneDayAgo),
        ),
      )
      .catch(() => [{ n: 0 }]),
  ]);

  // Anomaly heuristic: outcome received >24h ago + no client notification yet
  const anomalies = outcomeRows
    .filter(
      (o) =>
        o.outcomeReceivedAt &&
        new Date(o.outcomeReceivedAt).getTime() < Date.now() - 24 * 3600000 &&
        !o.clientNotifiedAt,
    )
    .slice(0, 5)
    .map((o) => ({
      id: o.id,
      title: `Case ${o.caseNumber ?? "—"} · ${o.outcome ?? "outcome"}`,
      detail: "Received >24h ago, client not yet notified",
      href: o.caseId ? `/cases/${o.caseId}` : undefined,
    }));

  const awaitingNotification = outcomeRows.filter(
    (o) => o.outcomeReceivedAt && !o.clientNotifiedAt,
  ).length;

  const recentInterventions: SubnavRecentItem[] = outcomeRows
    .filter((o) => o.clientNotifiedAt)
    .slice(0, 5)
    .map((o) => ({
      id: o.id,
      title: `Case ${o.caseNumber ?? "—"}`,
      meta: relativeTime(o.clientNotifiedAt),
      href: o.caseId ? `/cases/${o.caseId}` : undefined,
      tone: "green" as const,
    }));

  return {
    kind: "post_hearing",
    anomalies,
    awaitingNotification,
    blockedTransitions: blockedRow[0]?.n ?? 0,
    recentInterventions,
  };
}

async function loadPreHearingPrepSubnav(
  orgId: string,
): Promise<PreHearingPrepSubnavData> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const fourteenOut = new Date(Date.now() + 14 * 86400000);
  const now = new Date();

  const [weekRow, statusRows, heaviestRow, recent] = await Promise.all([
    db
      .select({ n: count() })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(cases.phiSheetStatus, "complete"),
          gte(cases.phiSheetCompletedAt, sevenDaysAgo),
        ),
      )
      .catch(() => [{ n: 0 }]),
    db
      .select({
        attorney: cases.adminLawJudge,
        status: cases.phiSheetStatus,
        n: count(),
      })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          isNull(cases.deletedAt),
          gte(cases.hearingDate, now),
          lte(cases.hearingDate, fourteenOut),
        ),
      )
      .groupBy(cases.adminLawJudge, cases.phiSheetStatus)
      .catch(() => []),
    db
      .select({ hearingDate: cases.hearingDate })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          isNull(cases.deletedAt),
          gte(cases.hearingDate, now),
        ),
      )
      .orderBy(cases.hearingDate)
      .limit(1)
      .catch(() => []),
    db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        completedAt: cases.phiSheetCompletedAt,
      })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(cases.phiSheetStatus, "complete"),
        ),
      )
      .orderBy(desc(cases.phiSheetCompletedAt))
      .limit(5)
      .catch(() => []),
  ]);

  // Per-attorney revision-rate proxy: in_review / (in_review + complete)
  const attorneyMap = new Map<
    string,
    { inReview: number; completed: number }
  >();
  for (const r of statusRows) {
    const a = r.attorney ?? "Unassigned";
    const cur = attorneyMap.get(a) ?? { inReview: 0, completed: 0 };
    if (r.status === "in_review") cur.inReview += r.n;
    if (r.status === "complete") cur.completed += r.n;
    attorneyMap.set(a, cur);
  }
  const attorneyRevisionRates = Array.from(attorneyMap.entries())
    .filter(([, v]) => v.inReview + v.completed >= 1)
    .map(([attorney, v]) => ({ attorney, ...v }))
    .sort(
      (a, b) =>
        b.inReview / (b.inReview + b.completed || 1) -
        a.inReview / (a.inReview + a.completed || 1),
    )
    .slice(0, 4);

  const heaviestCaseDays = heaviestRow[0]?.hearingDate
    ? Math.max(
        0,
        Math.ceil(
          (new Date(heaviestRow[0].hearingDate).getTime() - Date.now()) /
            86400000,
        ),
      )
    : null;

  return {
    kind: "pre_hearing_prep",
    attorneyRevisionRates,
    briefsThisWeek: weekRow[0]?.n ?? 0,
    heaviestCaseDays,
    recentSent: recent.map((r) => ({
      id: r.id,
      title: `Case ${r.caseNumber ?? "—"}`,
      meta: relativeTime(r.completedAt),
      href: `/phi-writer/${r.id}`,
      tone: "green" as const,
    })),
  };
}

async function loadDefaultSubnav(
  orgId: string,
  userId: string,
): Promise<DefaultSubnavData> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);

  const [casesRow, todayRow, hearingsRow] = await Promise.all([
    db
      .select({ n: count() })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
        ),
      )
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, orgId),
          eq(tasks.assignedToId, userId),
          inArray(tasks.status, ["pending", "in_progress"]),
          gte(tasks.dueDate, startOfToday),
          lte(tasks.dueDate, endOfToday),
          isNull(tasks.deletedAt),
        ),
      )
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: count() })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.organizationId, orgId),
          eq(calendarEvents.eventType, "hearing"),
          gte(calendarEvents.startAt, now),
          lte(calendarEvents.startAt, weekFromNow),
          isNull(calendarEvents.deletedAt),
        ),
      )
      .catch(() => [{ n: 0 }]),
  ]);

  return {
    kind: "default",
    casesCount: casesRow[0]?.n ?? 0,
    todayTaskCount: todayRow[0]?.n ?? 0,
    hearingsThisWeek: hearingsRow[0]?.n ?? 0,
  };
}

// ── Public dispatcher ──────────────────────────────────────────────────────

export async function getDashboardSubnavData(
  personaId: string,
  orgId: string,
  userId: string,
): Promise<DashboardSubnavData> {
  try {
    switch (personaId) {
      case "case_manager":
        return await loadCaseManagerSubnav(orgId, userId);
      case "attorney":
        return await loadAttorneySubnav(orgId, userId);
      case "reviewer":
        return await loadReviewerSubnav(orgId);
      case "admin":
        return await loadAdminSubnav(orgId);
      case "mail_clerk":
        return await loadMailClerkSubnav(orgId);
      case "intake_agent":
        return await loadIntakeAgentSubnav(orgId);
      case "medical_records":
        return await loadMedicalRecordsSubnav(orgId);
      case "fee_collection":
        return await loadFeeCollectionSubnav(orgId);
      case "filing_agent":
        return await loadFilingAgentSubnav();
      case "phi_sheet_writer":
        return await loadPhiSheetWriterSubnav(orgId);
      case "appeals_council":
        return await loadAppealsCouncilSubnav(orgId);
      case "post_hearing":
        return await loadPostHearingSubnav(orgId);
      case "pre_hearing_prep":
        return await loadPreHearingPrepSubnav(orgId);
      default:
        return await loadDefaultSubnav(orgId, userId);
    }
  } catch (error) {
    logger.error("getDashboardSubnavData failed", { personaId, error });
    return {
      kind: "default",
      casesCount: 0,
      todayTaskCount: 0,
      hearingsThisWeek: 0,
    };
  }
}
