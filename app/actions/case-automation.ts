"use server";

import { db } from "@/db/drizzle";
import {
  cases,
  caseStages,
  caseStageGroups,
  workflowTemplates,
  caseWorkflowOverrides,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";
import {
  logPhiAccess,
  logPhiModification,
  shouldAudit,
} from "@/lib/services/hipaa-audit";

export type CaseWorkflowTemplate = {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerStageId: string | null;
  triggerStageName: string | null;
  triggerStageCode: string | null;
  triggerLabel: string;
  isActive: boolean;
  /**
   * Human-friendly explanation of when this workflow will fire for the
   * current case. Examples:
   *   - "Will fire when case enters stage Filing"
   *   - "Fires whenever the case is updated"
   */
  nextFirePrediction: string;
  /** Whether the user disabled this template for this case. */
  disabledForCase: boolean;
};

const TRIGGER_LABELS: Record<string, string> = {
  stage_enter: "Stage entered",
  stage_exit: "Stage exited",
  case_created: "Case created",
  field_changed: "Field changed",
  document_received: "Document received",
  message_received: "Message received",
  time_elapsed: "Time elapsed",
  event_detected: "Event detected",
  manual: "Manual",
};

const STAGE_TRIGGERS = new Set(["stage_enter", "stage_exit"]);

/**
 * List workflow templates applicable to a case.
 *
 * Targeting strategy:
 *   1. If the template's `triggerType` is a stage trigger
 *      (`stage_enter` / `stage_exit`), we consider it applicable when:
 *      - the template's `triggerStageId` matches the case's current stage, OR
 *      - the template's `triggerStageId` matches a downstream stage
 *        (later `displayOrder` in the same or later stage group), OR
 *      - the template's `triggerConfig` references the current/downstream
 *        stage id (best-effort shallow scan).
 *   2. If we can't cheaply infer targeting (templates with non-stage
 *      triggers), we include all active org-scoped templates as a fallback
 *      so the user still has visibility.
 */
export async function getCaseWorkflowTemplates(
  caseId: string,
): Promise<CaseWorkflowTemplate[]> {
  const session = await requireSession();

  // 1. Load the case + its current stage.
  const [caseRow] = await db
    .select({
      id: cases.id,
      currentStageId: cases.currentStageId,
      stageName: caseStages.name,
      stageCode: caseStages.code,
      stageGroupId: caseStages.stageGroupId,
      stageDisplayOrder: caseStages.displayOrder,
      stageGroupDisplayOrder: caseStageGroups.displayOrder,
    })
    .from(cases)
    .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
    .leftJoin(caseStageGroups, eq(caseStages.stageGroupId, caseStageGroups.id))
    .where(
      and(
        eq(cases.id, caseId),
        eq(cases.organizationId, session.organizationId),
        isNull(cases.deletedAt),
      ),
    )
    .limit(1);

  if (!caseRow) {
    return [];
  }

  // HIPAA: workflow listing is low-sensitivity, but surface that a user
  // opened a case detail context. Debounced per user/case.
  const key = `case_automation_view:${session.id}:${caseId}`;
  if (shouldAudit(key)) {
    void logPhiAccess({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "case",
      entityId: caseId,
      caseId,
      fieldsAccessed: [],
      reason: "case automation tab view",
      severity: "info",
    });
  }

  // 2. Downstream stage ids (current or later in the same/later groups).
  const downstreamStageIds = new Set<string>();
  if (caseRow.currentStageId) {
    downstreamStageIds.add(caseRow.currentStageId);
    try {
      const allStages = await db
        .select({
          id: caseStages.id,
          stageGroupId: caseStages.stageGroupId,
          displayOrder: caseStages.displayOrder,
          groupDisplayOrder: caseStageGroups.displayOrder,
        })
        .from(caseStages)
        .leftJoin(
          caseStageGroups,
          eq(caseStages.stageGroupId, caseStageGroups.id),
        )
        .where(eq(caseStages.organizationId, session.organizationId));

      const currentGroupOrder = caseRow.stageGroupDisplayOrder ?? 0;
      const currentStageOrder = caseRow.stageDisplayOrder ?? 0;

      for (const s of allStages) {
        const groupOrder = s.groupDisplayOrder ?? 0;
        const stageOrder = s.displayOrder ?? 0;
        if (groupOrder > currentGroupOrder) {
          downstreamStageIds.add(s.id);
        } else if (
          groupOrder === currentGroupOrder &&
          stageOrder >= currentStageOrder
        ) {
          downstreamStageIds.add(s.id);
        }
      }
    } catch (err) {
      logger.warn("getCaseWorkflowTemplates: stage lookup failed", {
        error: err,
      });
    }
  }

  // 3. Pull all active org-scoped templates + overrides.
  const templates = await db
    .select({
      id: workflowTemplates.id,
      name: workflowTemplates.name,
      description: workflowTemplates.description,
      triggerType: workflowTemplates.triggerType,
      triggerStageId: workflowTemplates.triggerStageId,
      triggerConfig: workflowTemplates.triggerConfig,
      isActive: workflowTemplates.isActive,
      triggerStageName: caseStages.name,
      triggerStageCode: caseStages.code,
    })
    .from(workflowTemplates)
    .leftJoin(caseStages, eq(workflowTemplates.triggerStageId, caseStages.id))
    .where(
      and(
        eq(workflowTemplates.organizationId, session.organizationId),
        eq(workflowTemplates.isActive, true),
      ),
    )
    .orderBy(asc(workflowTemplates.name));

  const overrides = await db
    .select({
      templateId: caseWorkflowOverrides.templateId,
      disabled: caseWorkflowOverrides.disabled,
    })
    .from(caseWorkflowOverrides)
    .where(eq(caseWorkflowOverrides.caseId, caseId));

  const overrideMap = new Map<string, boolean>();
  for (const o of overrides) {
    overrideMap.set(o.templateId, o.disabled);
  }

  // 4. Targeting + fallback.
  const stageMatches: CaseWorkflowTemplate[] = [];
  const nonStageOrUnresolved: CaseWorkflowTemplate[] = [];

  for (const tmpl of templates) {
    const isStageTrigger = STAGE_TRIGGERS.has(tmpl.triggerType);
    let applicableStage = false;

    if (isStageTrigger) {
      if (
        tmpl.triggerStageId &&
        downstreamStageIds.has(tmpl.triggerStageId)
      ) {
        applicableStage = true;
      } else if (tmpl.triggerConfig && typeof tmpl.triggerConfig === "object") {
        // Shallow scan of triggerConfig for any uuid matching a downstream
        // stage id (handles stage_ids, stage_id arrays, etc.).
        const cfg = tmpl.triggerConfig as Record<string, unknown>;
        for (const v of Object.values(cfg)) {
          if (typeof v === "string" && downstreamStageIds.has(v)) {
            applicableStage = true;
            break;
          }
          if (Array.isArray(v)) {
            for (const inner of v) {
              if (typeof inner === "string" && downstreamStageIds.has(inner)) {
                applicableStage = true;
                break;
              }
            }
          }
          if (applicableStage) break;
        }
      }
    }

    const label = TRIGGER_LABELS[tmpl.triggerType] ?? tmpl.triggerType;
    const disabledForCase = overrideMap.get(tmpl.id) === true;

    let prediction: string;
    if (isStageTrigger && tmpl.triggerStageName) {
      const verb = tmpl.triggerType === "stage_exit" ? "exits" : "enters";
      prediction = `Will fire when case ${verb} stage ${tmpl.triggerStageName}`;
    } else if (tmpl.triggerType === "case_created") {
      prediction = "Fires once when the case is created";
    } else if (tmpl.triggerType === "document_received") {
      prediction = "Fires when a document is received";
    } else if (tmpl.triggerType === "message_received") {
      prediction = "Fires when a message is received";
    } else if (tmpl.triggerType === "manual") {
      prediction = "Manual trigger — fires on demand";
    } else {
      prediction = `Trigger: ${label}`;
    }
    if (disabledForCase) {
      prediction = `${prediction} (disabled for this case)`;
    }

    const row: CaseWorkflowTemplate = {
      id: tmpl.id,
      name: tmpl.name,
      description: tmpl.description,
      triggerType: tmpl.triggerType,
      triggerStageId: tmpl.triggerStageId,
      triggerStageName: tmpl.triggerStageName,
      triggerStageCode: tmpl.triggerStageCode,
      triggerLabel: label,
      isActive: tmpl.isActive,
      nextFirePrediction: prediction,
      disabledForCase,
    };

    if (isStageTrigger && applicableStage) {
      stageMatches.push(row);
    } else if (!isStageTrigger) {
      nonStageOrUnresolved.push(row);
    }
  }

  // Prefer stage matches; fall back to all non-stage templates so the user
  // still sees actionable automation for this case.
  if (stageMatches.length > 0) {
    return [...stageMatches, ...nonStageOrUnresolved];
  }
  return nonStageOrUnresolved;
}

/**
 * Toggle whether a workflow template is disabled for a specific case.
 * Upserts into `case_workflow_overrides` and writes a HIPAA audit row.
 */
export async function toggleCaseWorkflow(
  caseId: string,
  templateId: string,
  disabled: boolean,
): Promise<void> {
  const session = await requireSession();

  // Scope check: make sure the case belongs to this org.
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

  if (!caseRow) {
    throw new Error("Case not found");
  }

  const [tmplRow] = await db
    .select({ id: workflowTemplates.id })
    .from(workflowTemplates)
    .where(
      and(
        eq(workflowTemplates.id, templateId),
        eq(workflowTemplates.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!tmplRow) {
    throw new Error("Workflow template not found");
  }

  try {
    await db
      .insert(caseWorkflowOverrides)
      .values({
        caseId,
        templateId,
        disabled,
        disabledBy: session.id,
        disabledAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [caseWorkflowOverrides.caseId, caseWorkflowOverrides.templateId],
        set: {
          disabled,
          disabledBy: session.id,
          disabledAt: new Date(),
          updatedAt: new Date(),
        },
      });

    await logPhiModification({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "case_workflow_override",
      entityId: `${caseId}:${templateId}`,
      operation: "update",
      caseId,
      changes: { after: { disabled } },
      metadata: { templateId },
      action: "case_workflow_override_toggled",
    });

    revalidatePath(`/cases/${caseId}/automation`);
  } catch (err) {
    logger.error("toggleCaseWorkflow failed", {
      error: err,
      caseId,
      templateId,
    });
    throw err;
  }
}
