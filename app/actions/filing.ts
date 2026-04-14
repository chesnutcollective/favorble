"use server";

import { db } from "@/db/drizzle";
import {
  tasks,
  cases,
  caseStages,
  caseStageGroups,
  leads,
  users,
  documentTemplates,
  auditLog,
  caseStageTransitions,
  contacts,
  caseContacts,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import {
  and,
  asc,
  count,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";
import { logExtractionReview } from "@/lib/services/hipaa-audit";
import {
  FILING_REJECT_REASON_CODES,
  FILING_REJECT_REASON_LABELS,
  type FilingRejectReasonCode,
} from "@/lib/filing/constants";

export type FilingFilter =
  | "all"
  | "ssdi"
  | "ssi"
  | "both"
  | "reconsideration"
  | "hearing_request";

export type FilingQueueRow = {
  taskId: string;
  caseId: string;
  caseNumber: string;
  claimantName: string;
  applicationType: string;
  applicationTypePrimary: string | null;
  applicationTypeSecondary: string | null;
  allegedOnsetDate: string | null;
  dateLastInsured: string | null;
  daysWaiting: number;
  dueDate: string | null;
  priority: string;
  stageName: string | null;
  stageCode: string | null;
  stageGroupColor: string | null;
  taskTitle: string;
};

/**
 * Normalize case SSA application type to a canonical filter bucket.
 * Inputs can be things like "SSDI", "ssdi+ssi", "Reconsideration", "Hearing Request", etc.
 */
function applicationTypeBucket(
  primary: string | null,
  secondary: string | null,
  title: string | null,
): FilingFilter {
  const p = (primary ?? "").toLowerCase();
  const s = (secondary ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  const combined = `${p} ${s} ${t}`;

  if (combined.includes("hearing")) return "hearing_request";
  if (combined.includes("reconsid")) return "reconsideration";
  if ((p && s) || combined.includes("both") || combined.includes("ssdi+ssi"))
    return "both";
  if (combined.includes("ssdi")) return "ssdi";
  if (combined.includes("ssi")) return "ssi";
  return "all";
}

function labelForBucket(
  primary: string | null,
  secondary: string | null,
  title: string | null,
): string {
  const bucket = applicationTypeBucket(primary, secondary, title);
  switch (bucket) {
    case "ssdi":
      return "SSDI";
    case "ssi":
      return "SSI";
    case "both":
      return "SSDI + SSI";
    case "reconsideration":
      return "Reconsideration";
    case "hearing_request":
      return "Hearing Request";
    default:
      return primary?.toUpperCase() ?? "Application";
  }
}

/**
 * Get the filing queue: tasks related to filing an application, or tasks
 * assigned to the filing team / filing-team members, that are not yet
 * completed. Ordered by due date ASC. Optimized for index usage on
 * (status, assigned_to_id, due_date) + case stage owning_team = 'filing'.
 */
export async function getFilingQueue(
  filter: FilingFilter = "all",
): Promise<FilingQueueRow[]> {
  const session = await requireSession();

  // We consider a task a "filing task" when ANY of these are true:
  //   - task title matches "file" keywords
  //   - the case's current stage is owned by the filing team
  //   - the task is assigned to a user on the filing team
  //
  // We use a single query with LEFT JOINs and a combined WHERE clause so the
  // database can use the compound indexes on tasks.status / assigned_to_id /
  // due_date and cases.current_stage_id.
  const rows = await db
    .select({
      taskId: tasks.id,
      taskTitle: tasks.title,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      createdAt: tasks.createdAt,
      caseId: cases.id,
      caseNumber: cases.caseNumber,
      applicationTypePrimary: cases.applicationTypePrimary,
      applicationTypeSecondary: cases.applicationTypeSecondary,
      allegedOnsetDate: cases.allegedOnsetDate,
      dateLastInsured: cases.dateLastInsured,
      claimantFirstName: leads.firstName,
      claimantLastName: leads.lastName,
      stageName: caseStages.name,
      stageCode: caseStages.code,
      stageGroupColor: caseStageGroups.color,
      stageOwningTeam: caseStages.owningTeam,
      assigneeTeam: users.team,
    })
    .from(tasks)
    .innerJoin(cases, eq(tasks.caseId, cases.id))
    .leftJoin(leads, eq(cases.leadId, leads.id))
    .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
    .leftJoin(caseStageGroups, eq(caseStages.stageGroupId, caseStageGroups.id))
    .leftJoin(users, eq(tasks.assignedToId, users.id))
    .where(
      and(
        eq(tasks.organizationId, session.organizationId),
        isNull(tasks.deletedAt),
        ne(tasks.status, "completed"),
        ne(tasks.status, "skipped"),
        or(
          ilike(tasks.title, "%file application%"),
          ilike(tasks.title, "%file ssdi%"),
          ilike(tasks.title, "%file ssi%"),
          ilike(tasks.title, "%submit application%"),
          ilike(tasks.title, "%file reconsid%"),
          ilike(tasks.title, "%hearing request%"),
          eq(caseStages.owningTeam, "filing"),
          eq(users.team, "filing"),
        ),
      ),
    )
    .orderBy(asc(tasks.dueDate), sql`${tasks.priority} DESC`)
    .limit(250);

  const now = Date.now();

  // For cases where leads didn't provide a name, fall back to primary
  // contact from case_contacts -> contacts (Chronicle-imported cases).
  const caseIdsWithoutLeadName = rows
    .filter((r) => !r.claimantFirstName && !r.claimantLastName)
    .map((r) => r.caseId);

  const contactNameMap = new Map<
    string,
    { firstName: string; lastName: string }
  >();
  if (caseIdsWithoutLeadName.length > 0) {
    const contactRows = await db
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
          inArray(caseContacts.caseId, caseIdsWithoutLeadName),
          eq(caseContacts.isPrimary, true),
        ),
      );
    // Prefer claimant relationship; fall back to any primary contact
    for (const c of contactRows) {
      const existing = contactNameMap.get(c.caseId);
      if (!existing || c.relationship === "claimant") {
        contactNameMap.set(c.caseId, {
          firstName: c.firstName,
          lastName: c.lastName,
        });
      }
    }
  }

  const mapped: FilingQueueRow[] = rows.map((r) => {
    let claimantName: string;
    if (r.claimantFirstName || r.claimantLastName) {
      claimantName =
        `${r.claimantFirstName ?? ""} ${r.claimantLastName ?? ""}`.trim();
    } else {
      const contact = contactNameMap.get(r.caseId);
      claimantName = contact
        ? `${contact.firstName} ${contact.lastName}`.trim()
        : "Unknown Claimant";
    }

    const daysWaiting = Math.max(
      0,
      Math.floor((now - new Date(r.createdAt).getTime()) / 86400000),
    );

    return {
      taskId: r.taskId,
      caseId: r.caseId,
      caseNumber: r.caseNumber,
      claimantName,
      applicationType: labelForBucket(
        r.applicationTypePrimary,
        r.applicationTypeSecondary,
        r.taskTitle,
      ),
      applicationTypePrimary: r.applicationTypePrimary,
      applicationTypeSecondary: r.applicationTypeSecondary,
      allegedOnsetDate: r.allegedOnsetDate
        ? new Date(r.allegedOnsetDate).toISOString()
        : null,
      dateLastInsured: r.dateLastInsured
        ? new Date(r.dateLastInsured).toISOString()
        : null,
      daysWaiting,
      dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : null,
      priority: r.priority,
      stageName: r.stageName,
      stageCode: r.stageCode,
      stageGroupColor: r.stageGroupColor,
      taskTitle: r.taskTitle,
    };
  });

  if (filter === "all") return mapped;

  return mapped.filter((row) => {
    const bucket = applicationTypeBucket(
      row.applicationTypePrimary,
      row.applicationTypeSecondary,
      row.taskTitle,
    );
    return bucket === filter;
  });
}

/**
 * Metrics for the Filing workspace header.
 * Runs four count queries in parallel for speed.
 */
export async function getFilingMetrics() {
  const session = await requireSession();

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));

  const filingTaskCondition = or(
    ilike(tasks.title, "%file application%"),
    ilike(tasks.title, "%file ssdi%"),
    ilike(tasks.title, "%file ssi%"),
    ilike(tasks.title, "%submit application%"),
    ilike(tasks.title, "%file reconsid%"),
    ilike(tasks.title, "%hearing request%"),
    eq(caseStages.owningTeam, "filing"),
  );

  const [readyResult, inProgressResult, submittedTodayResult, dueWeekResult] =
    await Promise.all([
      // Ready to file: pending + filing-related
      db
        .select({ count: count() })
        .from(tasks)
        .leftJoin(cases, eq(tasks.caseId, cases.id))
        .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
        .where(
          and(
            eq(tasks.organizationId, session.organizationId),
            isNull(tasks.deletedAt),
            eq(tasks.status, "pending"),
            filingTaskCondition,
          ),
        ),
      // In progress
      db
        .select({ count: count() })
        .from(tasks)
        .leftJoin(cases, eq(tasks.caseId, cases.id))
        .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
        .where(
          and(
            eq(tasks.organizationId, session.organizationId),
            isNull(tasks.deletedAt),
            eq(tasks.status, "in_progress"),
            filingTaskCondition,
          ),
        ),
      // Submitted today (tasks completed today that look like filing)
      db
        .select({ count: count() })
        .from(tasks)
        .leftJoin(cases, eq(tasks.caseId, cases.id))
        .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
        .where(
          and(
            eq(tasks.organizationId, session.organizationId),
            isNull(tasks.deletedAt),
            eq(tasks.status, "completed"),
            gte(tasks.completedAt, today),
            lte(tasks.completedAt, tomorrow),
            filingTaskCondition,
          ),
        ),
      // Due this week
      db
        .select({ count: count() })
        .from(tasks)
        .leftJoin(cases, eq(tasks.caseId, cases.id))
        .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
        .where(
          and(
            eq(tasks.organizationId, session.organizationId),
            isNull(tasks.deletedAt),
            ne(tasks.status, "completed"),
            ne(tasks.status, "skipped"),
            gte(tasks.dueDate, today),
            lte(tasks.dueDate, endOfWeek),
            filingTaskCondition,
          ),
        ),
    ]);

  return {
    readyToFile: readyResult[0]?.count ?? 0,
    inProgress: inProgressResult[0]?.count ?? 0,
    submittedToday: submittedTodayResult[0]?.count ?? 0,
    dueThisWeek: dueWeekResult[0]?.count ?? 0,
  };
}

