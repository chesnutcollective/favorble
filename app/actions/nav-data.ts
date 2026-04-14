"use server";

import { db } from "@/db/drizzle";
import {
  cases,
  caseStages,
  caseStageGroups,
  tasks,
  leads,
  calendarEvents,
  auditLog,
  documents,
  contacts,
  communications,
  users,
  outboundMail,
  rfcRequests,
  invoices,
  timeEntries,
  expenses,
  trustAccounts,
  trustTransactions,
  chatChannels,
  chatChannelMembers,
  chatMessages,
  coachingFlags,
  trainingGaps,
  aiDrafts,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import {
  eq,
  and,
  isNull,
  gte,
  lte,
  ne,
  desc,
  asc,
  count,
  inArray,
  sql,
} from "drizzle-orm";
import {
  getWorkloadMatrix,
  getOpenSupervisorEventCount,
  getOpenCoachingFlagCount,
  getOpenComplianceFindingCount,
  getHighRiskCaseCount,
  getOpenDraftCount,
} from "@/app/actions/workload-matrix";

/* ─── Types ─── */

export type StageCounts = {
  stageId: string | null;
  stageName: string | null;
  stageCode: string | null;
  stageGroupName: string | null;
  stageGroupColor: string | null;
  count: number;
};

export type TaskSummary = {
  total: number;
  overdue: number;
  dueToday: number;
  topTasks: {
    id: string;
    title: string;
    dueDate: Date | null;
    priority: string;
    caseNumber: string | null;
  }[];
};

export type LeadCount = {
  status: string;
  count: number;
};

export type TodayEvent = {
  id: string;
  title: string;
  startTime: Date;
  eventType: string;
  caseId: string | null;
  caseNumber: string | null;
};

export type RecentActivityItem = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userName: string | null;
  timestamp: Date;
};

export type DocumentSummary = {
  total: number;
  byCategoryCount: Record<string, number>;
  bySourceCount: Record<string, number>;
  recentUploads: {
    id: string;
    fileName: string;
    fileType: string;
    createdAt: Date;
    caseNumber: string | null;
  }[];
};

export type ContactSummary = {
  total: number;
  byTypeCount: Record<string, number>;
  recentContacts: {
    id: string;
    firstName: string;
    lastName: string;
    contactType: string;
    email: string | null;
    phone: string | null;
  }[];
};

export type MessageSummary = {
  total: number;
  unreadCount: number;
  recentMessages: {
    id: string;
    subject: string | null;
    body: string | null;
    fromAddress: string | null;
    direction: string | null;
    createdAt: Date;
    caseId: string | null;
    caseNumber: string | null;
  }[];
};

export type EmailSummary = {
  matchedCount: number;
  unmatchedCount: number;
  isOutlookConfigured: boolean;
  recentEmails: {
    id: string;
    subject: string | null;
    fromAddress: string | null;
    createdAt: Date;
    caseId: string | null;
    caseNumber: string | null;
  }[];
};

export type HearingsSummary = {
  next48hCount: number;
  next7dCount: number;
  next30dCount: number;
  mrBlocking14dCount: number;
};

export type FilingSummary = {
  readyToSubmit: number;
  bundlesReady: number;
  submittedThisWeek: number;
};

export type PhiWriterSummary = {
  myAssigned: number;
  myInProgress: number;
  dueThisWeek: number;
  unassigned: number;
};

export type MedicalRecordsSummary = {
  urgentBlocking14d: number;
  rfcRequested: number;
  rfcAwaiting: number;
  rfcReceived: number;
  teamWorkload: { color: string; count: number }[];
};

export type MailSummary = {
  pendingInbound: number;
  inTransit: number;
  certifiedInTransit: number;
  unmatched: number;
};

export type BillingSummary = {
  outstandingCents: number;
  outstandingCount: number;
  overdueCents: number;
  overdueCount: number;
  unbilledMinutes: number;
  unbilledTimeCount: number;
  unbilledExpenseCents: number;
  unbilledExpenseCount: number;
  draftInvoiceCount: number;
};

export type TrustSummary = {
  totalBalanceCents: number;
  accountCount: number;
  hasNegativeBalance: boolean;
  unreconciledCount: number;
  oldestUnreconciledDays: number | null;
  daysSinceLastReconciled: number | null;
};

export type TeamChatSummary = {
  mentionCount: number;
  dmUnreadCount: number;
};

export type SupervisorNavSummary = {
  openEvents: number;
  highRisk: number;
  openFindings: number;
  openFlags: number;
  openDrafts: number;
  topOverloaded: Array<{
    userId: string;
    name: string;
    overdueTaskCount: number;
    openTaskCount: number;
  }>;
};

export type CoachingNavSummary = {
  openTotal: number;
  openHighSeverity: number;
  inProgress: number;
  resolvedThisWeek: number;
  peopleCount: number;
  processCount: number;
  unclassifiedCount: number;
  trainingGapCount: number;
};

export type AiDraftsNavSummary = {
  myQueue: number;
  needsReview: number;
  lowConfidence: number;
  errorCount: number;
  byType: Record<string, number>;
  recent: Array<{
    id: string;
    title: string;
    type: string;
    caseNumber: string | null;
    authorInitials: string;
    createdAt: string;
  }>;
};

