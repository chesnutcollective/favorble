"use server";

import { db } from "@/db/drizzle";
import {
  leads,
  cases,
  contacts,
  caseContacts,
  caseStageTransitions,
  customFieldDefinitions,
  customFieldValues,
  leadSignatureRequests,
  users,
  auditLog,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { executeStageWorkflows } from "@/lib/workflow-engine";
import { eq, and, isNull, desc, count, asc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";
import {
  DEFAULT_PIPELINE_STAGE_ID,
  getStageById,
  PIPELINE_STAGES,
} from "@/lib/services/lead-pipeline-config";
import {
  findDuplicateLeads,
  hasHighConfidenceDuplicate,
  type DuplicateMatch,
} from "@/lib/services/lead-dedup";
import {
  LEAD_STATUS_GROUPS,
  ALL_LEAD_STATUSES,
  LEAD_STATUS_CATEGORY_COLORS,
  getLeadStatusCategory,
  type LeadStatus,
  type LeadStatusCategory,
} from "@/lib/leads/status";

// Types are imported above for internal use only. Consumers must import
// LeadStatus / LeadStatusCategory / LEAD_STATUS_GROUPS / etc. directly
// from "@/lib/leads/status" because "use server" files can't re-export
// non-async values (Next.js 16 bundler enforcement).

/**
 * Get leads grouped by status for the kanban board.
 */
export async function getLeads(statusFilter?: string) {
  const session = await requireSession();
  const conditions = [
    eq(leads.organizationId, session.organizationId),
    isNull(leads.deletedAt),
  ];

  if (statusFilter) {
    conditions.push(eq(leads.status, statusFilter as LeadStatus));
  }

  const result = await db
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.createdAt));

  return result;
}

/**
 * Get a single lead by ID.
 */
export async function getLeadById(id: string) {
  const session = await requireSession();
  const [lead] = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.id, id),
        eq(leads.organizationId, session.organizationId),
        isNull(leads.deletedAt),
      ),
    )
    .limit(1);
  return lead ?? null;
}

/**
 * Round-robin assignment: find the intake-team user with fewest active leads.
 */
async function findRoundRobinAssignee(
  organizationId: string,
): Promise<string | null> {
  try {
    const intakeUsers = await db
      .select({
        id: users.id,
        leadCount: sql<number>`coalesce((
					select count(*) from leads
					where leads.assigned_to_id = ${users.id}
						and leads.status not in (
							'converted', 'converted_full_rep', 'converted_consult_only',
							'declined', 'declined_age', 'declined_capacity',
							'declined_outside_state', 'declined_already_repd', 'declined_other',
							'unresponsive', 'disqualified', 'referred_out',
							'not_interested', 'do_not_contact', 'wrong_number'
						)
						and leads.deleted_at is null
				), 0)`.as("lead_count"),
      })
      .from(users)
      .where(
        and(
          eq(users.organizationId, organizationId),
          eq(users.isActive, true),
          eq(users.team, "intake"),
        ),
      )
      .orderBy(sql`lead_count asc`)
      .limit(1);

    return intakeUsers.length > 0 ? intakeUsers[0].id : null;
  } catch {
    return null;
  }
}

/**
 * Result from createLead. Either the lead was created, or we detected
 * a high-confidence duplicate and need user confirmation.
 */
export type CreateLeadResult =
  | {
      status: "created";
      lead: typeof leads.$inferSelect;
      duplicatesAcknowledged: boolean;
    }
  | {
      status: "duplicate_suspected";
      duplicates: DuplicateMatch[];
    };

/**
 * Create a new lead with round-robin assignment and duplicate detection.
 * Pass `forceCreate: true` to bypass the duplicate check after the user
 * has acknowledged the warning.
 */
