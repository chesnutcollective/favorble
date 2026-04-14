import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  caseStageGroups,
  caseStageTransitions,
  caseStages,
  cases,
} from "@/db/schema";
import { logger } from "@/lib/logger/server";

export type PortalStageGroup = {
  id: string;
  name: string;
  displayOrder: number;
  clientVisibleName: string | null;
  clientVisibleDescription: string | null;
};

export type PortalStage = {
  id: string;
  name: string;
  code: string;
  displayOrder: number;
  stageGroupId: string;
  description: string | null;
};

export type PortalStageTransition = {
  id: string;
  toStageId: string;
  toStageName: string;
  toStageCode: string;
  transitionedAt: Date;
};

export type PortalStageView = {
  caseId: string;
  caseNumber: string;
  currentStageId: string | null;
  stageEnteredAt: Date | null;
  stages: PortalStage[];
  stageGroups: PortalStageGroup[];
  transitions: PortalStageTransition[];
};

/**
 * Load everything the portal stage view needs for a case in a single helper:
 *   * the case's current stage id + stageEnteredAt
 *   * every stage in the organization's active pipeline (ordered)
 *   * the 5 stage-groups (with client-visible copy) for the welcome wizard
 *   * the case's transition history, newest → oldest
 *
 * Returns null if the case can't be resolved; caller decides how to render.
 */
export async function loadPortalStageView(
  caseId: string,
  organizationId: string,
): Promise<PortalStageView | null> {
  try {
    const [caseRow] = await db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        currentStageId: cases.currentStageId,
        stageEnteredAt: cases.stageEnteredAt,
      })
      .from(cases)
      .where(and(eq(cases.id, caseId), isNull(cases.deletedAt)))
      .limit(1);
    if (!caseRow) return null;

    const [stages, groups, transitionsRaw] = await Promise.all([
      db
        .select({
          id: caseStages.id,
          name: caseStages.name,
          code: caseStages.code,
          description: caseStages.description,
          displayOrder: caseStages.displayOrder,
          stageGroupId: caseStages.stageGroupId,
          groupOrder: caseStageGroups.displayOrder,
        })
        .from(caseStages)
        .innerJoin(
          caseStageGroups,
          eq(caseStages.stageGroupId, caseStageGroups.id),
        )
        .where(
          and(
            eq(caseStages.organizationId, organizationId),
            isNull(caseStages.deletedAt),
          ),
        )
        .orderBy(asc(caseStageGroups.displayOrder), asc(caseStages.displayOrder)),
      db
        .select({
          id: caseStageGroups.id,
          name: caseStageGroups.name,
          displayOrder: caseStageGroups.displayOrder,
          clientVisibleName: caseStageGroups.clientVisibleName,
          clientVisibleDescription: caseStageGroups.clientVisibleDescription,
        })
        .from(caseStageGroups)
        .where(eq(caseStageGroups.organizationId, organizationId))
        .orderBy(asc(caseStageGroups.displayOrder)),
      db
        .select({
          id: caseStageTransitions.id,
          toStageId: caseStageTransitions.toStageId,
          transitionedAt: caseStageTransitions.transitionedAt,
          toStageName: caseStages.name,
          toStageCode: caseStages.code,
        })
        .from(caseStageTransitions)
        .innerJoin(
          caseStages,
          eq(caseStageTransitions.toStageId, caseStages.id),
        )
        .where(eq(caseStageTransitions.caseId, caseId))
        .orderBy(desc(caseStageTransitions.transitionedAt))
        .limit(20),
    ]);

    const normalizedStages: PortalStage[] = stages.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      description: s.description,
      displayOrder: s.displayOrder,
      stageGroupId: s.stageGroupId,
    }));

    return {
      caseId: caseRow.id,
      caseNumber: caseRow.caseNumber,
      currentStageId: caseRow.currentStageId,
      stageEnteredAt: caseRow.stageEnteredAt,
      stages: normalizedStages,
      stageGroups: groups,
      transitions: transitionsRaw,
    };
  } catch (error) {
    logger.error("portal: failed to load stage view", { caseId, error });
    return null;
  }
}