export type NavPanelData = {
  stageCounts: StageCounts[];
  taskSummary: TaskSummary;
  leadCounts: LeadCount[];
  todayEvents: TodayEvent[];
  recentActivity: RecentActivityItem[];
  documentSummary: DocumentSummary;
  contactSummary: ContactSummary;
  messageSummary: MessageSummary;
  emailSummary: EmailSummary;
  hearingsSummary: HearingsSummary;
  filingSummary: FilingSummary;
  phiWriterSummary: PhiWriterSummary;
  medicalRecordsSummary: MedicalRecordsSummary;
  mailSummary: MailSummary;
  billingSummary: BillingSummary;
  trustSummary: TrustSummary;
  teamChatSummary: TeamChatSummary;
  supervisorSummary?: SupervisorNavSummary;
  coachingSummary?: CoachingNavSummary;
  aiDraftsSummary?: AiDraftsNavSummary;
};

/* ─── Sub-queries ─── */

async function getStageCounts(organizationId: string): Promise<StageCounts[]> {
  const result = await db
    .select({
      stageId: cases.currentStageId,
      stageName: caseStages.name,
      stageCode: caseStages.code,
      stageGroupName: caseStageGroups.name,
      stageGroupColor: caseStageGroups.color,
      count: count(),
    })
    .from(cases)
    .innerJoin(caseStages, eq(cases.currentStageId, caseStages.id))
    .innerJoin(caseStageGroups, eq(caseStages.stageGroupId, caseStageGroups.id))
    .where(
      and(
        eq(cases.organizationId, organizationId),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
      ),
    )
    .groupBy(
      cases.currentStageId,
      caseStages.name,
      caseStages.code,
      caseStageGroups.name,
      caseStageGroups.color,
    );

  return result;
}

async function getTaskSummary(userId: string): Promise<TaskSummary> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const baseConditions = [
    eq(tasks.assignedToId, userId),
    isNull(tasks.deletedAt),
    ne(tasks.status, "completed"),
    ne(tasks.status, "skipped"),
  ];

  const [totalResult, overdueResult, dueTodayResult, topTasks] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(tasks)
        .where(and(...baseConditions)),
      db
        .select({ count: count() })
        .from(tasks)
        .where(and(...baseConditions, lte(tasks.dueDate, now))),
      db
        .select({ count: count() })
        .from(tasks)
        .where(
          and(
            ...baseConditions,
            gte(tasks.dueDate, today),
            lte(tasks.dueDate, tomorrow),
          ),
        ),
      db
        .select({
          id: tasks.id,
          title: tasks.title,
          dueDate: tasks.dueDate,
          priority: tasks.priority,
          caseNumber: sql<
            string | null
          >`(select ${cases.caseNumber} from ${cases} where ${cases.id} = ${tasks.caseId})`,
        })
        .from(tasks)
        .where(and(...baseConditions))
        .orderBy(asc(tasks.dueDate), desc(tasks.priority))
        .limit(5),
    ]);

  return {
    total: totalResult[0]?.count ?? 0,
    overdue: overdueResult[0]?.count ?? 0,
    dueToday: dueTodayResult[0]?.count ?? 0,
    topTasks,
  };
}

async function getLeadCounts(organizationId: string): Promise<LeadCount[]> {
  const result = await db
    .select({
      status: leads.status,
      count: count(),
    })
    .from(leads)
    .where(
      and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt)),
    )
    .groupBy(leads.status);

  return result;
}

async function getTodayEvents(organizationId: string): Promise<TodayEvent[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const result = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      startTime: calendarEvents.startAt,
      eventType: calendarEvents.eventType,
      caseId: calendarEvents.caseId,
      caseNumber: sql<
        string | null
      >`(select ${cases.caseNumber} from ${cases} where ${cases.id} = ${calendarEvents.caseId})`,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.organizationId, organizationId),
        isNull(calendarEvents.deletedAt),
        gte(calendarEvents.startAt, today),
        lte(calendarEvents.startAt, tomorrow),
      ),
    )
    .orderBy(asc(calendarEvents.startAt))
    .limit(10);

  return result;
}

async function getRecentActivity(
  organizationId: string,
): Promise<RecentActivityItem[]> {
  const result = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      userName: sql<
        string | null
      >`(select concat(${users.firstName}, ' ', ${users.lastName}) from ${users} where ${users.id} = ${auditLog.userId})`,
      timestamp: auditLog.createdAt,
    })
    .from(auditLog)
    .where(eq(auditLog.organizationId, organizationId))
    .orderBy(desc(auditLog.createdAt))
    .limit(5);

  return result;
}

