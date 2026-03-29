"use server";

import { db } from "@/db/drizzle";
import { caseStageGroups, caseStages, cases } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, isNull, asc, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

/**
 * Get all stage groups with their stages.
 */
export async function getStageGroupsWithStages() {
  const session = await requireSession();

  const groups = await db
    .select()
    .from(caseStageGroups)
    .where(eq(caseStageGroups.organizationId, session.organizationId))
    .orderBy(asc(caseStageGroups.displayOrder));

  const stages = await db
    .select()
    .from(caseStages)
    .where(
      and(
        eq(caseStages.organizationId, session.organizationId),
        isNull(caseStages.deletedAt),
      ),
    )
    .orderBy(asc(caseStages.displayOrder));

  return groups.map((group) => ({
    ...group,
    stages: stages.filter((s) => s.stageGroupId === group.id),
  }));
}

/**
 * Get all stages flat (for select dropdowns).
 */
export async function getAllStages() {
  const session = await requireSession();
  return db
    .select({
      id: caseStages.id,
      name: caseStages.name,
      code: caseStages.code,
      stageGroupId: caseStages.stageGroupId,
      owningTeam: caseStages.owningTeam,
      isInitial: caseStages.isInitial,
      isTerminal: caseStages.isTerminal,
    })
    .from(caseStages)
    .where(
      and(
        eq(caseStages.organizationId, session.organizationId),
        isNull(caseStages.deletedAt),
      ),
    )
    .orderBy(asc(caseStages.displayOrder));
}

/**
 * Create a stage group.
 */
export async function createStageGroup(data: {
  name: string;
  color?: string;
  clientVisibleName?: string;
}) {
  const session = await requireSession();

  // Get max display order
  const [maxOrder] = await db
    .select({
      maxOrder: count(),
    })
    .from(caseStageGroups)
    .where(eq(caseStageGroups.organizationId, session.organizationId));

  const [group] = await db
    .insert(caseStageGroups)
    .values({
      organizationId: session.organizationId,
      name: data.name,
      color: data.color,
      clientVisibleName: data.clientVisibleName,
      displayOrder: (maxOrder?.maxOrder ?? 0) + 1,
    })
    .returning();

  revalidatePath("/admin/stages");
  return group;
}

/**
 * Create a stage within a group.
 */
export async function createStage(data: {
  stageGroupId: string;
  name: string;
  code: string;
  description?: string;
  owningTeam?: string;
  color?: string;
}) {
  const session = await requireSession();

  const existingStages = await db
    .select({ id: caseStages.id })
    .from(caseStages)
    .where(eq(caseStages.stageGroupId, data.stageGroupId));

  const [stage] = await db
    .insert(caseStages)
    .values({
      organizationId: session.organizationId,
      stageGroupId: data.stageGroupId,
      name: data.name,
      code: data.code,
      description: data.description,
      color: data.color ?? null,
      owningTeam: data.owningTeam as
        | "intake"
        | "filing"
        | "medical_records"
        | "mail_sorting"
        | "case_management"
        | "hearings"
        | "administration"
        | null,
      displayOrder: existingStages.length,
    })
    .returning();

  revalidatePath("/admin/stages");
  return stage;
}

/**
 * Update a stage.
 */
export async function updateStage(
  id: string,
  data: {
    name?: string;
    description?: string;
    owningTeam?: string;
    color?: string | null;
  },
) {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  if (data.name) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.color !== undefined) updateData.color = data.color;
  if (data.owningTeam !== undefined)
    updateData.owningTeam = data.owningTeam as
      | "intake"
      | "filing"
      | "medical_records"
      | "mail_sorting"
      | "case_management"
      | "hearings"
      | "administration"
      | null;

  await db.update(caseStages).set(updateData).where(eq(caseStages.id, id));
  revalidatePath("/admin/stages");
}

/**
 * Reorder stages within a group by updating displayOrder.
 */
export async function reorderStages(orderedStageIds: string[]) {
  await requireSession();

  for (let i = 0; i < orderedStageIds.length; i++) {
    await db
      .update(caseStages)
      .set({ displayOrder: i, updatedAt: new Date() })
      .where(eq(caseStages.id, orderedStageIds[i]));
  }

  revalidatePath("/admin/stages");
  revalidatePath("/cases");
}

/**
 * Delete a stage with safe migration of all cases to a destination stage.
 */
export async function deleteStageWithMigration(
  stageId: string,
  destinationStageId: string,
) {
  const session = await requireSession();

  // Migrate all cases in this stage to the destination
  await db
    .update(cases)
    .set({
      currentStageId: destinationStageId,
      stageEnteredAt: new Date(),
      updatedAt: new Date(),
      updatedBy: session.id,
    })
    .where(eq(cases.currentStageId, stageId));

  // Soft-delete the stage
  await db
    .update(caseStages)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(caseStages.id, stageId));

  logger.info("Stage deleted with migration", {
    stageId,
    destinationStageId,
  });

  revalidatePath("/admin/stages");
  revalidatePath("/cases");
}

/**
 * Get count of cases in a specific stage (for deletion preview).
 */
export async function getCasesInStageCount(stageId: string) {
  const [result] = await db
    .select({ count: count() })
    .from(cases)
    .where(
      and(
        eq(cases.currentStageId, stageId),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
      ),
    );
  return result?.count ?? 0;
}
