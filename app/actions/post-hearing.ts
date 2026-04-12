"use server";

import { db } from "@/db/drizzle";
import { hearingOutcomes, cases, leads, users } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { desc, eq } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

/**
 * Post-Hearing Processing workspace server actions.
 *
 * Feeds the `/post-hearing` page with hearing outcomes bucketed by
 * processing lifecycle:
 *   - Awaiting processing — outcomeReceivedAt set, no client notified yet
 *   - Client notified — clientNotifiedAt set, stage not advanced
 *   - Stage advanced — caseStageAdvancedAt set, processing not completed
 *   - Completed — processingCompletedAt set
 */

export type HearingOutcomeBucket =
  | "awaiting"
  | "client_notified"
  | "stage_advanced"
  | "completed";

export type HearingOutcomeRow = {
  id: string;
  bucket: HearingOutcomeBucket;
  caseId: string;
  caseNumber: string;
  claimantName: string;
  hearingDate: string;
  outcome: string | null;
  outcomeReceivedAt: string | null;
  clientNotifiedAt: string | null;
  caseStageAdvancedAt: string | null;
  postHearingTasksCreatedAt: string | null;
  processingCompletedAt: string | null;
  ageInDays: number;
  processedById: string | null;
  processedByName: string | null;
  progress: {
    clientNotified: boolean;
    stageAdvanced: boolean;
    tasksCreated: boolean;
    completed: boolean;
  };
};

export type HearingOutcomeWorkspace = {
  awaiting: HearingOutcomeRow[];
  clientNotified: HearingOutcomeRow[];
  stageAdvanced: HearingOutcomeRow[];
  completed: HearingOutcomeRow[];
  counts: {
    awaiting: number;
    clientNotified: number;
    stageAdvanced: number;
    completed: number;
  };
};

/**
 * Load every hearing outcome for the org, bucketed by processing step.
 * Ordered newest hearing first so the most recent decisions surface at
 * the top of each tab.
 */
export async function getHearingOutcomes(): Promise<HearingOutcomeWorkspace> {
  const session = await requireSession();

  try {
    const rows = await db
      .select({
        id: hearingOutcomes.id,
        caseId: hearingOutcomes.caseId,
        caseNumber: cases.caseNumber,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
        hearingDate: hearingOutcomes.hearingDate,
        outcome: hearingOutcomes.outcome,
        outcomeReceivedAt: hearingOutcomes.outcomeReceivedAt,
        clientNotifiedAt: hearingOutcomes.clientNotifiedAt,
        caseStageAdvancedAt: hearingOutcomes.caseStageAdvancedAt,
        postHearingTasksCreatedAt: hearingOutcomes.postHearingTasksCreatedAt,
        processingCompletedAt: hearingOutcomes.processingCompletedAt,
        processedById: hearingOutcomes.processedBy,
        processedByFirstName: users.firstName,
        processedByLastName: users.lastName,
      })
      .from(hearingOutcomes)
      .leftJoin(cases, eq(hearingOutcomes.caseId, cases.id))
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .leftJoin(users, eq(hearingOutcomes.processedBy, users.id))
      .where(eq(hearingOutcomes.organizationId, session.organizationId))
      .orderBy(desc(hearingOutcomes.hearingDate))
      .limit(500);

    const now = Date.now();

    const awaiting: HearingOutcomeRow[] = [];
    const clientNotified: HearingOutcomeRow[] = [];
    const stageAdvanced: HearingOutcomeRow[] = [];
    const completed: HearingOutcomeRow[] = [];

    for (const r of rows) {
      const claimantName =
        r.leadFirstName || r.leadLastName
          ? `${r.leadFirstName ?? ""} ${r.leadLastName ?? ""}`.trim()
          : "Unknown Claimant";
      const processedByName =
        r.processedByFirstName || r.processedByLastName
          ? `${r.processedByFirstName ?? ""} ${r.processedByLastName ?? ""}`.trim()
          : null;

      const ageInDays = Math.max(
        0,
        Math.floor((now - new Date(r.hearingDate).getTime()) / 86_400_000),
      );

      const progress = {
        clientNotified: r.clientNotifiedAt !== null,
        stageAdvanced: r.caseStageAdvancedAt !== null,
        tasksCreated: r.postHearingTasksCreatedAt !== null,
        completed: r.processingCompletedAt !== null,
      };

      let bucket: HearingOutcomeBucket;
      if (r.processingCompletedAt) {
        bucket = "completed";
      } else if (r.caseStageAdvancedAt) {
        bucket = "stage_advanced";
      } else if (r.clientNotifiedAt) {
        bucket = "client_notified";
      } else {
        bucket = "awaiting";
      }

      const row: HearingOutcomeRow = {
        id: r.id,
        bucket,
        caseId: r.caseId,
        caseNumber: r.caseNumber ?? "—",
        claimantName,
        hearingDate: new Date(r.hearingDate).toISOString(),
        outcome: r.outcome,
        outcomeReceivedAt: r.outcomeReceivedAt
          ? new Date(r.outcomeReceivedAt).toISOString()
          : null,
        clientNotifiedAt: r.clientNotifiedAt
          ? new Date(r.clientNotifiedAt).toISOString()
          : null,
        caseStageAdvancedAt: r.caseStageAdvancedAt
          ? new Date(r.caseStageAdvancedAt).toISOString()
          : null,
        postHearingTasksCreatedAt: r.postHearingTasksCreatedAt
          ? new Date(r.postHearingTasksCreatedAt).toISOString()
          : null,
        processingCompletedAt: r.processingCompletedAt
          ? new Date(r.processingCompletedAt).toISOString()
          : null,
        ageInDays,
        processedById: r.processedById,
        processedByName,
        progress,
      };

      switch (bucket) {
        case "awaiting":
          awaiting.push(row);
          break;
        case "client_notified":
          clientNotified.push(row);
          break;
        case "stage_advanced":
          stageAdvanced.push(row);
          break;
        case "completed":
          completed.push(row);
          break;
      }
    }

    return {
      awaiting,
      clientNotified,
      stageAdvanced,
      completed,
      counts: {
        awaiting: awaiting.length,
        clientNotified: clientNotified.length,
        stageAdvanced: stageAdvanced.length,
        completed: completed.length,
      },
    };
  } catch (err) {
    logger.error("getHearingOutcomes failed", { error: err });
    return {
      awaiting: [],
      clientNotified: [],
      stageAdvanced: [],
      completed: [],
      counts: {
        awaiting: 0,
        clientNotified: 0,
        stageAdvanced: 0,
        completed: 0,
      },
    };
  }
}