async function getDocumentSummary(
  organizationId: string,
): Promise<DocumentSummary> {
  const [totalResult, categoryCounts, sourceCounts, recentUploads] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(documents)
        .innerJoin(cases, eq(documents.caseId, cases.id))
        .where(
          and(
            eq(cases.organizationId, organizationId),
            isNull(documents.deletedAt),
          ),
        ),
      db
        .select({
          category: documents.category,
          count: count(),
        })
        .from(documents)
        .innerJoin(cases, eq(documents.caseId, cases.id))
        .where(
          and(
            eq(cases.organizationId, organizationId),
            isNull(documents.deletedAt),
          ),
        )
        .groupBy(documents.category),
      db
        .select({
          source: documents.source,
          count: count(),
        })
        .from(documents)
        .innerJoin(cases, eq(documents.caseId, cases.id))
        .where(
          and(
            eq(cases.organizationId, organizationId),
            isNull(documents.deletedAt),
          ),
        )
        .groupBy(documents.source),
      db
        .select({
          id: documents.id,
          fileName: documents.fileName,
          fileType: documents.fileType,
          createdAt: documents.createdAt,
          caseNumber: cases.caseNumber,
        })
        .from(documents)
        .innerJoin(cases, eq(documents.caseId, cases.id))
        .where(
          and(
            eq(cases.organizationId, organizationId),
            isNull(documents.deletedAt),
          ),
        )
        .orderBy(desc(documents.createdAt))
        .limit(5),
    ]);

  const byCategoryCount: Record<string, number> = {};
  for (const row of categoryCounts) {
    byCategoryCount[row.category ?? "Uncategorized"] = row.count;
  }

  const bySourceCount: Record<string, number> = {};
  for (const row of sourceCounts) {
    bySourceCount[row.source] = row.count;
  }

  return {
    total: totalResult[0]?.count ?? 0,
    byCategoryCount,
    bySourceCount,
    recentUploads,
  };
}

async function getContactSummary(
  organizationId: string,
): Promise<ContactSummary> {
  const [totalResult, typeCounts, recentContacts] = await Promise.all([
    db
      .select({ count: count() })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, organizationId),
          isNull(contacts.deletedAt),
        ),
      ),
    db
      .select({
        contactType: contacts.contactType,
        count: count(),
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, organizationId),
          isNull(contacts.deletedAt),
        ),
      )
      .groupBy(contacts.contactType),
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        contactType: contacts.contactType,
        email: contacts.email,
        phone: contacts.phone,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, organizationId),
          isNull(contacts.deletedAt),
        ),
      )
      .orderBy(desc(contacts.createdAt))
      .limit(10),
  ]);

  const byTypeCount: Record<string, number> = {};
  for (const row of typeCounts) {
    byTypeCount[row.contactType] = row.count;
  }

  return {
    total: totalResult[0]?.count ?? 0,
    byTypeCount,
    recentContacts,
  };
}

async function getMessageSummary(
  organizationId: string,
): Promise<MessageSummary> {
  const [totalResult, recentMessages] = await Promise.all([
    db
      .select({ count: count() })
      .from(communications)
      .where(
        and(
          eq(communications.organizationId, organizationId),
          sql`${communications.type} IN ('message_inbound', 'message_outbound')`,
        ),
      ),
    db
      .select({
        id: communications.id,
        subject: communications.subject,
        body: communications.body,
        fromAddress: communications.fromAddress,
        direction: communications.direction,
        createdAt: communications.createdAt,
        caseId: communications.caseId,
        caseNumber: cases.caseNumber,
      })
      .from(communications)
      .leftJoin(cases, eq(communications.caseId, cases.id))
      .where(
        and(
          eq(communications.organizationId, organizationId),
          sql`${communications.type} IN ('message_inbound', 'message_outbound')`,
        ),
      )
      .orderBy(desc(communications.createdAt))
      .limit(5),
  ]);

  // Count inbound messages as "unread" proxy (no read-tracking column exists)
  const [unreadResult] = await db
    .select({ count: count() })
    .from(communications)
    .where(
      and(
        eq(communications.organizationId, organizationId),
        eq(communications.type, "message_inbound"),
      ),
    );

  return {
    total: totalResult[0]?.count ?? 0,
    unreadCount: unreadResult?.count ?? 0,
    recentMessages,
  };
}

async function getEmailSummary(organizationId: string): Promise<EmailSummary> {
  const isOutlookConfigured = !!(
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET &&
    process.env.MICROSOFT_TENANT_ID
  );

  const [matchedResult, unmatchedResult, recentEmails] = await Promise.all([
    db
      .select({ count: count() })
      .from(communications)
      .where(
        and(
          eq(communications.organizationId, organizationId),
          sql`${communications.type} IN ('email_inbound', 'email_outbound')`,
          sql`${communications.caseId} IS NOT NULL`,
        ),
      ),
    db
      .select({ count: count() })
      .from(communications)
      .where(
        and(
          eq(communications.organizationId, organizationId),
          sql`${communications.type} IN ('email_inbound', 'email_outbound')`,
          isNull(communications.caseId),
        ),
      ),
    db
      .select({
        id: communications.id,
        subject: communications.subject,
        fromAddress: communications.fromAddress,
        createdAt: communications.createdAt,
        caseId: communications.caseId,
        caseNumber: sql<
          string | null
        >`(select ${cases.caseNumber} from ${cases} where ${cases.id} = ${communications.caseId})`,
      })
      .from(communications)
      .where(
        and(
          eq(communications.organizationId, organizationId),
          sql`${communications.type} IN ('email_inbound', 'email_outbound')`,
        ),
      )
      .orderBy(desc(communications.createdAt))
      .limit(5),
  ]);

  return {
    matchedCount: matchedResult[0]?.count ?? 0,
    unmatchedCount: unmatchedResult[0]?.count ?? 0,
    isOutlookConfigured,
    recentEmails,
  };
}

