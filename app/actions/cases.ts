"use server";

import { db } from "@/db/drizzle";
import {
  cases,
  caseStages,
  caseStageGroups,
  caseAssignments,
  caseStageTransitions,
  users,
  contacts,
  caseContacts,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { executeStageWorkflows } from "@/lib/workflow-engine";
import {
  eq,
  and,
  isNull,
  desc,
  asc,
  ilike,
  or,
  sql,
  count,
  inArray,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";
import {
  logPhiAccess,
  logPhiModification,
  shouldAudit,
} from "@/lib/services/hipaa-audit";
import * as caseStatusClient from "@/lib/integrations/case-status";

export type CaseFilters = {
  search?: string;
  status?: string;
  stageId?: string;
  stageGroupId?: string;
  assignedToId?: string;
  team?: string;
  sortBy?: "caseNumber" | "updatedAt" | "createdAt" | "stage" | "assignedTo";
  sortDir?: "asc" | "desc";
};

export type Pagination = {
  page: number;
  pageSize: number;
};

/**
 * Get paginated cases with filters.
 */
export async function getCases(
  filters: CaseFilters = {},
  pagination: Pagination = { page: 1, pageSize: 50 },
) {
  const session = await requireSession();
  const conditions = [
    eq(cases.organizationId, session.organizationId),
    isNull(cases.deletedAt),
  ];

  if (filters.status) {
    conditions.push(
      eq(
        cases.status,
        filters.status as
          | "active"
          | "on_hold"
          | "closed_won"
          | "closed_lost"
          | "closed_withdrawn",
      ),
    );
  }

  if (filters.stageId) {
    conditions.push(eq(cases.currentStageId, filters.stageId));
  }

  if (filters.search) {
    const searchTerm = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(cases.caseNumber, searchTerm),
        ilike(cases.ssaClaimNumber, searchTerm),
      )!,
    );
  }

  // Team filter — owningTeam lives on caseStages (the team that owns the
  // stage the case is in), not on cases itself. The LEFT JOIN with
  // caseStages below brings it into scope.
  if (filters.team) {
    conditions.push(
      sql`${caseStages.owningTeam} = ${filters.team}`,
    );
  }

  // Assigned-to filter — restrict to cases whose primary current assignment
  // matches the user. Uses a subquery instead of a join to avoid duplicating
  // case rows when a case has multiple assignments.
  if (filters.assignedToId) {
    conditions.push(
      inArray(
        cases.id,
        db
          .select({ caseId: caseAssignments.caseId })
          .from(caseAssignments)
          .where(
            and(
              eq(caseAssignments.userId, filters.assignedToId),
              eq(caseAssignments.isPrimary, true),
              isNull(caseAssignments.unassignedAt),
            ),
          ),
      ),
    );
  }

  // Dynamic ordering — map the allowed sort keys to their concrete SQL
  // column; unknown keys fall back to the safe "most recently updated first"
  // default so bad ?sortBy values don't blow up the page.
  const sortDir: "asc" | "desc" = filters.sortDir === "asc" ? "asc" : "desc";
  const orderFn = sortDir === "asc" ? asc : desc;
  const orderColumn =
    filters.sortBy === "caseNumber"
      ? cases.caseNumber
      : filters.sortBy === "createdAt"
        ? cases.createdAt
        : filters.sortBy === "stage"
          ? caseStages.displayOrder
          : filters.sortBy === "assignedTo"
            ? sql`
                (SELECT ${users.firstName}
                 FROM ${caseAssignments}
                 INNER JOIN ${users} ON ${users.id} = ${caseAssignments.userId}
                 WHERE ${caseAssignments.caseId} = ${cases.id}
                   AND ${caseAssignments.isPrimary} = true
                   AND ${caseAssignments.unassignedAt} IS NULL
                 LIMIT 1)
              `
            : cases.updatedAt;

  const offset = (pagination.page - 1) * pagination.pageSize;

  const [caseRows, totalResult] = await Promise.all([
    db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        status: cases.status,
        currentStageId: cases.currentStageId,
        stageName: caseStages.name,
        stageCode: caseStages.code,
        stageGroupId: caseStages.stageGroupId,
        stageGroupName: caseStageGroups.name,
        stageColor: caseStages.color,
        stageGroupColor: caseStageGroups.color,
        ssaOffice: cases.ssaOffice,
        createdAt: cases.createdAt,
        updatedAt: cases.updatedAt,
      })
      .from(cases)
      .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
      .leftJoin(
        caseStageGroups,
        eq(caseStages.stageGroupId, caseStageGroups.id),
      )
      .where(and(...conditions))
      .orderBy(orderFn(orderColumn))
      .limit(pagination.pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(cases)
      .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
      .where(and(...conditions)),
  ]);

  // Get primary contacts and assignments in parallel instead of serially so
  // the case list page pays one round-trip instead of two.
  const caseIds = caseRows.map((c) => c.id);
  const [primaryContacts, assignments] =
    caseIds.length > 0
      ? await Promise.all([
          db
            .select({
              caseId: caseContacts.caseId,
              firstName: contacts.firstName,
              lastName: contacts.lastName,
              relationship: caseContacts.relationship,
            })
            .from(caseContacts)
            .innerJoin(contacts, eq(caseContacts.contactId, contacts.id))
            .where(
              and(
                inArray(caseContacts.caseId, caseIds),
                eq(caseContacts.isPrimary, true),
              ),
            ),
          db
            .select({
              caseId: caseAssignments.caseId,
              userId: caseAssignments.userId,
              role: caseAssignments.role,
              firstName: users.firstName,
              lastName: users.lastName,
            })
            .from(caseAssignments)
            .innerJoin(users, eq(caseAssignments.userId, users.id))
            .where(
              and(
                inArray(caseAssignments.caseId, caseIds),
                eq(caseAssignments.isPrimary, true),
                isNull(caseAssignments.unassignedAt),
              ),
            ),
        ])
      : [[], []];

  // Prefer claimant contacts; fall back to any primary contact
  const contactMap = new Map<string, { firstName: string; lastName: string }>();
  for (const c of primaryContacts) {
    const existing = contactMap.get(c.caseId);
    if (!existing || c.relationship === "claimant") {
      contactMap.set(c.caseId, {
        firstName: c.firstName,
        lastName: c.lastName,
      });
    }
  }
  const assignmentMap = new Map<
    string,
    { userId: string; firstName: string; lastName: string; role: string }[]
  >();
  for (const a of assignments) {
    if (!assignmentMap.has(a.caseId)) assignmentMap.set(a.caseId, []);
    assignmentMap.get(a.caseId)!.push(a);
  }

  const enrichedCases = caseRows.map((c) => ({
    ...c,
    claimant: contactMap.get(c.id) ?? null,
    assignedStaff: assignmentMap.get(c.id) ?? [],
  }));

  return {
    cases: enrichedCases,
    total: totalResult[0]?.total ?? 0,
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

/**
 * Get a single case by ID with full details.
 */
export async function getCaseById(id: string) {
  const session = await requireSession();

  const [caseRow] = await db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
      status: cases.status,
      currentStageId: cases.currentStageId,
      stageEnteredAt: cases.stageEnteredAt,
      stageName: caseStages.name,
      stageCode: caseStages.code,
      stageGroupId: caseStages.stageGroupId,
      stageGroupName: caseStageGroups.name,
      stageColor: caseStages.color,
      stageGroupColor: caseStageGroups.color,
      ssnEncrypted: cases.ssnEncrypted,
      dateOfBirth: cases.dateOfBirth,
      ssaClaimNumber: cases.ssaClaimNumber,
      ssaOffice: cases.ssaOffice,
      applicationTypePrimary: cases.applicationTypePrimary,
      applicationTypeSecondary: cases.applicationTypeSecondary,
      allegedOnsetDate: cases.allegedOnsetDate,
      dateLastInsured: cases.dateLastInsured,
      hearingOffice: cases.hearingOffice,
      adminLawJudge: cases.adminLawJudge,
      chronicleClaimantId: cases.chronicleClaimantId,
      chronicleUrl: cases.chronicleUrl,
      chronicleLastSyncAt: cases.chronicleLastSyncAt,
      caseStatusExternalId: cases.caseStatusExternalId,
      closedAt: cases.closedAt,
      closedReason: cases.closedReason,
      aiSummary: cases.aiSummary,
      aiSummaryGeneratedAt: cases.aiSummaryGeneratedAt,
      aiSummaryModel: cases.aiSummaryModel,
      aiSummaryVersion: cases.aiSummaryVersion,
      referralSource: cases.referralSource,
      referralContactId: cases.referralContactId,
      createdAt: cases.createdAt,
      updatedAt: cases.updatedAt,
    })
    .from(cases)
    .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
    .leftJoin(caseStageGroups, eq(caseStages.stageGroupId, caseStageGroups.id))
    .where(
      and(
        eq(cases.id, id),
        eq(cases.organizationId, session.organizationId),
        isNull(cases.deletedAt),
      ),
    )
    .limit(1);

  if (!caseRow) return null;

  // Get primary contact
  const [primaryContact] = await db
    .select({
      contactId: contacts.id,
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
        eq(caseContacts.caseId, id),
        eq(caseContacts.isPrimary, true),
        eq(caseContacts.relationship, "claimant"),
      ),
    )
    .limit(1);

  // Get assignments
  const assignedStaff = await db
    .select({
      id: caseAssignments.id,
      userId: caseAssignments.userId,
      role: caseAssignments.role,
      isPrimary: caseAssignments.isPrimary,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.avatarUrl,
      team: users.team,
    })
    .from(caseAssignments)
    .innerJoin(users, eq(caseAssignments.userId, users.id))
    .where(
      and(eq(caseAssignments.caseId, id), isNull(caseAssignments.unassignedAt)),
    );

  // Get stage groups for the progress bar
  const stageGroups = await db
    .select({
      id: caseStageGroups.id,
      name: caseStageGroups.name,
      color: caseStageGroups.color,
      displayOrder: caseStageGroups.displayOrder,
    })
    .from(caseStageGroups)
    .where(eq(caseStageGroups.organizationId, session.organizationId))
    .orderBy(asc(caseStageGroups.displayOrder));

  // HIPAA: record that this user viewed a case detail view containing PHI.
  // Debounced per (user, case) to avoid flooding on rapid refreshes.
  const phiFields: string[] = [];
  if (caseRow.ssnEncrypted) phiFields.push("ssnEncrypted");
  if (caseRow.dateOfBirth) phiFields.push("dateOfBirth");
  if (caseRow.ssaClaimNumber) phiFields.push("ssaClaimNumber");
  if (phiFields.length > 0) {
    const dedupeKey = `case_view:${session.id}:${id}`;
    if (shouldAudit(dedupeKey)) {
      await logPhiAccess({
        organizationId: session.organizationId,
        userId: session.id,
        entityType: "case",
        entityId: id,
        caseId: id,
        fieldsAccessed: phiFields,
        reason: "case detail view",
        severity: "info",
      });
    }
  }

  return {
    ...caseRow,
    claimant: primaryContact ?? null,
    assignedStaff,
    stageGroups,
  };
}