export async function createLead(data: {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  source?: string;
  notes?: string;
  dob?: string;
  city?: string;
  forceCreate?: boolean;
  /**
   * Preferred intake language ("en" or "es"). Stored in `intakeData.language`
   * so downstream follow-ups can be delivered in the claimant's language.
   */
  language?: "en" | "es";
}): Promise<CreateLeadResult> {
  const session = await requireSession();

  // Check for duplicates before creating.
  const duplicates = await findDuplicateLeads({
    email: data.email,
    phone: data.phone,
    firstName: data.firstName,
    lastName: data.lastName,
    dob: data.dob,
    city: data.city,
  });

  if (duplicates.length > 0) {
    // Audit any duplicate detection run
    try {
      await db.insert(auditLog).values({
        organizationId: session.organizationId,
        userId: session.id,
        entityType: "lead",
        entityId: duplicates[0].leadId,
        action: "duplicate_check",
        metadata: {
          candidateCount: duplicates.length,
          topScore: duplicates[0].matchScore,
          topReason: duplicates[0].matchReason,
          inputEmail: data.email ?? null,
          inputPhone: data.phone ?? null,
          inputName: `${data.firstName} ${data.lastName}`,
          acknowledged: Boolean(data.forceCreate),
        },
      });
    } catch (err) {
      logger.warn("Failed to write duplicate_check audit log", { err });
    }
  }

  if (
    !data.forceCreate &&
    duplicates.length > 0 &&
    hasHighConfidenceDuplicate(duplicates)
  ) {
    return { status: "duplicate_suspected", duplicates };
  }

  // Auto-assign via round-robin
  const assignedToId = await findRoundRobinAssignee(session.organizationId);

  const defaultStage = getStageById(DEFAULT_PIPELINE_STAGE_ID);

  const intakeData: Record<string, unknown> = {};
  if (data.language) intakeData.language = data.language;

  const [lead] = await db
    .insert(leads)
    .values({
      organizationId: session.organizationId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      source: data.source ?? "website",
      notes: data.notes,
      assignedToId,
      createdBy: session.id,
      pipelineStage: defaultStage?.id ?? DEFAULT_PIPELINE_STAGE_ID,
      pipelineStageGroup: defaultStage?.group ?? "NEW_LEADS",
      pipelineStageOrder: defaultStage?.order ?? 1,
      intakeData,
      metadata:
        duplicates.length > 0
          ? {
              duplicate_warning_acknowledged: Boolean(data.forceCreate),
              duplicate_match_count: duplicates.length,
              duplicate_top_score: duplicates[0].matchScore,
            }
          : {},
    })
    .returning();

  logger.info("Lead created", {
    leadId: lead.id,
    assignedToId,
    duplicatesAcknowledged: Boolean(data.forceCreate),
  });
  revalidatePath("/leads");
  return {
    status: "created",
    lead,
    duplicatesAcknowledged: Boolean(data.forceCreate),
  };
}

/**
 * Update a lead's status (for kanban drag-and-drop).
 */