async function getHearingsSummary(
  organizationId: string,
): Promise<HearingsSummary> {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in14d = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [n48, n7, n30, mrBlocking] = await Promise.all([
    db
      .select({ count: count() })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.organizationId, organizationId),
          isNull(calendarEvents.deletedAt),
          eq(calendarEvents.eventType, "hearing"),
          gte(calendarEvents.startAt, now),
          lte(calendarEvents.startAt, in48h),
        ),
      ),
    db
      .select({ count: count() })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.organizationId, organizationId),
          isNull(calendarEvents.deletedAt),
          eq(calendarEvents.eventType, "hearing"),
          gte(calendarEvents.startAt, now),
          lte(calendarEvents.startAt, in7d),
        ),
      ),
    db
      .select({ count: count() })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.organizationId, organizationId),
          isNull(calendarEvents.deletedAt),
          eq(calendarEvents.eventType, "hearing"),
          gte(calendarEvents.startAt, now),
          lte(calendarEvents.startAt, in30d),
        ),
      ),
    db
      .select({ count: count() })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, organizationId),
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
          gte(cases.hearingDate, now),
          lte(cases.hearingDate, in14d),
          sql`${cases.mrStatus} IS DISTINCT FROM 'complete'`,
        ),
      ),
  ]);

  return {
    next48hCount: n48[0]?.count ?? 0,
    next7dCount: n7[0]?.count ?? 0,
    next30dCount: n30[0]?.count ?? 0,
    mrBlocking14dCount: mrBlocking[0]?.count ?? 0,
  };
}

async function getFilingSummary(
  organizationId: string,
): Promise<FilingSummary> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // "Ready to submit" and "bundles ready" proxy via stage group name until
  // a dedicated filing_status column exists. Stage groups with "filing" or
  // "ready" in their name are treated as ready-to-submit.
  const [ready, bundles, submittedThisWeek] = await Promise.all([
    db
      .select({ count: count() })
      .from(cases)
      .innerJoin(caseStages, eq(cases.currentStageId, caseStages.id))
      .innerJoin(
        caseStageGroups,
        eq(caseStages.stageGroupId, caseStageGroups.id),
      )
      .where(
        and(
          eq(cases.organizationId, organizationId),
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
          sql`LOWER(${caseStageGroups.name}) LIKE '%ready%' OR LOWER(${caseStages.name}) LIKE '%ready to file%' OR LOWER(${caseStages.name}) LIKE '%ready to submit%'`,
        ),
      ),
    db
      .select({ count: count() })
      .from(cases)
      .innerJoin(caseStages, eq(cases.currentStageId, caseStages.id))
      .where(
        and(
          eq(cases.organizationId, organizationId),
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
          sql`LOWER(${caseStages.name}) LIKE '%bundle%' OR LOWER(${caseStages.name}) LIKE '%packet%' OR LOWER(${caseStages.name}) LIKE '%review%'`,
        ),
      ),
    db
      .select({ count: count() })
      .from(cases)
      .innerJoin(caseStages, eq(cases.currentStageId, caseStages.id))
      .where(
        and(
          eq(cases.organizationId, organizationId),
          isNull(cases.deletedAt),
          gte(cases.updatedAt, weekAgo),
          sql`LOWER(${caseStages.name}) LIKE '%submitted%' OR LOWER(${caseStages.name}) LIKE '%filed%'`,
        ),
      ),
  ]);

  return {
    readyToSubmit: ready[0]?.count ?? 0,
    bundlesReady: bundles[0]?.count ?? 0,
    submittedThisWeek: submittedThisWeek[0]?.count ?? 0,
  };
}

async function getPhiWriterSummary(
  organizationId: string,
  userId: string,
): Promise<PhiWriterSummary> {
  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [myAssigned, myInProgress, dueThisWeek, unassigned] = await Promise.all(
    [
      db
        .select({ count: count() })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, organizationId),
            eq(cases.status, "active"),
            isNull(cases.deletedAt),
            eq(cases.phiSheetWriterId, userId),
            sql`${cases.phiSheetStatus} IN ('assigned','in_progress')`,
          ),
        ),
      db
        .select({ count: count() })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, organizationId),
            eq(cases.status, "active"),
            isNull(cases.deletedAt),
            eq(cases.phiSheetWriterId, userId),
            eq(cases.phiSheetStatus, "in_progress"),
          ),
        ),
      db
        .select({ count: count() })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, organizationId),
            eq(cases.status, "active"),
            isNull(cases.deletedAt),
            gte(cases.hearingDate, now),
            lte(cases.hearingDate, in7d),
            sql`${cases.phiSheetStatus} IS DISTINCT FROM 'complete'`,
          ),
        ),
      db
        .select({ count: count() })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, organizationId),
            eq(cases.status, "active"),
            isNull(cases.deletedAt),
            gte(cases.hearingDate, now),
            sql`(${cases.phiSheetStatus} = 'unassigned' OR ${cases.phiSheetStatus} IS NULL)`,
          ),
        ),
    ],
  );

  return {
    myAssigned: myAssigned[0]?.count ?? 0,
    myInProgress: myInProgress[0]?.count ?? 0,
    dueThisWeek: dueThisWeek[0]?.count ?? 0,
    unassigned: unassigned[0]?.count ?? 0,
  };
}