/**
 * Create a new case.
 */
export async function createCase(data: {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  initialStageId: string;
  ssaOffice?: string;
  applicationTypePrimary?: string;
  leadId?: string;
}) {
  const session = await requireSession();

  // Generate case number
  const [lastCase] = await db
    .select({ caseNumber: cases.caseNumber })
    .from(cases)
    .where(eq(cases.organizationId, session.organizationId))
    .orderBy(desc(cases.createdAt))
    .limit(1);

  const nextNum = lastCase
    ? Number.parseInt(lastCase.caseNumber.replace(/\D/g, ""), 10) + 1
    : 1001;
  const caseNumber = `CF-${nextNum}`;

  // Create contact
  const [contact] = await db
    .insert(contacts)
    .values({
      organizationId: session.organizationId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      contactType: "claimant",
      createdBy: session.id,
    })
    .returning();

  // Create case
  const [newCase] = await db
    .insert(cases)
    .values({
      organizationId: session.organizationId,
      caseNumber,
      currentStageId: data.initialStageId,
      ssaOffice: data.ssaOffice,
      applicationTypePrimary: data.applicationTypePrimary,
      leadId: data.leadId,
      createdBy: session.id,
      updatedBy: session.id,
    })
    .returning();

  // Link contact to case
  await db.insert(caseContacts).values({
    caseId: newCase.id,
    contactId: contact.id,
    relationship: "claimant",
    isPrimary: true,
  });

  // Log stage transition
  await db.insert(caseStageTransitions).values({
    caseId: newCase.id,
    toStageId: data.initialStageId,
    transitionedBy: session.id,
  });

  // Execute stage workflows
  await executeStageWorkflows(
    newCase.id,
    data.initialStageId,
    session.id,
    session.organizationId,
  );

  logger.info("Case created", { caseId: newCase.id, caseNumber });
  revalidatePath("/cases");
  return newCase;
}