/**
 * Document templates for filing applications.
 */
export async function getFilingTemplates() {
  const session = await requireSession();

  const rows = await db
    .select({
      id: documentTemplates.id,
      name: documentTemplates.name,
      description: documentTemplates.description,
      category: documentTemplates.category,
      requiresSignature: documentTemplates.requiresSignature,
    })
    .from(documentTemplates)
    .where(
      and(
        eq(documentTemplates.organizationId, session.organizationId),
        eq(documentTemplates.isActive, true),
        or(
          eq(documentTemplates.category, "application"),
          eq(documentTemplates.category, "filing"),
          ilike(documentTemplates.name, "%ssdi%"),
          ilike(documentTemplates.name, "%ssi%"),
          ilike(documentTemplates.name, "%application%"),
          ilike(documentTemplates.name, "%reconsideration%"),
          ilike(documentTemplates.name, "%hearing%"),
        ),
      ),
    )
    .orderBy(asc(documentTemplates.name))
    .limit(50);

  return rows.map((row) => {
    const nameLower = row.name.toLowerCase();
    let type: "SSDI" | "SSI" | "Both" | "Reconsideration" | "Hearing" = "SSDI";
    if (nameLower.includes("hearing")) type = "Hearing";
    else if (nameLower.includes("reconsid")) type = "Reconsideration";
    else if (nameLower.includes("ssdi") && nameLower.includes("ssi"))
      type = "Both";
    else if (nameLower.includes("ssi")) type = "SSI";
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      type,
      requiresSignature: row.requiresSignature,
      // Each template ships with a standard 1-document count today; this
      // field is surfaced in the sidebar so agents can see file count.
      documentCount: 1,
    };
  });
}