async function getMedicalRecordsSummary(
  organizationId: string,
): Promise<MedicalRecordsSummary> {
  const now = new Date();
  const in14d = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [urgent, rfcCounts, teamWorkload] = await Promise.all([
    db
      .select({ count: count() })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, organizationId),
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
          gte(cases.hearingDate, now),
          lte(cases.hearingDate, in14d),
          sql`${cases.mrStatus} IS DISTINCT FROM 'complete'`,
        ),
      ),
    db
      .select({
        status: rfcRequests.status,
        count: count(),
      })
      .from(rfcRequests)
      .where(eq(rfcRequests.organizationId, organizationId))
      .groupBy(rfcRequests.status),
    db
      .select({
        color: cases.mrTeamColor,
        count: count(),
      })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, organizationId),
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
          sql`${cases.mrTeamColor} IS NOT NULL`,
          sql`${cases.mrStatus} IS DISTINCT FROM 'complete'`,
        ),
      )
      .groupBy(cases.mrTeamColor),
  ]);

  let rfcRequested = 0;
  let rfcAwaiting = 0;
  let rfcReceived = 0;
  for (const row of rfcCounts) {
    if (row.status === "requested") rfcAwaiting = row.count;
    if (row.status === "received") rfcReceived = row.count;
    if (row.status === "not_requested") rfcRequested = row.count;
  }

  return {
    urgentBlocking14d: urgent[0]?.count ?? 0,
    rfcRequested,
    rfcAwaiting,
    rfcReceived,
    teamWorkload: teamWorkload
      .filter((r): r is { color: string; count: number } => r.color !== null)
      .map((r) => ({ color: r.color, count: r.count })),
  };
}

async function getMailSummary(organizationId: string): Promise<MailSummary> {
  const [pendingInbound, inTransit, certifiedInTransit, unmatched] =
    await Promise.all([
      // Inbound mail: documents tagged 'mail' (match heuristic until a
      // dedicated inbound_mail table exists).
      db
        .select({ count: count() })
        .from(documents)
        .innerJoin(cases, eq(documents.caseId, cases.id))
        .where(
          and(
            eq(cases.organizationId, organizationId),
            isNull(documents.deletedAt),
            sql`'mail' = ANY(${documents.tags})`,
          ),
        ),
      db
        .select({ count: count() })
        .from(outboundMail)
        .where(
          and(
            eq(outboundMail.organizationId, organizationId),
            isNull(outboundMail.deliveredAt),
          ),
        ),
      db
        .select({ count: count() })
        .from(outboundMail)
        .where(
          and(
            eq(outboundMail.organizationId, organizationId),
            isNull(outboundMail.deliveredAt),
            eq(outboundMail.mailType, "certified"),
          ),
        ),
      db
        .select({ count: count() })
        .from(documents)
        .where(
          and(
            isNull(documents.deletedAt),
            isNull(documents.caseId),
            sql`'mail' = ANY(${documents.tags})`,
          ),
        ),
    ]);

  return {
    pendingInbound: pendingInbound[0]?.count ?? 0,
    inTransit: inTransit[0]?.count ?? 0,
    certifiedInTransit: certifiedInTransit[0]?.count ?? 0,
    unmatched: unmatched[0]?.count ?? 0,
  };
}

async function getBillingSummary(
  organizationId: string,
): Promise<BillingSummary> {
  const now = new Date();

  const [outstanding, overdue, unbilledTime, unbilledExpense, drafts] =
    await Promise.all([
      // Outstanding: sent or overdue invoices, unpaid balance
      db
        .select({
          totalCents: sql<number>`coalesce(sum(${invoices.totalCents} - ${invoices.amountPaidCents}), 0)::int`,
          count: count(),
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, organizationId),
            sql`${invoices.status} IN ('sent','overdue')`,
          ),
        ),
      // Overdue subset: past due date or status=overdue
      db
        .select({
          totalCents: sql<number>`coalesce(sum(${invoices.totalCents} - ${invoices.amountPaidCents}), 0)::int`,
          count: count(),
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, organizationId),
            sql`(${invoices.status} = 'overdue' OR (${invoices.status} = 'sent' AND ${invoices.dueDate} < ${now}))`,
          ),
        ),
      // Unbilled time: billable entries with no invoice
      db
        .select({
          totalMinutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
          count: count(),
        })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.organizationId, organizationId),
            eq(timeEntries.billable, true),
            isNull(timeEntries.invoiceId),
          ),
        ),
      // Unbilled expenses: reimbursable, not yet billed
      db
        .select({
          totalCents: sql<number>`coalesce(sum(${expenses.amountCents}), 0)::int`,
          count: count(),
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.organizationId, organizationId),
            eq(expenses.reimbursable, true),
            isNull(expenses.invoiceId),
          ),
        ),
      // Draft invoices awaiting review/send
      db
        .select({ count: count() })
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, organizationId),
            eq(invoices.status, "draft"),
          ),
        ),
    ]);

  return {
    outstandingCents: outstanding[0]?.totalCents ?? 0,
    outstandingCount: outstanding[0]?.count ?? 0,
    overdueCents: overdue[0]?.totalCents ?? 0,
    overdueCount: overdue[0]?.count ?? 0,
    unbilledMinutes: unbilledTime[0]?.totalMinutes ?? 0,
    unbilledTimeCount: unbilledTime[0]?.count ?? 0,
    unbilledExpenseCents: unbilledExpense[0]?.totalCents ?? 0,
    unbilledExpenseCount: unbilledExpense[0]?.count ?? 0,
    draftInvoiceCount: drafts[0]?.count ?? 0,
  };
}