/**
 * Change a case's stage and trigger workflows.
 *
 * Also mirrors the new stage to the external CaseStatus "Pizza Tracker"
 * portal when configured. External sync failures are logged but never
 * block the local stage change.
 */
export async function changeCaseStage(data: {
  caseId: string;
  newStageId: string;
  notes?: string;
}): Promise<{ externalSync: "ok" | "failed" | "skipped" }> {
  const session = await requireSession();

  const [currentCase] = await db
    .select({
      currentStageId: cases.currentStageId,
      caseStatusExternalId: cases.caseStatusExternalId,
    })
    .from(cases)
    .where(eq(cases.id, data.caseId));

  if (!currentCase) throw new Error("Case not found");

  // Update case stage
  await db
    .update(cases)
    .set({
      currentStageId: data.newStageId,
      stageEnteredAt: new Date(),
      updatedAt: new Date(),
      updatedBy: session.id,
    })
    .where(eq(cases.id, data.caseId));

  // Log transition
  await db.insert(caseStageTransitions).values({
    caseId: data.caseId,
    fromStageId: currentCase.currentStageId,
    toStageId: data.newStageId,
    transitionedBy: session.id,
    notes: data.notes,
  });

  // Execute workflows for the new stage
  await executeStageWorkflows(
    data.caseId,
    data.newStageId,
    session.id,
    session.organizationId,
  );

  logger.info("Case stage changed", {
    caseId: data.caseId,
    fromStageId: currentCase.currentStageId,
    toStageId: data.newStageId,
  });

  // Mirror stage to CaseStatus portal (best-effort; never block local change).
  let externalSync: "ok" | "failed" | "skipped" = "skipped";
  if (
    currentCase.caseStatusExternalId &&
    caseStatusClient.isConfigured()
  ) {
    try {
      const [newStage] = await db
        .select({
          stageName: caseStages.name,
          clientVisibleName: caseStageGroups.clientVisibleName,
          clientVisibleDescription: caseStageGroups.clientVisibleDescription,
          groupName: caseStageGroups.name,
        })
        .from(caseStages)
        .innerJoin(
          caseStageGroups,
          eq(caseStages.stageGroupId, caseStageGroups.id),
        )
        .where(eq(caseStages.id, data.newStageId))
        .limit(1);

      if (newStage) {
        const displayName =
          newStage.clientVisibleName ?? newStage.groupName ?? newStage.stageName;
        const ok = await caseStatusClient.updateCaseStage(
          currentCase.caseStatusExternalId,
          displayName,
          newStage.clientVisibleDescription ?? undefined,
        );
        externalSync = ok ? "ok" : "failed";
      }
    } catch (error) {
      logger.error("CaseStatus stage sync threw", {
        caseId: data.caseId,
        error,
      });
      externalSync = "failed";
    }
  }

  revalidatePath(`/cases/${data.caseId}`);
  revalidatePath("/cases");
  revalidatePath("/queue");

  return { externalSync };
}

