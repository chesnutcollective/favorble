"use server";

import { db } from "@/db/drizzle";
import {
  cases,
  caseStages,
  caseStageGroups,
  caseStageTransitions,
  contacts,
  caseContacts,
  users,
  documents,
  medicalChronologyEntries,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNull,
  lte,
  sql,
  count,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

export type PhiSheetStatus =
  | "unassigned"
  | "assigned"
  | "in_progress"
  | "in_review"
  | "complete";

export type PhiWriterQueueRow = {
  caseId: string;
  caseNumber: string;
  claimantName: string;
  hearingDate: Date | null;
  daysUntilHearing: number | null;
  alj: string | null;
  hearingOffice: string | null;
  ssaClaimNumber: string | null;
  phiSheetStatus: PhiSheetStatus;
  assignedTo: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
};

export type PhiWriterMetrics = {
  myAssigned: number;
  inProgress: number;
  inReview: number;
  completedThisWeek: number;
  unassigned: number;
  dueWithin14Days: number;
};

export type PhiWriterQueueResult = {
  rows: PhiWriterQueueRow[];
  metrics: PhiWriterMetrics;
  currentUserId: string;
};

const WINDOW_DAYS = 60;

function daysBetween(from: Date, to: Date | null): number | null {
  if (!to) return null;
  const msPerDay = 86400000;
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

function normalizeStatus(value: string | null | undefined): PhiSheetStatus {
  switch (value) {
    case "assigned":
    case "in_progress":
    case "in_review":
    case "complete":
      return value;
    default:
      return "unassigned";
  }
}

/**
 * Get all cases that need PHI sheets, sorted by hearing date ASC.
 * Window: hearings in the next 60 days.
 */
export async function getPhiWriterQueue(): Promise<PhiWriterQueueResult> {
  const session = await requireSession();

  const now = new Date();
  const windowEnd = new Date(now.getTime() + WINDOW_DAYS * 86400000);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const in14Days = new Date(now.getTime() + 14 * 86400000);

  let rows: Array<{
    caseId: string;
    caseNumber: string;
    hearingDate: Date | null;
    alj: string | null;
    hearingOffice: string | null;
    ssaClaimNumber: string | null;
    phiSheetStatus: string | null;
    phiSheetWriterId: string | null;
    writerFirstName: string | null;
    writerLastName: string | null;
    claimantFirstName: string | null;
    claimantLastName: string | null;
  }> = [];

  try {
    rows = await db
      .select({
        caseId: cases.id,
        caseNumber: cases.caseNumber,
        hearingDate: cases.hearingDate,
        alj: cases.adminLawJudge,
        hearingOffice: cases.hearingOffice,
        ssaClaimNumber: cases.ssaClaimNumber,
        phiSheetStatus: cases.phiSheetStatus,
        phiSheetWriterId: cases.phiSheetWriterId,
        writerFirstName: users.firstName,
        writerLastName: users.lastName,
        claimantFirstName: contacts.firstName,
        claimantLastName: contacts.lastName,
      })
      .from(cases)
      .leftJoin(users, eq(cases.phiSheetWriterId, users.id))
      .leftJoin(
        caseContacts,
        and(
          eq(caseContacts.caseId, cases.id),
          eq(caseContacts.relationship, "claimant"),
          eq(caseContacts.isPrimary, true),
        ),
      )
      .leftJoin(contacts, eq(caseContacts.contactId, contacts.id))
      .where(
        and(
          eq(cases.organizationId, session.organizationId),
          isNull(cases.deletedAt),
          gte(cases.hearingDate, now),
          lte(cases.hearingDate, windowEnd),
        ),
      )
      .orderBy(asc(cases.hearingDate));
  } catch (err) {
    logger.error("Failed to load PHI writer queue", { error: err });
    rows = [];
  }

  const queueRows: PhiWriterQueueRow[] = rows.map((r) => ({
    caseId: r.caseId,
    caseNumber: r.caseNumber,
    claimantName:
      r.claimantFirstName && r.claimantLastName
        ? `${r.claimantFirstName} ${r.claimantLastName}`
        : "Unknown Claimant",
    hearingDate: r.hearingDate,
    daysUntilHearing: daysBetween(now, r.hearingDate),
    alj: r.alj,
    hearingOffice: r.hearingOffice,
    ssaClaimNumber: r.ssaClaimNumber,
    phiSheetStatus: normalizeStatus(r.phiSheetStatus),
    assignedTo:
      r.phiSheetWriterId && r.writerFirstName && r.writerLastName
        ? {
            id: r.phiSheetWriterId,
            firstName: r.writerFirstName,
            lastName: r.writerLastName,
          }
        : null,
  }));

  // Workload metrics
  let completedThisWeek = 0;
  try {
    const [completedRow] = await db
      .select({ total: count() })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, session.organizationId),
          isNull(cases.deletedAt),
          eq(cases.phiSheetWriterId, session.id),
          eq(cases.phiSheetStatus, "complete"),
          gte(cases.phiSheetCompletedAt, startOfWeek),
        ),
      );
    completedThisWeek = completedRow?.total ?? 0;
  } catch {
    completedThisWeek = 0;
  }

  const myAssigned = queueRows.filter(
    (r) =>
      r.assignedTo?.id === session.id &&
      (r.phiSheetStatus === "assigned" || r.phiSheetStatus === "in_progress"),
  ).length;
  const inProgress = queueRows.filter(
    (r) =>
      r.assignedTo?.id === session.id && r.phiSheetStatus === "in_progress",
  ).length;
  const inReview = queueRows.filter(
    (r) => r.phiSheetStatus === "in_review",
  ).length;
  const unassigned = queueRows.filter(
    (r) => r.phiSheetStatus === "unassigned",
  ).length;
  const dueWithin14Days = queueRows.filter(
    (r) =>
      r.hearingDate !== null &&
      r.hearingDate <= in14Days &&
      r.phiSheetStatus !== "complete",
  ).length;

  return {
    rows: queueRows,
    metrics: {
      myAssigned,
      inProgress,
      inReview,
      completedThisWeek,
      unassigned,
      dueWithin14Days,
    },
    currentUserId: session.id,
  };
}