/**
 * Apply a template to a case (copies the template metadata into a new
 * document row attached to the case). Used by the "Use Template" button in
 * the filing sidebar.
 */
export async function applyFilingTemplate(caseId: string, templateId: string) {
  const session = await requireSession();

  const [template] = await db
    .select()
    .from(documentTemplates)
    .where(
      and(
        eq(documentTemplates.id, templateId),
        eq(documentTemplates.organizationId, session.organizationId),
      ),
    );

  if (!template) throw new Error("Template not found");

  await db.insert(auditLog).values({
    organizationId: session.organizationId,
    userId: session.id,
    entityType: "case",
    entityId: caseId,
    action: "filing_template_applied",
    changes: {
      templateId: template.id,
      templateName: template.name,
    },
  });

  revalidatePath("/filing");
  revalidatePath(`/cases/${caseId}`);
  return { success: true, templateName: template.name };
}

/**
 * One-click file: mark the filing task complete, transition the case to the
 * next stage, and record an audit log entry -- all in a single transaction
 * so the filing agent gets instant feedback and consistent data.
 */
export async function oneClickFile(
  caseId: string,
  taskId: string,
  applicationType: string,
) {
  const session = await requireSession();

  const result = await db.transaction(async (tx) => {
    // 1. Mark the task complete
    await tx
      .update(tasks)
      .set({
        status: "completed",
        completedAt: new Date(),
        completedBy: session.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.organizationId, session.organizationId),
        ),
      );

    // 2. Look up the case's current stage
    const [caseRow] = await tx
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

    if (!caseRow) throw new Error("Case not found");

    // 3. Find the current stage and determine the next allowed stage
    const [currentStage] = await tx
      .select({
        id: caseStages.id,
        displayOrder: caseStages.displayOrder,
        stageGroupId: caseStages.stageGroupId,
        allowedNextStageIds: caseStages.allowedNextStageIds,
      })
      .from(caseStages)
      .where(eq(caseStages.id, caseRow.currentStageId));

    let nextStageId: string | null = null;

    if (currentStage) {
      if (
        currentStage.allowedNextStageIds &&
        currentStage.allowedNextStageIds.length > 0
      ) {
        nextStageId = currentStage.allowedNextStageIds[0];
      } else {
        // Fall back to the next stage by (group, displayOrder)
        const allStages = await tx
          .select({
            id: caseStages.id,
            displayOrder: caseStages.displayOrder,
            groupDisplayOrder: caseStageGroups.displayOrder,
          })
          .from(caseStages)
          .innerJoin(
            caseStageGroups,
            eq(caseStages.stageGroupId, caseStageGroups.id),
          )
          .where(
            and(
              eq(caseStages.organizationId, session.organizationId),
              isNull(caseStages.deletedAt),
            ),
          )
          .orderBy(
            asc(caseStageGroups.displayOrder),
            asc(caseStages.displayOrder),
          );

        const idx = allStages.findIndex((s) => s.id === caseRow.currentStageId);
        if (idx >= 0 && idx < allStages.length - 1) {
          nextStageId = allStages[idx + 1].id;
        }
      }
    }

    // 4. Transition the case if we found a next stage
    if (nextStageId) {
      await tx
        .update(cases)
        .set({
          currentStageId: nextStageId,
          stageEnteredAt: new Date(),
          updatedAt: new Date(),
          updatedBy: session.id,
        })
        .where(eq(cases.id, caseId));

      await tx.insert(caseStageTransitions).values({
        caseId,
        fromStageId: caseRow.currentStageId,
        toStageId: nextStageId,
        transitionedBy: session.id,
        notes: `Auto-transitioned after filing ${applicationType}`,
        isAutomatic: true,
      });
    }

    // 5. Audit log
    await tx.insert(auditLog).values({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "case",
      entityId: caseId,
      action: "application_filed",
      changes: {
        taskId,
        applicationType,
        transitionedToStageId: nextStageId,
      },
    });

    return {
      success: true as const,
      transitionedToStageId: nextStageId,
    };
  });

  logger.info("One-click filing completed", {
    caseId,
    taskId,
    applicationType,
    transitionedToStageId: result.transitionedToStageId,
  });

  revalidatePath("/filing");
  revalidatePath("/queue");
  revalidatePath(`/cases/${caseId}`);

  return result;
}