async function getTrustSummary(organizationId: string): Promise<TrustSummary> {
  const [accounts, unreconciled, lastReconciled] = await Promise.all([
    // Total balance across all trust accounts for this org
    db
      .select({
        totalCents: sql<number>`coalesce(sum(${trustAccounts.balanceCents}), 0)::int`,
        minBalance: sql<number>`coalesce(min(${trustAccounts.balanceCents}), 0)::int`,
        count: count(),
      })
      .from(trustAccounts)
      .where(eq(trustAccounts.organizationId, organizationId)),
    // Unreconciled transactions for org (joined through account)
    db
      .select({
        count: count(),
        oldestDate: sql<Date | null>`min(${trustTransactions.transactionDate})`,
      })
      .from(trustTransactions)
      .innerJoin(
        trustAccounts,
        eq(trustTransactions.trustAccountId, trustAccounts.id),
      )
      .where(
        and(
          eq(trustAccounts.organizationId, organizationId),
          eq(trustTransactions.reconciled, false),
        ),
      ),
    // Most recent reconciled transaction date as proxy for "last reconciled"
    db
      .select({
        latestDate: sql<Date | null>`max(${trustTransactions.transactionDate})`,
      })
      .from(trustTransactions)
      .innerJoin(
        trustAccounts,
        eq(trustTransactions.trustAccountId, trustAccounts.id),
      )
      .where(
        and(
          eq(trustAccounts.organizationId, organizationId),
          eq(trustTransactions.reconciled, true),
        ),
      ),
  ]);

  const now = Date.now();
  const oldestRaw = unreconciled[0]?.oldestDate;
  const oldestUnreconciledDays = oldestRaw
    ? Math.floor((now - new Date(oldestRaw).getTime()) / 86_400_000)
    : null;

  const lastRaw = lastReconciled[0]?.latestDate;
  const daysSinceLastReconciled = lastRaw
    ? Math.floor((now - new Date(lastRaw).getTime()) / 86_400_000)
    : null;

  return {
    totalBalanceCents: accounts[0]?.totalCents ?? 0,
    accountCount: accounts[0]?.count ?? 0,
    hasNegativeBalance: (accounts[0]?.minBalance ?? 0) < 0,
    unreconciledCount: unreconciled[0]?.count ?? 0,
    oldestUnreconciledDays,
    daysSinceLastReconciled,
  };
}

async function getTeamChatSummary(
  organizationId: string,
  userId: string,
): Promise<TeamChatSummary> {
  const [mentions, dms] = await Promise.all([
    // Unread mentions: messages in channels where current user is a member,
    // user is in mentioned_user_ids, and message created_at > last_read_at
    db
      .select({ count: count() })
      .from(chatMessages)
      .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
      .innerJoin(
        chatChannelMembers,
        and(
          eq(chatChannelMembers.channelId, chatMessages.channelId),
          eq(chatChannelMembers.userId, userId),
        ),
      )
      .where(
        and(
          eq(chatChannels.organizationId, organizationId),
          sql`${userId} = ANY(${chatMessages.mentionedUserIds})`,
          sql`${chatMessages.createdAt} > COALESCE(${chatChannelMembers.lastReadAt}, '1970-01-01')`,
        ),
      ),
    // Unread direct messages: channels of type='direct' where member is user
    // and message created_at > last_read_at and author is not current user
    db
      .select({ count: count() })
      .from(chatMessages)
      .innerJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
      .innerJoin(
        chatChannelMembers,
        and(
          eq(chatChannelMembers.channelId, chatMessages.channelId),
          eq(chatChannelMembers.userId, userId),
        ),
      )
      .where(
        and(
          eq(chatChannels.organizationId, organizationId),
          eq(chatChannels.channelType, "direct"),
          ne(chatMessages.userId, userId),
          sql`${chatMessages.createdAt} > COALESCE(${chatChannelMembers.lastReadAt}, '1970-01-01')`,
        ),
      ),
  ]);

  return {
    mentionCount: mentions[0]?.count ?? 0,
    dmUnreadCount: dms[0]?.count ?? 0,
  };
}

/* ─── Supervisor / Coaching / AI Drafts nav summaries ─── */

const SUPERVISOR_ROLES = new Set(["admin", "reviewer"]);

async function getSupervisorNavSummary(
  role: string,
): Promise<SupervisorNavSummary | undefined> {
  if (!SUPERVISOR_ROLES.has(role)) return undefined;
  try {
    const [
      matrix,
      openEvents,
      openFlags,
      openFindings,
      highRisk,
      openDrafts,
    ] = await Promise.all([
      getWorkloadMatrix(),
      getOpenSupervisorEventCount(),
      getOpenCoachingFlagCount(),
      getOpenComplianceFindingCount(),
      getHighRiskCaseCount(),
      getOpenDraftCount(),
    ]);

    const topOverloaded = [...matrix]
      .sort((a, b) => {
        if (b.overdueTaskCount !== a.overdueTaskCount) {
          return b.overdueTaskCount - a.overdueTaskCount;
        }
        return b.openTaskCount - a.openTaskCount;
      })
      .slice(0, 3)
      .map((r) => ({
        userId: r.userId,
        name: r.name,
        overdueTaskCount: r.overdueTaskCount,
        openTaskCount: r.openTaskCount,
      }));

    return {
      openEvents,
      highRisk,
      openFindings,
      openFlags,
      openDrafts,
      topOverloaded,
    };
  } catch {
    return undefined;
  }
}