export type PhiWriterCaseBundle = {
  currentUserId: string;
  caseId: string;
  caseNumber: string;
  status: string;
  ssaClaimNumber: string | null;
  ssaOffice: string | null;
  applicationTypePrimary: string | null;
  applicationTypeSecondary: string | null;
  allegedOnsetDate: Date | null;
  dateLastInsured: Date | null;
  hearingDate: Date | null;
  hearingOffice: string | null;
  adminLawJudge: string | null;
  daysUntilHearing: number | null;
  phiSheetStatus: PhiSheetStatus;
  phiSheetStartedAt: Date | null;
  phiSheetCompletedAt: Date | null;
  stageName: string | null;
  stageGroupName: string | null;
  stageGroupColor: string | null;
  assignedWriter: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  claimant: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null;
  chronology: Array<{
    id: string;
    eventDate: Date | null;
    entryType: string;
    providerName: string | null;
    facilityName: string | null;
    summary: string;
    diagnoses: string[] | null;
    treatments: string[] | null;
    medications: string[] | null;
    isVerified: boolean;
  }>;
  documents: Array<{
    id: string;
    fileName: string;
    category: string | null;
    source: string;
    createdAt: Date;
  }>;
  activity: Array<{
    id: string;
    fromStageId: string | null;
    toStageId: string;
    transitionedAt: Date;
    notes: string | null;
    isAutomatic: boolean;
    userName: string | null;
  }>;
};

/**
 * Get a full PHI writer bundle for one case:
 * case info, claimant, chronology, documents, recent activity.
 */