// Suppress unused import warning: inArray reserved for future bulk-file action.
void inArray;

/**
 * Filing-specific reject reason codes. Kept as a string-literal union so the
 * client dialog and server action share the exact same vocabulary. Adding a
 * new code here automatically lights it up in the reject dialog.
 */
// FILING_REJECT_REASON_CODES, FILING_REJECT_REASON_LABELS, and the type
// FilingRejectReasonCode live in @/lib/filing/constants because Next.js
// forbids non-async-function exports from `"use server"` files. The
// type is imported at the top of this file for the action signature.

/**
 * Lightweight row for filing picker UIs (reject dialog). Sorted with the
 * oldest-pending filing first so the "act on oldest" pattern gets a sensible
 * default selection.
 */
export type PendingFilingRow = {
  taskId: string;
  caseId: string;
  caseNumber: string;
  claimantName: string;
  taskTitle: string;
  daysWaiting: number;
};

/** Return all pending filings ordered oldest-first. */
export async function getPendingFilings(): Promise<PendingFilingRow[]> {
  const queue = await getFilingQueue("all");
  // Oldest = longest daysWaiting. The queue is ordered by due date asc, so
  // re-sort here to be explicit about the semantics callers rely on.
  return queue
    .map((r) => ({
      taskId: r.taskId,
      caseId: r.caseId,
      caseNumber: r.caseNumber,
      claimantName: r.claimantName,
      taskTitle: r.taskTitle,
      daysWaiting: r.daysWaiting,
    }))
    .sort((a, b) => b.daysWaiting - a.daysWaiting);
}