export async function updateLeadStatus(id: string, status: string) {
  if (!(ALL_LEAD_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Unknown lead status: ${status}`);
  }
  await db
    .update(leads)
    .set({
      status: status as LeadStatus,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, id));
  revalidatePath("/leads");
}

/**
 * Get intake form field definitions (fields with showInIntakeForm=true).
 */
export async function getIntakeFormFields() {
  const session = await requireSession();

  return db
    .select()
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.organizationId, session.organizationId),
        eq(customFieldDefinitions.isActive, true),
        eq(customFieldDefinitions.showInIntakeForm, true),
      ),
    )
    .orderBy(
      asc(customFieldDefinitions.intakeFormOrder),
      asc(customFieldDefinitions.displayOrder),
    );
}

/**
 * Save intake form answers to lead.intakeData.
 */
export async function saveIntakeData(
  leadId: string,
  intakeData: Record<string, unknown>,
) {
  const session = await requireSession();

  // Merge with existing intake data
  const [lead] = await db
    .select({ intakeData: leads.intakeData })
    .from(leads)
    .where(
      and(
        eq(leads.id, leadId),
        eq(leads.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  const existingData = (lead?.intakeData as Record<string, unknown>) ?? {};
  const merged = { ...existingData, ...intakeData };

  await db
    .update(leads)
    .set({
      intakeData: merged,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));

  logger.info("Intake data saved", {
    leadId,
    fieldCount: Object.keys(intakeData).length,
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

/**
 * Convert a lead to a case, auto-populating custom field values from intakeData.
 */
export async function convertLeadToCase(
  leadId: string,
  data: {
    initialStageId: string;
    ssaOffice?: string;
  },
) {
  const session = await requireSession();

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));

  if (!lead) throw new Error("Lead not found");

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

  // Create contact from lead data
  const [contact] = await db
    .insert(contacts)
    .values({
      organizationId: session.organizationId,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
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
      leadId,
      currentStageId: data.initialStageId,
      ssaOffice: data.ssaOffice,
      createdBy: session.id,
      updatedBy: session.id,
    })
    .returning();

  // Link contact
  await db.insert(caseContacts).values({
    caseId: newCase.id,
    contactId: contact.id,
    relationship: "claimant",
    isPrimary: true,
  });

  // Auto-populate custom field values from intake data
  const intakeData = (lead.intakeData as Record<string, unknown>) ?? {};
  if (Object.keys(intakeData).length > 0) {
    try {
      // Get intake form field definitions to map slug -> id and determine value columns
      const intakeFields = await db
        .select()
        .from(customFieldDefinitions)
        .where(
          and(
            eq(customFieldDefinitions.organizationId, session.organizationId),
            eq(customFieldDefinitions.isActive, true),
            eq(customFieldDefinitions.showInIntakeForm, true),
          ),
        );

      const fieldsBySlug = new Map(intakeFields.map((f) => [f.slug, f]));

      for (const [slug, value] of Object.entries(intakeData)) {
        const fieldDef = fieldsBySlug.get(slug);
        if (!fieldDef || value === undefined || value === null || value === "")
          continue;

        const valueData: {
          caseId: string;
          fieldDefinitionId: string;
          textValue?: string | null;
          numberValue?: number | null;
          dateValue?: Date | null;
          booleanValue?: boolean | null;
          jsonValue?: unknown;
          updatedBy: string;
        } = {
          caseId: newCase.id,
          fieldDefinitionId: fieldDef.id,
          updatedBy: session.id,
        };

        // Map value to the correct column based on field type
        switch (fieldDef.fieldType) {
          case "number":
          case "currency":
            valueData.numberValue =
              typeof value === "number" ? value : Number(value);
            break;
          case "date":
            valueData.dateValue = new Date(String(value));
            break;
          case "boolean":
            valueData.booleanValue = Boolean(value);
            break;
          case "multi_select":
            valueData.jsonValue = value;
            break;
          default:
            // text, textarea, select, phone, email, url, ssn, calculated
            valueData.textValue = String(value);
            break;
        }

        await db.insert(customFieldValues).values(valueData);
      }

      logger.info("Intake data mapped to custom fields", {
        caseId: newCase.id,
        fieldsPopulated: Object.keys(intakeData).length,
      });
    } catch (error) {
      // Don't fail the conversion if field mapping has issues
      logger.error("Error mapping intake data to custom fields", {
        error,
        caseId: newCase.id,
      });
    }
  }

  // Update lead
  await db
    .update(leads)
    .set({
      status: "converted",
      convertedToCaseId: newCase.id,
      convertedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));

  // Log transition
  await db.insert(caseStageTransitions).values({
    caseId: newCase.id,
    toStageId: data.initialStageId,
    transitionedBy: session.id,
  });

  // Execute workflows
  await executeStageWorkflows(
    newCase.id,
    data.initialStageId,
    session.id,
    session.organizationId,
  );

  logger.info("Lead converted to case", {
    leadId,
    caseId: newCase.id,
    caseNumber,
  });

  revalidatePath("/leads");
  revalidatePath("/cases");
  return newCase;
}

/**
 * Get lead counts by status for the pipeline header. Returns every status
 * defined in `ALL_LEAD_STATUSES`, padding with zero-count entries for
 * statuses that currently have no leads. This keeps the kanban stable even
 * when pipelines are sparsely populated.
 */
export async function getLeadCountsByStatus(): Promise<
  { status: LeadStatus; count: number }[]
> {
  const session = await requireSession();
  const result = await db
    .select({
      status: leads.status,
      count: count(),
    })
    .from(leads)
    .where(
      and(
        eq(leads.organizationId, session.organizationId),
        isNull(leads.deletedAt),
      ),
    )
    .groupBy(leads.status);

  const countsByStatus = new Map<string, number>(
    result.map((r) => [r.status, r.count]),
  );

  return ALL_LEAD_STATUSES.map((status) => ({
    status,
    count: countsByStatus.get(status) ?? 0,
  }));
}

// ─── eSignature placeholder ────────────────────────────────────────────

/**
 * Send a contract (create a signature request record) for a lead.
 */
export async function sendLeadContract(
  leadId: string,
  data: {
    signerEmail: string;
    signerName: string;
    contractType?: string;
  },
) {
  const session = await requireSession();

  const [sigReq] = await db
    .insert(leadSignatureRequests)
    .values({
      leadId,
      signerEmail: data.signerEmail,
      signerName: data.signerName,
      contractType: data.contractType ?? "retainer",
      status: "sent",
      sentAt: new Date(),
      createdBy: session.id,
    })
    .returning();

  // Also advance lead status to contract_sent if it's earlier in pipeline
  const [lead] = await db
    .select({ status: leads.status })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);

  const earlyStatuses: LeadStatus[] = [
    ...LEAD_STATUS_GROUPS.initial,
    ...LEAD_STATUS_GROUPS.qualifying,
    ...LEAD_STATUS_GROUPS.intake,
    ...LEAD_STATUS_GROUPS.conflict,
    "contract_drafting",
  ];
  if (lead && earlyStatuses.includes(lead.status)) {
    await db
      .update(leads)
      .set({ status: "contract_sent", updatedAt: new Date() })
      .where(eq(leads.id, leadId));
  }

  logger.info("Lead contract sent", { leadId, signatureRequestId: sigReq.id });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return sigReq;
}

/**
 * Get signature requests for a lead.
 */
export async function getLeadSignatureRequests(leadId: string) {
  await requireSession();

  return db
    .select()
    .from(leadSignatureRequests)
    .where(eq(leadSignatureRequests.leadId, leadId))
    .orderBy(desc(leadSignatureRequests.createdAt));
}

/**
 * Update a lead signature request status (webhook or manual).
 */
export async function updateLeadSignatureStatus(
  signatureRequestId: string,
  status: "pending" | "sent" | "viewed" | "signed" | "declined" | "expired",
) {
  const session = await requireSession();

  const updateData: Record<string, unknown> = { status };
  if (status === "viewed") updateData.viewedAt = new Date();
  if (status === "signed") updateData.signedAt = new Date();

  const [updated] = await db
    .update(leadSignatureRequests)
    .set(updateData)
    .where(eq(leadSignatureRequests.id, signatureRequestId))
    .returning();

  // If signed, advance lead to contract_signed
  if (status === "signed" && updated) {
    await db
      .update(leads)
      .set({ status: "contract_signed", updatedAt: new Date() })
      .where(eq(leads.id, updated.leadId));
  }

  logger.info("Lead signature status updated", { signatureRequestId, status });
  revalidatePath("/leads");
  return updated;
}

/**
 * Update a lead's editable fields.
 */
export async function updateLead(
  id: string,
  data: {
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    source?: string | null;
    notes?: string | null;
  },
) {
  const session = await requireSession();

  await db
    .update(leads)
    .set({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email ?? null,
      phone: data.phone ?? null,
      source: data.source ?? null,
      notes: data.notes ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(leads.id, id),
        eq(leads.organizationId, session.organizationId),
      ),
    );

  logger.info("Lead updated", { leadId: id });
  revalidatePath(`/leads/${id}`);
  revalidatePath("/leads");
}

/**
 * Update a lead's pipeline stage (30+ stage pipeline).
 * Also syncs the legacy status enum column when there's a direct mapping.
 */
export async function updateLeadStage(leadId: string, stageId: string) {
  const session = await requireSession();

  const stage = getStageById(stageId);
  if (!stage) {
    throw new Error(`Unknown pipeline stage: ${stageId}`);
  }

  // Map rich pipeline stages back to the legacy enum where possible so
  // existing status filters keep working.
  const legacyStatusMap: Record<string, string> = {
    new_inquiry: "new",
    web_form_submitted: "new",
    phone_call_received: "new",
    walk_in: "new",
    referral_received: "new",
    marketing_lead: "new",
    initial_qualifying: "contacted",
    call_attempted_1: "contacted",
    call_attempted_2: "contacted",
    call_attempted_3: "contacted",
    voicemail_left: "contacted",
    no_answer: "contacted",
    wrong_number: "unresponsive",
    intake_scheduled: "intake_scheduled",
    intake_rescheduled: "intake_scheduled",
    intake_in_progress: "intake_in_progress",
    intake_complete: "intake_in_progress",
    awaiting_documents: "intake_in_progress",
    documents_received: "intake_in_progress",
    conflict_check_pending: "intake_in_progress",
    conflict_check_cleared: "intake_in_progress",
    contract_sent: "contract_sent",
    contract_signed: "contract_signed",
    retainer_paid: "contract_signed",
    declined_by_firm: "declined",
    declined_by_client: "declined",
    could_not_reach: "unresponsive",
    converting_to_case: "contract_signed",
    converted: "converted",
    disqualified: "disqualified",
    duplicate: "disqualified",
    spanish_routed: "disqualified",
    out_of_state: "disqualified",
  };

  const legacyStatus = legacyStatusMap[stageId];

  await db
    .update(leads)
    .set({
      pipelineStage: stage.id,
      pipelineStageGroup: stage.group,
      pipelineStageOrder: stage.order,
      ...(legacyStatus
        ? {
            status: legacyStatus as LeadStatus,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(leads.id, leadId),
        eq(leads.organizationId, session.organizationId),
      ),
    );

  try {
    await db.insert(auditLog).values({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "lead",
      entityId: leadId,
      action: "pipeline_stage_updated",
      metadata: { stageId, group: stage.group },
    });
  } catch (err) {
    logger.warn("Failed to write pipeline_stage_updated audit log", { err });
  }

  logger.info("Lead pipeline stage updated", { leadId, stageId });
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
}

/**
 * Return all active leads grouped by their pipeline stage. Every known stage
 * (from the pipeline config) is returned, even if empty.
 */
export async function getLeadsByStage(): Promise<Map<string, typeof leads.$inferSelect[]>> {
  const session = await requireSession();

  const rows = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.organizationId, session.organizationId),
        isNull(leads.deletedAt),
      ),
    )
    .orderBy(desc(leads.createdAt));

  const map = new Map<string, typeof leads.$inferSelect[]>();
  for (const stage of PIPELINE_STAGES) {
    map.set(stage.id, []);
  }
  for (const row of rows) {
    const stageId = row.pipelineStage ?? DEFAULT_PIPELINE_STAGE_ID;
    if (!map.has(stageId)) map.set(stageId, []);
    map.get(stageId)?.push(row);
  }
  return map;
}

/**
 * Server action wrapper around findDuplicateLeads so the client can call it
 * directly from the "Find Duplicates" dialog.
 */
export async function searchDuplicateLeads(input: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  city?: string;
}): Promise<DuplicateMatch[]> {
  return findDuplicateLeads(input);
}

/**
 * Soft-delete a lead.
 */
export async function deleteLead(id: string) {
  const session = await requireSession();

  await db
    .update(leads)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(leads.id, id),
        eq(leads.organizationId, session.organizationId),
      ),
    );

  logger.info("Lead deleted", { leadId: id });
  revalidatePath("/leads");
}
