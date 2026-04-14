"use server";

import { askClaude } from "@/lib/ai/client";
import { getCaseById, getCaseActivity } from "@/app/actions/cases";
import { getCaseTasks } from "@/app/actions/tasks";
import { getCaseNotes } from "@/app/actions/notes";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import { cases } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";

/**
 * Model string persisted alongside a summary so we can invalidate caches
 * when the underlying model changes. Keep in sync with lib/ai/client.ts.
 */
export const AI_SUMMARY_MODEL = "claude-sonnet-4-20250514";

/**
 * Summarize a case using AI. Fetches case data, stage transitions,
 * recent notes, and tasks, then asks the AI for a concise summary.
 *
 * The resulting summary is persisted on `cases.aiSummary` (plus generated-at
 * timestamp, model, and a monotonic version counter) so the case overview can
 * render it without an on-demand round trip. Callers that just want to read
 * the last-known summary should use `getCaseAiSummary`.
 */
export async function summarizeCase(caseId: string): Promise<string> {
  try {
    const [caseData, activity, tasks, notes] = await Promise.all([
      getCaseById(caseId),
      getCaseActivity(caseId),
      getCaseTasks(caseId),
      getCaseNotes(caseId),
    ]);

    if (!caseData) {
      return "Case not found.";
    }

    const claimantName = caseData.claimant
      ? `${caseData.claimant.firstName} ${caseData.claimant.lastName}`
      : "Unknown claimant";

    const stageHistory = activity
      .slice(0, 10)
      .map(
        (a) =>
          `${a.transitionedAt.toLocaleDateString()}: ${a.fromStageId ? "Stage changed" : "Case created"}${a.notes ? ` - ${a.notes}` : ""}`,
      )
      .join("\n");

    const openTasks = tasks
      .filter((t) => t.status !== "completed" && t.status !== "skipped")
      .map(
        (t) =>
          `- ${t.title} (${t.priority}${t.dueDate ? `, due ${t.dueDate.toLocaleDateString()}` : ""})`,
      )
      .join("\n");

    const recentNotes = notes
      .slice(0, 5)
      .map(
        (n) =>
          `- ${n.createdAt.toLocaleDateString()}: ${(n.body ?? "").slice(0, 200)}`,
      )
      .join("\n");

    const prompt = `You are a legal case management assistant for a Social Security disability law firm. Summarize this case in one clear paragraph.

Case: ${caseData.caseNumber}
Claimant: ${claimantName}
Status: ${caseData.status}
Current Stage: ${caseData.stageName ?? "Unknown"}
Stage Group: ${caseData.stageGroupName ?? "Unknown"}
Application Type: ${caseData.applicationTypePrimary ?? "Not specified"}
SSA Office: ${caseData.ssaOffice ?? "Not specified"}
Hearing Office: ${caseData.hearingOffice ?? "Not specified"}
ALJ: ${caseData.adminLawJudge ?? "Not assigned"}

Stage History:
${stageHistory || "No transitions recorded."}

Open Tasks:
${openTasks || "No open tasks."}

Recent Notes:
${recentNotes || "No recent notes."}

Write a concise summary paragraph that captures the current status, key details, and any notable items a case manager should be aware of.`;

    const summary = await askClaude(prompt);

    // Persist the summary. Intentionally best-effort: if the DB write fails
    // we still hand the generated text back to the caller so the UI can show
    // it for the current session — a summary is informational, not PHI-bearing.
    try {
      await db
        .update(cases)
        .set({
          aiSummary: summary,
          aiSummaryGeneratedAt: new Date(),
          aiSummaryModel: AI_SUMMARY_MODEL,
          aiSummaryVersion: (caseData.aiSummaryVersion ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(cases.id, caseId));
      revalidatePath(`/cases/${caseId}`);
      revalidatePath(`/cases/${caseId}/overview`);
    } catch (persistError) {
      logger.error("Failed to persist AI case summary", {
        caseId,
        error: persistError,
      });
    }

    return summary;
  } catch (error) {
    logger.error("Failed to summarize case", { caseId, error });
    return "Failed to generate case summary. Please try again.";
  }
}

/**
 * Fetch the persisted AI summary for a case (if any). Returns null when no
 * summary has been generated yet. The caller is responsible for deciding
 * whether the summary is stale — the UI treats anything older than 14 days
 * as needing regeneration.
 */
export async function getCaseAiSummary(caseId: string): Promise<{
  summary: string;
  generatedAt: Date;
  model: string | null;
  version: number;
} | null> {
  const session = await requireSession();
  const [row] = await db
    .select({
      aiSummary: cases.aiSummary,
      aiSummaryGeneratedAt: cases.aiSummaryGeneratedAt,
      aiSummaryModel: cases.aiSummaryModel,
      aiSummaryVersion: cases.aiSummaryVersion,
      organizationId: cases.organizationId,
    })
    .from(cases)
    .where(eq(cases.id, caseId))
    .limit(1);

  if (!row || row.organizationId !== session.organizationId) return null;
  if (!row.aiSummary || !row.aiSummaryGeneratedAt) return null;

  return {
    summary: row.aiSummary,
    generatedAt: row.aiSummaryGeneratedAt,
    model: row.aiSummaryModel,
    version: row.aiSummaryVersion ?? 0,
  };
}

/**
 * Suggest next steps for a case based on its current stage and history.
 */
export async function suggestNextSteps(caseId: string): Promise<string> {
  try {
    const [caseData, activity, tasks] = await Promise.all([
      getCaseById(caseId),
      getCaseActivity(caseId),
      getCaseTasks(caseId),
    ]);

    if (!caseData) {
      return "Case not found.";
    }

    const openTasks = tasks
      .filter((t) => t.status !== "completed" && t.status !== "skipped")
      .map((t) => `- ${t.title} (${t.priority}, ${t.status})`)
      .join("\n");

    const completedTasks = tasks
      .filter((t) => t.status === "completed")
      .map(
        (t) =>
          `- ${t.title} (completed${t.completedAt ? ` ${t.completedAt.toLocaleDateString()}` : ""})`,
      )
      .join("\n");

    const stageHistory = activity
      .slice(0, 10)
      .map(
        (a) =>
          `${a.transitionedAt.toLocaleDateString()}: ${a.fromStageId ? "Stage transition" : "Case created"}${a.notes ? ` - ${a.notes}` : ""}`,
      )
      .join("\n");

    const assignedStaff = caseData.assignedStaff
      .map((s) => `${s.firstName} ${s.lastName} (${s.role})`)
      .join(", ");

    const prompt = `You are a legal case management assistant for a Social Security disability law firm. Based on the current state of this case, suggest 3-5 specific next actions the team should take.

Case: ${caseData.caseNumber}
Status: ${caseData.status}
Current Stage: ${caseData.stageName ?? "Unknown"}
Stage Group: ${caseData.stageGroupName ?? "Unknown"}
Application Type: ${caseData.applicationTypePrimary ?? "Not specified"}
SSA Office: ${caseData.ssaOffice ?? "Not specified"}
Hearing Office: ${caseData.hearingOffice ?? "Not specified"}
ALJ: ${caseData.adminLawJudge ?? "Not assigned"}
Assigned Staff: ${assignedStaff || "No one assigned"}

Stage History:
${stageHistory || "No transitions recorded."}

Open Tasks:
${openTasks || "No open tasks."}

Completed Tasks:
${completedTasks || "No completed tasks."}

Return exactly 3-5 suggested next steps as a numbered list. Each step should be specific and actionable. Consider the current stage, what has been done, and what typically needs to happen next in Social Security disability cases.`;

    return await askClaude(prompt);
  } catch (error) {
    logger.error("Failed to suggest next steps", { caseId, error });
    return "Failed to generate suggestions. Please try again.";
  }
}

/**
 * Draft a communication to the client based on case context.
 */
export async function draftCommunication(
  caseId: string,
  context: string,
): Promise<string> {
  try {
    const [caseData, activity] = await Promise.all([
      getCaseById(caseId),
      getCaseActivity(caseId),
    ]);

    if (!caseData) {
      return "Case not found.";
    }

    const claimantName = caseData.claimant
      ? `${caseData.claimant.firstName} ${caseData.claimant.lastName}`
      : "the client";

    const stageHistory = activity
      .slice(0, 5)
      .map(
        (a) =>
          `${a.transitionedAt.toLocaleDateString()}: ${a.fromStageId ? "Stage changed" : "Case created"}`,
      )
      .join("\n");

    const prompt = `You are a legal assistant drafting a message to a client at a Social Security disability law firm. Draft a professional, empathetic message.

Case: ${caseData.caseNumber}
Client Name: ${claimantName}
Status: ${caseData.status}
Current Stage: ${caseData.stageName ?? "Unknown"}
Application Type: ${caseData.applicationTypePrimary ?? "Not specified"}

Recent Case History:
${stageHistory || "No recent activity."}

Context for this message: ${context}

Draft a professional, empathetic message to ${claimantName}. Use plain language (avoid legal jargon where possible). Be warm but professional. Do not include a subject line, just the message body. Sign off as "Hogan Smith Law".`;

    return await askClaude(prompt);
  } catch (error) {
    logger.error("Failed to draft communication", { caseId, error });
    return "Failed to draft message. Please try again.";
  }
}