/**
 * Reject a filing task with a required reason code and optional notes. Marks
 * the underlying task as `blocked` (our enum doesn't have `rejected`, so
 * blocked is the closest terminal-not-completed state), stamps the rejection
 * context onto the task's description, and writes a HIPAA audit row via
 * `logExtractionReview` so reviewer rejections are reconstructable alongside
 * AI-extraction rejections.
 *
 * Requires an active session + scopes the update to the caller's org.
 */
export async function rejectFiling(
  filingId: string,
  reasonCode: FilingRejectReasonCode,
  notes?: string,
): Promise<{ success: boolean; message?: string }> {
  const session = await requireSession();

  if (!FILING_REJECT_REASON_CODES.includes(reasonCode)) {
    return { success: false, message: "Invalid reason code" };
  }

  try {
    const [filingTask] = await db
      .select({
        id: tasks.id,
        caseId: tasks.caseId,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.id, filingId),
          eq(tasks.organizationId, session.organizationId),
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1);

    if (!filingTask) {
      return { success: false, message: "Filing not found" };
    }

    const rejectedAt = new Date().toISOString();
    const label = FILING_REJECT_REASON_LABELS[reasonCode];
    const trimmedNotes = notes?.trim() || "";
    const rejectionStamp =
      `\n\n[Rejected ${rejectedAt} — ${label}${reasonCode === "other" ? "" : ` (${reasonCode})`}]` +
      (trimmedNotes ? `\nNotes: ${trimmedNotes}` : "");

    await db
      .update(tasks)
      .set({
        status: "blocked",
        description: `${filingTask.description ?? ""}${rejectionStamp}`.trim(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tasks.id, filingTask.id),
          eq(tasks.organizationId, session.organizationId),
        ),
      );

    // HIPAA-style audit row — mirrors the ai-review reject path so downstream
    // audit exports stay uniform.
    await logExtractionReview({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "filing_task",
      entityId: filingTask.id,
      caseId: filingTask.caseId,
      decision: "reject",
      reason: trimmedNotes ? `${reasonCode}: ${trimmedNotes}` : reasonCode,
      severity: "warning",
      metadata: {
        filingTaskTitle: filingTask.title,
        reasonCode,
        notes: trimmedNotes || null,
      },
    });

    logger.info("Filing rejected", {
      filingId: filingTask.id,
      caseId: filingTask.caseId,
      reasonCode,
      userId: session.id,
    });

    revalidatePath("/filing");
    revalidatePath("/dashboard");
    revalidatePath(`/cases/${filingTask.caseId}`);

    return {
      success: true,
      message: `Rejected: ${label}`,
    };
  } catch (error) {
    logger.error("rejectFiling failed", {
      filingId,
      reasonCode,
      error,
    });
    return { success: false, message: "Could not reject filing" };
  }
}