/**
 * Update case details.
 */
export async function updateCase(
  id: string,
  data: {
    status?: string;
    ssaClaimNumber?: string;
    ssaOffice?: string;
    chronicleUrl?: string;
    hearingOffice?: string;
    adminLawJudge?: string;
  },
) {
  const session = await requireSession();

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedBy: session.id,
  };

  if (data.status)
    updateData.status = data.status as
      | "active"
      | "on_hold"
      | "closed_won"
      | "closed_lost"
      | "closed_withdrawn";
  if (data.ssaClaimNumber !== undefined)
    updateData.ssaClaimNumber = data.ssaClaimNumber;
  if (data.ssaOffice !== undefined) updateData.ssaOffice = data.ssaOffice;
  if (data.chronicleUrl !== undefined)
    updateData.chronicleUrl = data.chronicleUrl;
  if (data.hearingOffice !== undefined)
    updateData.hearingOffice = data.hearingOffice;
  if (data.adminLawJudge !== undefined)
    updateData.adminLawJudge = data.adminLawJudge;

  await db.update(cases).set(updateData).where(eq(cases.id, id));
  revalidatePath(`/cases/${id}`);
}

/**
 * Assign a staff member to a case.
 */
export async function assignStaffToCase(
  caseId: string,
  userId: string,
  role: string,
  isPrimary = false,
) {
  await db.insert(caseAssignments).values({
    caseId,
    userId,
    role,
    isPrimary,
  });
  revalidatePath(`/cases/${caseId}`);
}

/**
 * Get case activity (stage transitions).
 */
