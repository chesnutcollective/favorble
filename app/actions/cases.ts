"use server";

import { db } from "@/db/drizzle";
import {
  cases,
  caseStages,
  caseStageGroups,
  caseAssignments,
  caseStageTransitions,
  caseSavedViews,
  communications,
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
import { logPhiAccess, shouldAudit } from "@/lib/services/hipaa-audit";

export type CaseFilters = {
  search?: string;
  status?: string;
  stageId?: string;
  stageGroupId?: string;
  assignedToId?: string;
  team?: string;
  practiceArea?: string;
  language?: string;
  unreadOnly?: boolean;
  urgency?: string;
};

export type Pagination = {
  page: number;
  pageSize: number;
};

// Module-level caches for feature detection. The messaging agent building
// the communications schema in parallel may or may not have added
// `urgency` + `read_at` columns, and the contacts agent may or may not have
// added `preferred_locale`. We probe once per process and remember the result
// so the case list query degrades gracefully.
let _contactsHasLocale: boolean | null = null;
let _commsHasReadAt: boolean | null = null;
let _commsHasUrgency: boolean | null = null;

async function columnExists(
  tableName: string,
  columnName: string,
): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
      LIMIT 1
    `);
    // drizzle-orm returns { rows: [...] } for db.execute on pg
    const rows = (result as unknown as { rows?: unknown[] }).rows ?? [];
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function contactsHasLocale(): Promise<boolean> {
  if (_contactsHasLocale !== null) return _contactsHasLocale;
  _contactsHasLocale = await columnExists("contacts", "preferred_locale");
  return _contactsHasLocale;
}

async function commsHasReadAt(): Promise<boolean> {
  if (_commsHasReadAt !== null) return _commsHasReadAt;
  _commsHasReadAt = await columnExists("communications", "read_at");
  return _commsHasReadAt;
}

async function commsHasUrgency(): Promise<boolean> {
  if (_commsHasUrgency !== null) return _commsHasUrgency;
  _commsHasUrgency = await columnExists("communications", "urgency");
  return _commsHasUrgency;
}

/**
 * Get paginated cases with filters.
 */
export async function getCases(
  filters: CaseFilters = {},
  pagination: Pagination = { page: 1, pageSize: 50 },
) {
  const session = await requireSession();
  const conditions: Array<ReturnType<typeof sql> | ReturnType<typeof eq>> = [
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

  if (filters.practiceArea) {
    conditions.push(eq(cases.applicationTypePrimary, filters.practiceArea));
  }

  if (filters.team) {
    // Match cases whose current stage is owned by this team. Using EXISTS keeps
    // both the page + count queries consistent without requiring caseStages in
    // the count query's FROM list.
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${caseStages}
        WHERE ${caseStages.id} = ${cases.currentStageId}
          AND ${caseStages.owningTeam} = ${filters.team}
      )`,
    );
  }

  // assignedToId: restrict to cases that have an active assignment for the user.
  if (filters.assignedToId) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${caseAssignments}
        WHERE ${caseAssignments.caseId} = ${cases.id}
          AND ${caseAssignments.userId} = ${filters.assignedToId}
          AND ${caseAssignments.unassignedAt} IS NULL
      )`,
    );
  }

  // Language filter — only applies if contacts.preferred_locale column exists.
  if (filters.language && (await contactsHasLocale())) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${caseContacts}
        INNER JOIN ${contacts} ON ${contacts.id} = ${caseContacts.contactId}
        WHERE ${caseContacts.caseId} = ${cases.id}
          AND ${caseContacts.isPrimary} = true
          AND ${sql.raw("contacts.preferred_locale")} = ${filters.language}
      )`,
    );
  }

  // Unread-messages toggle — only applies if communications.read_at exists.
  if (filters.unreadOnly && (await commsHasReadAt())) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${communications}
        WHERE ${communications.caseId} = ${cases.id}
          AND ${communications.direction} = 'inbound'
          AND ${sql.raw("communications.read_at")} IS NULL
      )`,
    );
  }

  // Message urgency — only applies if communications.urgency exists.
  if (filters.urgency && (await commsHasUrgency())) {
    conditions.push(
      sql`(
        SELECT ${sql.raw("c2.urgency")}
        FROM ${communications} c2
        WHERE c2.case_id = ${cases.id}
        ORDER BY c2.created_at DESC
        LIMIT 1
      ) = ${filters.urgency}`,
    );
  }

  if (filters.search) {
    const searchTerm = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(cases.caseNumber, searchTerm),
        ilike(cases.ssaClaimNumber, searchTerm),
        // Match claimant name or phone via primary contact.
        sql`EXISTS (
          SELECT 1 FROM ${caseContacts}
          INNER JOIN ${contacts} ON ${contacts.id} = ${caseContacts.contactId}
          WHERE ${caseContacts.caseId} = ${cases.id}
            AND ${caseContacts.isPrimary} = true
            AND (
              ${contacts.firstName} ILIKE ${searchTerm}
              OR ${contacts.lastName} ILIKE ${searchTerm}
              OR ${contacts.phone} ILIKE ${searchTerm}
              OR (${contacts.firstName} || ' ' || ${contacts.lastName}) ILIKE ${searchTerm}
            )
        )`,
      )!,
    );
  }

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
      .orderBy(desc(cases.updatedAt))
      .limit(pagination.pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(cases)
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
 */
export async function changeCaseStage(data: {
  caseId: string;
  newStageId: string;
  notes?: string;
}) {
  const session = await requireSession();

  const [currentCase] = await db
    .select({ currentStageId: cases.currentStageId })
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

  revalidatePath(`/cases/${data.caseId}`);
  revalidatePath("/cases");
  revalidatePath("/queue");
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

// ---------------------------------------------------------------------------
// Saved views (case list filter snapshots)
// ---------------------------------------------------------------------------

export type SavedViewFilters = Record<string, unknown>;
export type SavedViewSort = { sortBy?: string; sortDir?: "asc" | "desc" };

export type SavedView = {
  id: string;
  name: string;
  filters: SavedViewFilters;
  sort: SavedViewSort;
  isShared: boolean;
  isOwner: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * List saved views visible to the current user:
 *   - views they own
 *   - shared views inside their organization
 */
export async function listSavedViews(): Promise<SavedView[]> {
  const session = await requireSession();
  try {
    const rows = await db
      .select({
        id: caseSavedViews.id,
        userId: caseSavedViews.userId,
        name: caseSavedViews.name,
        filters: caseSavedViews.filters,
        sort: caseSavedViews.sort,
        isShared: caseSavedViews.isShared,
        createdAt: caseSavedViews.createdAt,
        updatedAt: caseSavedViews.updatedAt,
      })
      .from(caseSavedViews)
      .where(
        and(
          eq(caseSavedViews.organizationId, session.organizationId),
          or(
            eq(caseSavedViews.userId, session.id),
            eq(caseSavedViews.isShared, true),
          )!,
        ),
      )
      .orderBy(asc(caseSavedViews.name));

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      filters: (r.filters ?? {}) as SavedViewFilters,
      sort: (r.sort ?? {}) as SavedViewSort,
      isShared: r.isShared,
      isOwner: r.userId === session.id,
      userId: r.userId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  } catch (err) {
    logger.warn("listSavedViews failed", { error: err });
    return [];
  }
}

export async function saveView(input: {
  name: string;
  filters: SavedViewFilters;
  sort?: SavedViewSort;
  isShared?: boolean;
}) {
  const session = await requireSession();
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");

  const [row] = await db
    .insert(caseSavedViews)
    .values({
      organizationId: session.organizationId,
      userId: session.id,
      name,
      filters: input.filters ?? {},
      sort: input.sort ?? {},
      isShared: input.isShared ?? false,
    })
    .returning();

  revalidatePath("/cases");
  return {
    id: row.id,
    name: row.name,
    filters: (row.filters ?? {}) as SavedViewFilters,
    sort: (row.sort ?? {}) as SavedViewSort,
    isShared: row.isShared,
  };
}

export async function deleteSavedView(id: string) {
  const session = await requireSession();
  // Only the owner can delete their view; scope to their org for safety.
  await db
    .delete(caseSavedViews)
    .where(
      and(
        eq(caseSavedViews.id, id),
        eq(caseSavedViews.organizationId, session.organizationId),
        eq(caseSavedViews.userId, session.id),
      ),
    );
  revalidatePath("/cases");
}