async function getCoachingNavSummary(
  organizationId: string,
  userId: string,
  role: string,
): Promise<CoachingNavSummary | undefined> {
  if (!SUPERVISOR_ROLES.has(role)) return undefined;
  try {
    const visibilityConds =
      role === "admin"
        ? [eq(coachingFlags.organizationId, organizationId)]
        : [
            eq(coachingFlags.organizationId, organizationId),
            eq(coachingFlags.supervisorUserId, userId),
          ];

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      openTotalRow,
      highSevRow,
      inProgressRow,
      resolvedWeekRow,
      peopleRow,
      processRow,
      unclassifiedRow,
      trainingGapRow,
    ] = await Promise.all([
      db
        .select({ n: count() })
        .from(coachingFlags)
        .where(
          and(
            ...visibilityConds,
            inArray(coachingFlags.status, ["open", "in_progress"]),
          ),
        ),
      db
        .select({ n: count() })
        .from(coachingFlags)
        .where(
          and(
            ...visibilityConds,
            inArray(coachingFlags.status, ["open", "in_progress"]),
            gte(coachingFlags.severity, 6),
          ),
        ),
      db
        .select({ n: count() })
        .from(coachingFlags)
        .where(
          and(...visibilityConds, eq(coachingFlags.status, "in_progress")),
        ),
      db
        .select({ n: count() })
        .from(coachingFlags)
        .where(
          and(
            ...visibilityConds,
            eq(coachingFlags.status, "resolved"),
            gte(coachingFlags.resolvedAt, sevenDaysAgo),
          ),
        ),
      db
        .select({ n: count() })
        .from(coachingFlags)
        .where(
          and(
            ...visibilityConds,
            inArray(coachingFlags.status, ["open", "in_progress"]),
            eq(coachingFlags.classification, "people"),
          ),
        ),
      db
        .select({ n: count() })
        .from(coachingFlags)
        .where(
          and(
            ...visibilityConds,
            inArray(coachingFlags.status, ["open", "in_progress"]),
            eq(coachingFlags.classification, "process"),
          ),
        ),
      db
        .select({ n: count() })
        .from(coachingFlags)
        .where(
          and(
            ...visibilityConds,
            inArray(coachingFlags.status, ["open", "in_progress"]),
            isNull(coachingFlags.classification),
          ),
        ),
      db
        .select({ n: count() })
        .from(trainingGaps)
        .where(eq(trainingGaps.organizationId, organizationId)),
    ]);

    return {
      openTotal: openTotalRow[0]?.n ?? 0,
      openHighSeverity: highSevRow[0]?.n ?? 0,
      inProgress: inProgressRow[0]?.n ?? 0,
      resolvedThisWeek: resolvedWeekRow[0]?.n ?? 0,
      peopleCount: peopleRow[0]?.n ?? 0,
      processCount: processRow[0]?.n ?? 0,
      unclassifiedCount: unclassifiedRow[0]?.n ?? 0,
      trainingGapCount: trainingGapRow[0]?.n ?? 0,
    };
  } catch {
    return undefined;
  }
}

const AI_DRAFTS_ACTIVE_STATUSES = [
  "generating",
  "draft_ready",
  "in_review",
  "error",
] as const;

async function getAiDraftsNavSummary(
  organizationId: string,
  userId: string,
): Promise<AiDraftsNavSummary | undefined> {
  try {
    const orgCond = eq(aiDrafts.organizationId, organizationId);

    const [myQueueRow, needsReviewRow, errorRow, byTypeRows, recentRows] =
      await Promise.all([
        db
          .select({ n: count() })
          .from(aiDrafts)
          .where(
            and(
              orgCond,
              eq(aiDrafts.assignedReviewerId, userId),
              inArray(aiDrafts.status, [...AI_DRAFTS_ACTIVE_STATUSES]),
            ),
          ),
        db
          .select({ n: count() })
          .from(aiDrafts)
          .where(
            and(
              orgCond,
              inArray(aiDrafts.status, ["draft_ready", "in_review"]),
            ),
          ),
        db
          .select({ n: count() })
          .from(aiDrafts)
          .where(and(orgCond, eq(aiDrafts.status, "error"))),
        db
          .select({ type: aiDrafts.type, n: count() })
          .from(aiDrafts)
          .where(
            and(
              orgCond,
              inArray(aiDrafts.status, [...AI_DRAFTS_ACTIVE_STATUSES]),
            ),
          )
          .groupBy(aiDrafts.type),
        db
          .select({
            id: aiDrafts.id,
            title: aiDrafts.title,
            type: aiDrafts.type,
            caseNumber: cases.caseNumber,
            createdAt: aiDrafts.createdAt,
            approvedBy: aiDrafts.approvedBy,
            reviewerFirstName: users.firstName,
            reviewerLastName: users.lastName,
          })
          .from(aiDrafts)
          .leftJoin(cases, eq(aiDrafts.caseId, cases.id))
          .leftJoin(users, eq(aiDrafts.assignedReviewerId, users.id))
          .where(orgCond)
          .orderBy(desc(aiDrafts.createdAt))
          .limit(3),
      ]);

    const byType: Record<string, number> = {};
    for (const r of byTypeRows) {
      byType[r.type] = r.n;
    }

    const recent = recentRows.map((r) => {
      const first = r.reviewerFirstName ?? "";
      const last = r.reviewerLastName ?? "";
      const name = `${first} ${last}`.trim();
      const initials = name
        ? name
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p[0])
            .join("")
            .toUpperCase()
        : "AI";
      return {
        id: r.id,
        title: r.title,
        type: r.type,
        caseNumber: r.caseNumber ?? null,
        authorInitials: initials,
        createdAt:
          r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      };
    });

    return {
      myQueue: myQueueRow[0]?.n ?? 0,
      needsReview: needsReviewRow[0]?.n ?? 0,
      lowConfidence: 0,
      errorCount: errorRow[0]?.n ?? 0,
      byType,
      recent,
    };
  } catch {
    return undefined;
  }
}