export async function getCaseActivity(caseId: string) {
  const transitions = await db
    .select({
      id: caseStageTransitions.id,
      fromStageId: caseStageTransitions.fromStageId,
      toStageId: caseStageTransitions.toStageId,
      transitionedAt: caseStageTransitions.transitionedAt,
      notes: caseStageTransitions.notes,
      isAutomatic: caseStageTransitions.isAutomatic,
      userName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
    })
    .from(caseStageTransitions)
    .leftJoin(users, eq(caseStageTransitions.transitionedBy, users.id))
    .where(eq(caseStageTransitions.caseId, caseId))
    .orderBy(desc(caseStageTransitions.transitionedAt));

  return transitions;
}

/**
 * Get counts of cases by stage for dashboard.
 */
export async function getCaseCountsByStage() {
  const session = await requireSession();

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
        eq(cases.organizationId, session.organizationId),
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

/**
 * Get total active cases count.
 */
export async function getActiveCaseCount() {
  const session = await requireSession();
  const [result] = await db
    .select({ total: count() })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, session.organizationId),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
      ),
    );
  return result?.total ?? 0;
}

/**
 * Get organization users (for dropdowns).
 */
export async function getOrgUsers() {
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

/**
 * Bulk change stage for multiple cases.
 */
export async function bulkChangeCaseStage(
  caseIds: string[],
  newStageId: string,
) {
  const session = await requireSession();
  for (const caseId of caseIds) {
    await changeCaseStage({ caseId, newStageId });
  }
  revalidatePath("/cases");
}

/**
 * Bulk assign a user as the primary "attorney" for multiple cases. Existing
 * primary attorney assignments are soft-unassigned (unassignedAt set) so
 * uniqueness on (case_id, user_id, role) is preserved. If the target user is
 * already assigned (re-activated), the existing row is reused.
 */
export async function bulkAssignCases(caseIds: string[], userId: string) {
  const session = await requireSession();
  if (caseIds.length === 0) return;

  // Validate the user belongs to the same org and is active.
  const [targetUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.organizationId, session.organizationId),
        eq(users.isActive, true),
      ),
    )
    .limit(1);

  if (!targetUser) {
    throw new Error("Target user not found or inactive");
  }

  const now = new Date();

  for (const caseId of caseIds) {
    // Unassign current primary attorneys on this case (soft).
    await db
      .update(caseAssignments)
      .set({ unassignedAt: now })
      .where(
        and(
          eq(caseAssignments.caseId, caseId),
          eq(caseAssignments.isPrimary, true),
          eq(caseAssignments.role, "attorney"),
          isNull(caseAssignments.unassignedAt),
        ),
      );

    // Insert the new primary attorney assignment. If a row already exists for
    // (case_id, user_id, role) reactivate it rather than failing the unique
    // index.
    const [existing] = await db
      .select({ id: caseAssignments.id })
      .from(caseAssignments)
      .where(
        and(
          eq(caseAssignments.caseId, caseId),
          eq(caseAssignments.userId, userId),
          eq(caseAssignments.role, "attorney"),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(caseAssignments)
        .set({
          isPrimary: true,
          unassignedAt: null,
          assignedAt: now,
        })
        .where(eq(caseAssignments.id, existing.id));
    } else {
      await db.insert(caseAssignments).values({
        caseId,
        userId,
        role: "attorney",
        isPrimary: true,
      });
    }

    await db
      .update(cases)
      .set({ updatedAt: now, updatedBy: session.id })
      .where(eq(cases.id, caseId));
  }

  logger.info("Cases bulk assigned", {
    caseCount: caseIds.length,
    userId,
  });

  revalidatePath("/cases");
}

/**
 * Get allowed next stages for a case. Returns the current stage's
 * allowedNextStageIds resolved to full stage objects, grouped by stage group.
 * If allowedNextStageIds is null/empty, returns ALL stages (unrestricted).
 */