export async function getPhiWriterCaseData(
  caseId: string,
): Promise<PhiWriterCaseBundle | null> {
  const session = await requireSession();

  const [row] = await db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
      status: cases.status,
      ssaClaimNumber: cases.ssaClaimNumber,
      ssaOffice: cases.ssaOffice,
      applicationTypePrimary: cases.applicationTypePrimary,
      applicationTypeSecondary: cases.applicationTypeSecondary,
      allegedOnsetDate: cases.allegedOnsetDate,
      dateLastInsured: cases.dateLastInsured,
      hearingDate: cases.hearingDate,
      hearingOffice: cases.hearingOffice,
      adminLawJudge: cases.adminLawJudge,
      phiSheetStatus: cases.phiSheetStatus,
      phiSheetWriterId: cases.phiSheetWriterId,
      phiSheetStartedAt: cases.phiSheetStartedAt,
      phiSheetCompletedAt: cases.phiSheetCompletedAt,
      stageName: caseStages.name,
      stageGroupName: caseStageGroups.name,
      stageGroupColor: caseStageGroups.color,
      writerFirstName: users.firstName,
      writerLastName: users.lastName,
    })
    .from(cases)
    .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
    .leftJoin(caseStageGroups, eq(caseStages.stageGroupId, caseStageGroups.id))
    .leftJoin(users, eq(cases.phiSheetWriterId, users.id))
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, session.organizationId),
        isNull(cases.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  const [claimant] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      address: contacts.address,
      city: contacts.city,
      state: contacts.state,
      zip: contacts.zip,
    })
    .from(caseContacts)
    .innerJoin(contacts, eq(caseContacts.contactId, contacts.id))
    .where(
      and(
        eq(caseContacts.caseId, caseId),
        eq(caseContacts.relationship, "claimant"),
        eq(caseContacts.isPrimary, true),
      ),
    )
    .limit(1);

  const chronology = await db
    .select({
      id: medicalChronologyEntries.id,
      eventDate: medicalChronologyEntries.eventDate,
      entryType: medicalChronologyEntries.entryType,
      providerName: medicalChronologyEntries.providerName,
      facilityName: medicalChronologyEntries.facilityName,
      summary: medicalChronologyEntries.summary,
      diagnoses: medicalChronologyEntries.diagnoses,
      treatments: medicalChronologyEntries.treatments,
      medications: medicalChronologyEntries.medications,
      isVerified: medicalChronologyEntries.isVerified,
    })
    .from(medicalChronologyEntries)
    .where(
      and(
        eq(medicalChronologyEntries.caseId, caseId),
        eq(medicalChronologyEntries.isExcluded, false),
      ),
    )
    .orderBy(desc(medicalChronologyEntries.eventDate));

  const docs = await db
    .select({
      id: documents.id,
      fileName: documents.fileName,
      category: documents.category,
      source: documents.source,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(and(eq(documents.caseId, caseId), isNull(documents.deletedAt)))
    .orderBy(desc(documents.createdAt))
    .limit(50);

  const activity = await db
    .select({
      id: caseStageTransitions.id,
      fromStageId: caseStageTransitions.fromStageId,
      toStageId: caseStageTransitions.toStageId,
      transitionedAt: caseStageTransitions.transitionedAt,
      notes: caseStageTransitions.notes,
      isAutomatic: caseStageTransitions.isAutomatic,
      userName: sql<
        string | null
      >`concat(${users.firstName}, ' ', ${users.lastName})`,
    })
    .from(caseStageTransitions)
    .leftJoin(users, eq(caseStageTransitions.transitionedBy, users.id))
    .where(eq(caseStageTransitions.caseId, caseId))
    .orderBy(desc(caseStageTransitions.transitionedAt))
    .limit(10);

  const now = new Date();

  return {
    currentUserId: session.id,
    caseId: row.id,
    caseNumber: row.caseNumber,
    status: row.status,
    ssaClaimNumber: row.ssaClaimNumber,
    ssaOffice: row.ssaOffice,
    applicationTypePrimary: row.applicationTypePrimary,
    applicationTypeSecondary: row.applicationTypeSecondary,
    allegedOnsetDate: row.allegedOnsetDate,
    dateLastInsured: row.dateLastInsured,
    hearingDate: row.hearingDate,
    hearingOffice: row.hearingOffice,
    adminLawJudge: row.adminLawJudge,
    daysUntilHearing: daysBetween(now, row.hearingDate),
    phiSheetStatus: normalizeStatus(row.phiSheetStatus),
    phiSheetStartedAt: row.phiSheetStartedAt,
    phiSheetCompletedAt: row.phiSheetCompletedAt,
    stageName: row.stageName,
    stageGroupName: row.stageGroupName,
    stageGroupColor: row.stageGroupColor,
    assignedWriter:
      row.phiSheetWriterId && row.writerFirstName && row.writerLastName
        ? {
            id: row.phiSheetWriterId,
            firstName: row.writerFirstName,
            lastName: row.writerLastName,
          }
        : null,
    claimant: claimant ?? null,
    chronology,
    documents: docs,
    activity,
  };
}

/**
 * Update the PHI sheet status for a case. When transitioning into
 * 'in_progress' we stamp phiSheetStartedAt, and into 'complete' we stamp
 * phiSheetCompletedAt.
 */
export async function updatePhiSheetStatus(
  caseId: string,
  status: PhiSheetStatus,
) {
  const session = await requireSession();

  const updateData: Record<string, unknown> = {
    phiSheetStatus: status,
    updatedAt: new Date(),
    updatedBy: session.id,
  };

  if (status === "in_progress") {
    updateData.phiSheetStartedAt = new Date();
  }
  if (status === "complete") {
    updateData.phiSheetCompletedAt = new Date();
  }
  if (status === "unassigned") {
    updateData.phiSheetWriterId = null;
    updateData.phiSheetStartedAt = null;
    updateData.phiSheetCompletedAt = null;
  }

  await db
    .update(cases)
    .set(updateData)
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, session.organizationId),
      ),
    );

  logger.info("PHI sheet status updated", { caseId, status });
  revalidatePath("/phi-writer");
  revalidatePath(`/phi-writer/${caseId}`);
}

/**
 * Assign a PHI sheet to a writer. Sets status to 'assigned' if it was
 * previously unassigned.
 */
export async function assignPhiSheetToWriter(caseId: string, userId: string) {
  const session = await requireSession();

  const [existing] = await db
    .select({
      phiSheetStatus: cases.phiSheetStatus,
    })
    .from(cases)
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  const nextStatus =
    !existing?.phiSheetStatus || existing.phiSheetStatus === "unassigned"
      ? "assigned"
      : existing.phiSheetStatus;

  await db
    .update(cases)
    .set({
      phiSheetWriterId: userId,
      phiSheetStatus: nextStatus,
      updatedAt: new Date(),
      updatedBy: session.id,
    })
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, session.organizationId),
      ),
    );

  logger.info("PHI sheet assigned", { caseId, userId });
  revalidatePath("/phi-writer");
  revalidatePath(`/phi-writer/${caseId}`);
}

/**
 * List org users available to assign PHI sheets to. Currently returns all
 * active users in the org; the UI can filter to PHI writers.
 */
export async function getPhiWriters() {
  const session = await requireSession();
  return db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      team: users.team,
    })
    .from(users)
    .where(
      and(
        eq(users.organizationId, session.organizationId),
        eq(users.isActive, true),
      ),
    )
    .orderBy(asc(users.lastName), asc(users.firstName));
}