/* ─── Main aggregator ─── */

export async function getNavPanelData(): Promise<NavPanelData> {
  const session = await requireSession();
  const orgId = session.organizationId;
  const userId = session.id;

  const [
    stageCounts,
    taskSummary,
    leadCounts,
    todayEvents,
    recentActivity,
    documentSummary,
    contactSummary,
    messageSummary,
    emailSummary,
    hearingsSummary,
    filingSummary,
    phiWriterSummary,
    medicalRecordsSummary,
    mailSummary,
    billingSummary,
    trustSummary,
    teamChatSummary,
    supervisorSummary,
    coachingSummary,
    aiDraftsSummary,
  ] = await Promise.all([
    getStageCounts(orgId).catch((): StageCounts[] => []),
    getTaskSummary(userId).catch(
      (): TaskSummary => ({
        total: 0,
        overdue: 0,
        dueToday: 0,
        topTasks: [],
      }),
    ),
    getLeadCounts(orgId).catch((): LeadCount[] => []),
    getTodayEvents(orgId).catch((): TodayEvent[] => []),
    getRecentActivity(orgId).catch((): RecentActivityItem[] => []),
    getDocumentSummary(orgId).catch(
      (): DocumentSummary => ({
        total: 0,
        byCategoryCount: {},
        bySourceCount: {},
        recentUploads: [],
      }),
    ),
    getContactSummary(orgId).catch(
      (): ContactSummary => ({
        total: 0,
        byTypeCount: {},
        recentContacts: [],
      }),
    ),
    getMessageSummary(orgId).catch(
      (): MessageSummary => ({
        total: 0,
        unreadCount: 0,
        recentMessages: [],
      }),
    ),
    getEmailSummary(orgId).catch(
      (): EmailSummary => ({
        matchedCount: 0,
        unmatchedCount: 0,
        isOutlookConfigured: false,
        recentEmails: [],
      }),
    ),
    getHearingsSummary(orgId).catch(
      (): HearingsSummary => ({
        next48hCount: 0,
        next7dCount: 0,
        next30dCount: 0,
        mrBlocking14dCount: 0,
      }),
    ),
    getFilingSummary(orgId).catch(
      (): FilingSummary => ({
        readyToSubmit: 0,
        bundlesReady: 0,
        submittedThisWeek: 0,
      }),
    ),
    getPhiWriterSummary(orgId, userId).catch(
      (): PhiWriterSummary => ({
        myAssigned: 0,
        myInProgress: 0,
        dueThisWeek: 0,
        unassigned: 0,
      }),
    ),
    getMedicalRecordsSummary(orgId).catch(
      (): MedicalRecordsSummary => ({
        urgentBlocking14d: 0,
        rfcRequested: 0,
        rfcAwaiting: 0,
        rfcReceived: 0,
        teamWorkload: [],
      }),
    ),
    getMailSummary(orgId).catch(
      (): MailSummary => ({
        pendingInbound: 0,
        inTransit: 0,
        certifiedInTransit: 0,
        unmatched: 0,
      }),
    ),
    getBillingSummary(orgId).catch(
      (): BillingSummary => ({
        outstandingCents: 0,
        outstandingCount: 0,
        overdueCents: 0,
        overdueCount: 0,
        unbilledMinutes: 0,
        unbilledTimeCount: 0,
        unbilledExpenseCents: 0,
        unbilledExpenseCount: 0,
        draftInvoiceCount: 0,
      }),
    ),
    getTrustSummary(orgId).catch(
      (): TrustSummary => ({
        totalBalanceCents: 0,
        accountCount: 0,
        hasNegativeBalance: false,
        unreconciledCount: 0,
        oldestUnreconciledDays: null,
        daysSinceLastReconciled: null,
      }),
    ),
    getTeamChatSummary(orgId, userId).catch(
      (): TeamChatSummary => ({
        mentionCount: 0,
        dmUnreadCount: 0,
      }),
    ),
    getSupervisorNavSummary(session.role).catch(() => undefined),
    getCoachingNavSummary(orgId, userId, session.role).catch(() => undefined),
    getAiDraftsNavSummary(orgId, userId).catch(() => undefined),
  ]);

  return {
    stageCounts,
    taskSummary,
    leadCounts,
    todayEvents,
    recentActivity,
    documentSummary,
    contactSummary,
    messageSummary,
    emailSummary,
    hearingsSummary,
    filingSummary,
    phiWriterSummary,
    medicalRecordsSummary,
    mailSummary,
    billingSummary,
    trustSummary,
    teamChatSummary,
    supervisorSummary,
    coachingSummary,
    aiDraftsSummary,
  };
}