export async function getAllowedNextStages(caseId: string) {
  const session = await requireSession();

  const [caseRow] = await db
    .select({
      currentStageId: cases.currentStageId,
    })
    .from(cases)
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, session.organizationId),
      ),
    );

  if (!caseRow?.currentStageId) return [];

  const [currentStage] = await db
    .select({
      allowedNextStageIds: caseStages.allowedNextStageIds,
    })
    .from(caseStages)
    .where(eq(caseStages.id, caseRow.currentStageId));

  const allStages = await db
    .select({
      id: caseStages.id,
      name: caseStages.name,
      code: caseStages.code,
      color: caseStages.color,
      stageGroupId: caseStages.stageGroupId,
      stageGroupName: caseStageGroups.name,
      stageGroupColor: caseStageGroups.color,
      displayOrder: caseStages.displayOrder,
      groupDisplayOrder: caseStageGroups.displayOrder,
    })
    .from(caseStages)
    .innerJoin(caseStageGroups, eq(caseStages.stageGroupId, caseStageGroups.id))
    .where(
      and(
        eq(caseStages.organizationId, session.organizationId),
        isNull(caseStages.deletedAt),
      ),
    )
    .orderBy(asc(caseStageGroups.displayOrder), asc(caseStages.displayOrder));

  const allowed = currentStage?.allowedNextStageIds;
  if (allowed && allowed.length > 0) {
    return allStages.filter(
      (s) => allowed.includes(s.id) && s.id !== caseRow.currentStageId,
    );
  }

  // Unrestricted: return all stages except current
  return allStages.filter((s) => s.id !== caseRow.currentStageId);
}

/**
 * Preview what workflows would fire for a stage transition.
 * Server action wrapper for the workflow engine.
 */
export async function previewStageChange(newStageId: string) {
  await requireSession();
  const { previewStageWorkflows } = await import("@/lib/workflow-engine");
  return previewStageWorkflows(newStageId);
}

/**
 * Reveal the full SSN for a case (decrypted). Requires authentication.
 */
export async function revealCaseSSN(caseId: string): Promise<string | null> {
  const session = await requireSession();

  const [caseRow] = await db
    .select({ ssnEncrypted: cases.ssnEncrypted })
    .from(cases)
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, session.organizationId),
        isNull(cases.deletedAt),
      ),
    )
    .limit(1);

  if (!caseRow?.ssnEncrypted) return null;

  try {
    const { decrypt, formatSSN } = await import("@/lib/encryption");
    const raw = decrypt(caseRow.ssnEncrypted);
    // HIPAA: SSN reveal is always logged (never debounced).
    await logPhiAccess({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "case",
      entityId: caseId,
      caseId,
      fieldsAccessed: ["ssn_full"],
      reason: "SSN reveal",
      severity: "warning",
      action: "phi_access.ssn_reveal",
    });
    return formatSSN(raw);
  } catch (err) {
    logger.error("Failed to decrypt SSN", { caseId, error: err });
    return null;
  }
}

/**
 * CaseStatus parity: reason codes for closing a case.
 * These are free-form text stored in `cases.closed_reason`.
 */
const CLOSE_CASE_REASONS = [
  "won",
  "lost",
  "withdrawn",
  "referred_out",
  "other",
] as const;
type CloseCaseReason = (typeof CLOSE_CASE_REASONS)[number];

/** Map a CaseStatus-style close reason to the cases.status enum value. */
function closeReasonToStatus(
  reason: CloseCaseReason,
): "closed_won" | "closed_lost" | "closed_withdrawn" {
  switch (reason) {
    case "won":
      return "closed_won";
    case "lost":
      return "closed_lost";
    case "withdrawn":
      return "closed_withdrawn";
    case "referred_out":
    case "other":
    default:
      // No dedicated enum value for these; bucket them as withdrawn so the
      // case leaves the active pipeline. The granular reason is preserved in
      // `closed_reason`.
      return "closed_withdrawn";
  }
}

/**
 * Close a case with a reason code and optional notes.
 * Writes HIPAA audit trail and revalidates case detail paths.
 */
