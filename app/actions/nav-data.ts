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
  sql,
} from "drizzle-orm";

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
};

/* ─── Sub-queries ─── */

async function getStageCounts(
  organizationId: string,
): Promise<StageCounts[]> {
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

async function getTaskSummary(
  userId: string,
): Promise<TaskSummary> {
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
          caseNumber: sql<string | null>`(select ${cases.caseNumber} from ${cases} where ${cases.id} = ${tasks.caseId})`,
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

async function getLeadCounts(
  organizationId: string,
): Promise<LeadCount[]> {
  const result = await db
    .select({
      status: leads.status,
      count: count(),
    })
    .from(leads)
    .where(
      and(
        eq(leads.organizationId, organizationId),
        isNull(leads.deletedAt),
      ),
    )
    .groupBy(leads.status);

  return result;
}

async function getTodayEvents(
  organizationId: string,
): Promise<TodayEvent[]> {
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
      caseNumber: sql<string | null>`(select ${cases.caseNumber} from ${cases} where ${cases.id} = ${calendarEvents.caseId})`,
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
      userName: sql<string | null>`(select concat(${users.firstName}, ' ', ${users.lastName}) from ${users} where ${users.id} = ${auditLog.userId})`,
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
  const [totalResult, categoryCounts, sourceCounts, recentUploads] = await Promise.all([
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

async function getEmailSummary(
  organizationId: string,
): Promise<EmailSummary> {
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
        caseNumber: sql<string | null>`(select ${cases.caseNumber} from ${cases} where ${cases.id} = ${communications.caseId})`,
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
  };
}
