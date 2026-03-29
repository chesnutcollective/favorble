"use server";

import { db } from "@/db/drizzle";
import {
  workflowTemplates,
  workflowTaskTemplates,
  caseStages,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * Get all workflow templates with their task templates.
 */
export async function getWorkflowTemplates() {
  const session = await requireSession();

  const workflows = await db
    .select({
      id: workflowTemplates.id,
      name: workflowTemplates.name,
      description: workflowTemplates.description,
      triggerType: workflowTemplates.triggerType,
      triggerStageId: workflowTemplates.triggerStageId,
      isActive: workflowTemplates.isActive,
      notifyAssignees: workflowTemplates.notifyAssignees,
      notifyCaseManager: workflowTemplates.notifyCaseManager,
      sendClientMessage: workflowTemplates.sendClientMessage,
      createdAt: workflowTemplates.createdAt,
      triggerStageName: caseStages.name,
      triggerStageCode: caseStages.code,
    })
    .from(workflowTemplates)
    .leftJoin(caseStages, eq(workflowTemplates.triggerStageId, caseStages.id))
    .where(eq(workflowTemplates.organizationId, session.organizationId))
    .orderBy(asc(workflowTemplates.name));

  // Get task templates for each workflow
  const workflowIds = workflows.map((w) => w.id);

  type TaskTemplate = typeof workflowTaskTemplates.$inferSelect;
  const tasksByWorkflow = new Map<string, TaskTemplate[]>();
  if (workflowIds.length > 0) {
    for (const wfId of workflowIds) {
      const wfTasks = await db
        .select()
        .from(workflowTaskTemplates)
        .where(eq(workflowTaskTemplates.workflowTemplateId, wfId))
        .orderBy(asc(workflowTaskTemplates.displayOrder));
      tasksByWorkflow.set(wfId, wfTasks);
    }
  }

  return workflows.map((w) => ({
    ...w,
    taskTemplates: tasksByWorkflow.get(w.id) ?? [],
  }));
}

/**
 * Get a single workflow template with its tasks.
 */
export async function getWorkflowTemplate(id: string) {
  const [workflow] = await db
    .select()
    .from(workflowTemplates)
    .where(eq(workflowTemplates.id, id));

  if (!workflow) return null;

  const taskTemps = await db
    .select()
    .from(workflowTaskTemplates)
    .where(eq(workflowTaskTemplates.workflowTemplateId, id))
    .orderBy(asc(workflowTaskTemplates.displayOrder));

  return { ...workflow, taskTemplates: taskTemps };
}

/**
 * Create a workflow template.
 */
export async function createWorkflowTemplate(data: {
  name: string;
  description?: string;
  triggerType: string;
  triggerStageId?: string;
  notifyAssignees?: boolean;
  notifyCaseManager?: boolean;
  taskTemplates?: {
    title: string;
    description?: string;
    assignToTeam?: string;
    assignToRole?: string;
    priority?: string;
    dueDaysOffset?: number;
    dueBusinessDaysOnly?: boolean;
  }[];
}) {
  const session = await requireSession();

  const [workflow] = await db
    .insert(workflowTemplates)
    .values({
      organizationId: session.organizationId,
      name: data.name,
      description: data.description,
      triggerType: data.triggerType as
        | "stage_enter"
        | "stage_exit"
        | "case_created"
        | "field_changed"
        | "document_received"
        | "time_elapsed"
        | "manual",
      triggerStageId: data.triggerStageId,
      notifyAssignees: data.notifyAssignees ?? true,
      notifyCaseManager: data.notifyCaseManager ?? true,
    })
    .returning();

  // Create task templates
  if (data.taskTemplates?.length) {
    for (let i = 0; i < data.taskTemplates.length; i++) {
      const t = data.taskTemplates[i];
      await db.insert(workflowTaskTemplates).values({
        workflowTemplateId: workflow.id,
        title: t.title,
        description: t.description,
        assignToTeam: t.assignToTeam as
          | "intake"
          | "filing"
          | "medical_records"
          | "mail_sorting"
          | "case_management"
          | "hearings"
          | "administration"
          | null,
        assignToRole: t.assignToRole,
        priority: (t.priority ?? "medium") as
          | "low"
          | "medium"
          | "high"
          | "urgent",
        dueDaysOffset: t.dueDaysOffset ?? 1,
        dueBusinessDaysOnly: t.dueBusinessDaysOnly ?? true,
        displayOrder: i,
      });
    }
  }

  revalidatePath("/admin/workflows");
  return workflow;
}

/**
 * Update a workflow template.
 */
export async function updateWorkflowTemplate(
  id: string,
  data: {
    name?: string;
    description?: string;
    isActive?: boolean;
    triggerStageId?: string;
    notifyAssignees?: boolean;
    notifyCaseManager?: boolean;
  },
) {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.triggerStageId !== undefined)
    updateData.triggerStageId = data.triggerStageId;
  if (data.notifyAssignees !== undefined)
    updateData.notifyAssignees = data.notifyAssignees;
  if (data.notifyCaseManager !== undefined)
    updateData.notifyCaseManager = data.notifyCaseManager;

  await db
    .update(workflowTemplates)
    .set(updateData)
    .where(eq(workflowTemplates.id, id));
  revalidatePath("/admin/workflows");
}

/**
 * Toggle workflow active state.
 */
export async function toggleWorkflowActive(id: string) {
  const [wf] = await db
    .select({ isActive: workflowTemplates.isActive })
    .from(workflowTemplates)
    .where(eq(workflowTemplates.id, id));

  if (!wf) throw new Error("Workflow not found");

  await db
    .update(workflowTemplates)
    .set({ isActive: !wf.isActive, updatedAt: new Date() })
    .where(eq(workflowTemplates.id, id));
  revalidatePath("/admin/workflows");
}

/**
 * Delete a workflow template and its task templates.
 */
export async function deleteWorkflowTemplate(id: string) {
  await requireSession();

  // Delete task templates first
  await db
    .delete(workflowTaskTemplates)
    .where(eq(workflowTaskTemplates.workflowTemplateId, id));

  // Delete the workflow template
  await db.delete(workflowTemplates).where(eq(workflowTemplates.id, id));

  revalidatePath("/admin/workflows");
}