export async function closeCase(
  caseId: string,
  reason: CloseCaseReason,
  notes?: string,
): Promise<void> {
  const session = await requireSession();

  if (!CLOSE_CASE_REASONS.includes(reason)) {
    throw new Error(`Invalid close reason: ${reason}`);
  }

  const [existing] = await db
    .select({
      id: cases.id,
      status: cases.status,
      closedReason: cases.closedReason,
    })
    .from(cases)
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, session.organizationId),
        isNull(cases.deletedAt),
      ),
    )
    .limit(1);

  if (!existing) throw new Error("Case not found");

  const newStatus = closeReasonToStatus(reason);
  const now = new Date();

  await db
    .update(cases)
    .set({
      status: newStatus,
      closedAt: now,
      closedReason: reason,
      // Clear any prior hold state when closing.
      holdReason: null,
      holdUntil: null,
      holdBy: null,
      updatedAt: now,
      updatedBy: session.id,
    })
    .where(eq(cases.id, caseId));

  await logPhiModification({
    organizationId: session.organizationId,
    userId: session.id,
    entityType: "case",
    entityId: caseId,
    caseId,
    operation: "update",
    action: "case.close",
    changes: {
      before: { status: existing.status, closedReason: existing.closedReason },
      after: { status: newStatus, closedReason: reason, closedAt: now },
    },
    metadata: {
      closeReason: reason,
      notes: notes ?? null,
    },
  });

  logger.info("Case closed", {
    caseId,
    reason,
    status: newStatus,
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
  revalidatePath("/queue");
}

/**
 * CaseStatus parity: reason codes for placing a case on hold.
 * Stored as free-form text in `cases.hold_reason`.
 */
const HOLD_CASE_REASONS = [
  "client_unresponsive",
  "medical_pending",
  "awaiting_docs",
  "other",
] as const;
type HoldCaseReason = (typeof HOLD_CASE_REASONS)[number];

/**
 * Place a case on hold with a reason code, optional hold-until date, and notes.
 * Writes HIPAA audit trail and revalidates case detail paths.
 */
export async function placeCaseOnHold(
  caseId: string,
  reason: HoldCaseReason,
  holdUntil?: Date | null,
  notes?: string,
): Promise<void> {
  const session = await requireSession();

  if (!HOLD_CASE_REASONS.includes(reason)) {
    throw new Error(`Invalid hold reason: ${reason}`);
  }

  const [existing] = await db
    .select({
      id: cases.id,
      status: cases.status,
      holdReason: cases.holdReason,
    })
    .from(cases)
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, session.organizationId),
        isNull(cases.deletedAt),
      ),
    )
    .limit(1);

  if (!existing) throw new Error("Case not found");

  const now = new Date();

  await db
    .update(cases)
    .set({
      status: "on_hold",
      holdReason: reason,
      holdUntil: holdUntil ?? null,
      holdBy: session.id,
      updatedAt: now,
      updatedBy: session.id,
    })
    .where(eq(cases.id, caseId));

  await logPhiModification({
    organizationId: session.organizationId,
    userId: session.id,
    entityType: "case",
    entityId: caseId,
    caseId,
    operation: "update",
    action: "case.place_on_hold",
    changes: {
      before: { status: existing.status, holdReason: existing.holdReason },
      after: {
        status: "on_hold",
        holdReason: reason,
        holdUntil: holdUntil ?? null,
      },
    },
    metadata: {
      holdReason: reason,
      holdUntil: holdUntil ? holdUntil.toISOString() : null,
      notes: notes ?? null,
    },
  });

  logger.info("Case placed on hold", {
    caseId,
    reason,
    holdUntil: holdUntil ? holdUntil.toISOString() : null,
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
  revalidatePath("/queue");
}

/**
 * Relationship values accepted on the `case_contacts` join table.
 * Keep in sync with the "+ Add Client" dialog on the case overview.
 */
const CASE_CONTACT_RELATIONSHIPS = [
  "claimant",
  "spouse",
  "parent",
  "guardian",
  "rep_payee",
  "attorney_in_fact",
  "other",
] as const;

type CaseContactRelationship = (typeof CASE_CONTACT_RELATIONSHIPS)[number];

/**
 * Get every contact attached to a case via case_contacts, ordered so primary
 * + claimant rise to the top. Used by the extended "Parties" section on the
 * case overview.
 */
export async function getCaseContacts(caseId: string) {
  const session = await requireSession();

  // Guard: confirm the case belongs to the caller's org.
  const [caseRow] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, session.organizationId),
        isNull(cases.deletedAt),
      ),
    )
    .limit(1);

  if (!caseRow) return [];

  const rows = await db
    .select({
      id: caseContacts.id,
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      relationship: caseContacts.relationship,
      isPrimary: caseContacts.isPrimary,
      createdAt: caseContacts.createdAt,
    })
    .from(caseContacts)
    .innerJoin(contacts, eq(caseContacts.contactId, contacts.id))
    .where(eq(caseContacts.caseId, caseId));

  // Sort: primary claimant first, then other primaries, then everything else
  // alphabetically by last name.
  return rows.sort((a, b) => {
    const aWeight =
      (a.isPrimary ? 0 : 10) + (a.relationship === "claimant" ? 0 : 1);
    const bWeight =
      (b.isPrimary ? 0 : 10) + (b.relationship === "claimant" ? 0 : 1);
    if (aWeight !== bWeight) return aWeight - bWeight;
    return a.lastName.localeCompare(b.lastName);
  });
}

/**
 * Lightweight contact search for the "+ Add Client" dialog. Returns up to 20
 * active contacts matching the query, scoped to the caller's org.
 */
export async function searchContactsForCase(query: string) {
  const session = await requireSession();
  const q = query.trim();

  const whereClauses = [
    eq(contacts.organizationId, session.organizationId),
    isNull(contacts.deletedAt),
  ];
  if (q.length > 0) {
    const searchTerm = `%${q}%`;
    whereClauses.push(
      or(
        ilike(contacts.firstName, searchTerm),
        ilike(contacts.lastName, searchTerm),
        ilike(contacts.email, searchTerm),
      )!,
    );
  }

  return db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      contactType: contacts.contactType,
    })
    .from(contacts)
    .where(and(...whereClauses))
    .orderBy(asc(contacts.lastName), asc(contacts.firstName))
    .limit(20);
}

/**
 * Attach an existing contact to a case with a given relationship, optionally
 * marking them as the primary party. If `isPrimary` is true, every other
 * `case_contacts` row for this case has `is_primary` cleared first so the
 * invariant "at most one primary" holds.
 */
export async function addContactToCase(
  caseId: string,
  contactId: string,
  relationship: CaseContactRelationship,
  isPrimary: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession();

  // Authorize: the case and contact must both belong to the caller's org.
  const [caseRow] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, session.organizationId),
        isNull(cases.deletedAt),
      ),
    )
    .limit(1);

  if (!caseRow) return { ok: false, error: "Case not found." };

  const [contactRow] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.organizationId, session.organizationId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);

  if (!contactRow) return { ok: false, error: "Contact not found." };

  // Reject duplicate (caseId, contactId, relationship) — unique index would
  // also catch this but we want a friendlier error than a raw DB exception.
  const [existing] = await db
    .select({ id: caseContacts.id })
    .from(caseContacts)
    .where(
      and(
        eq(caseContacts.caseId, caseId),
        eq(caseContacts.contactId, contactId),
        eq(caseContacts.relationship, relationship),
      ),
    )
    .limit(1);

  if (existing) {
    return {
      ok: false,
      error: "This contact is already attached with that relationship.",
    };
  }

  if (isPrimary) {
    // Clear any other primary for this case before inserting.
    await db
      .update(caseContacts)
      .set({ isPrimary: false })
      .where(
        and(
          eq(caseContacts.caseId, caseId),
          eq(caseContacts.isPrimary, true),
        ),
      );
  }

  await db.insert(caseContacts).values({
    caseId,
    contactId,
    relationship,
    isPrimary,
  });

  // HIPAA: contact attachment is a PHI modification event.
  await logPhiModification({
    organizationId: session.organizationId,
    userId: session.id,
    entityType: "case",
    entityId: caseId,
    operation: "update",
    caseId,
    changes: {
      after: { addedContactId: contactId, relationship, isPrimary },
    },
    metadata: { action: "case_contact_added" },
  });

  logger.info("Contact attached to case", {
    caseId,
    contactId,
    relationship,
    isPrimary,
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath(`/cases/${caseId}/overview`);
  return { ok: true };
}

/**
 * Update the referral source for a case. `source` is free-text (e.g. "Google",
 * "Referral from John Doe"), `contactId` optionally links to a contact row.
 * Pass null/undefined to clear either field.
 */
export async function editCaseReferral(
  caseId: string,
  source: string | null,
  contactId?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession();

  const [caseRow] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, session.organizationId),
        isNull(cases.deletedAt),
      ),
    )
    .limit(1);

  if (!caseRow) return { ok: false, error: "Case not found." };

  if (contactId) {
    // Validate the contact belongs to the same org before linking.
    const [contactRow] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, contactId),
          eq(contacts.organizationId, session.organizationId),
          isNull(contacts.deletedAt),
        ),
      )
      .limit(1);
    if (!contactRow) return { ok: false, error: "Referral contact not found." };
  }

  await db
    .update(cases)
    .set({
      referralSource: source && source.trim().length > 0 ? source.trim() : null,
      referralContactId: contactId ?? null,
      updatedAt: new Date(),
      updatedBy: session.id,
    })
    .where(eq(cases.id, caseId));

  logger.info("Case referral updated", {
    caseId,
    hasSource: Boolean(source),
    hasContact: Boolean(contactId),
  });

  revalidatePath(`/cases/${caseId}`);
  revalidatePath(`/cases/${caseId}/overview`);
  revalidatePath(`/cases/${caseId}/fields`);
  return { ok: true };
}
