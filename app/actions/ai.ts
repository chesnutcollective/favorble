"use server";

import { askClaude } from "@/lib/ai/client";
import { getCaseById, getCaseActivity } from "@/app/actions/cases";
import { getCaseTasks } from "@/app/actions/tasks";
import { getCaseNotes } from "@/app/actions/notes";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import { aiDrafts, communications, cases } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import {
  buildCaseContext,
  formatCaseContextForPrompt,
  type CaseContextBundle,
} from "@/lib/services/case-context";
import { createNotification } from "@/lib/services/notify";
import {
  logAiDraftEvent,
  logCommunicationEvent,
} from "@/lib/services/hipaa-audit";
import { resolveReviewerForCase } from "@/lib/services/ai-drafts";
import * as caseStatusClient from "@/lib/integrations/case-status";
import { revalidatePath } from "next/cache";

const MODEL_ID = "claude-sonnet-4-20250514";
const PROMPT_VERSION = "cm2-2026-04-10";

/**
 * Model string persisted alongside a summary so we can invalidate caches
 * when the underlying model changes.
 */
const AI_SUMMARY_MODEL = MODEL_ID;

const DRAFT_SYSTEM_INTRO = `You are a senior case manager at Hogan Smith Law, a boutique Social Security Disability law firm. You write directly to claimants on behalf of the firm. Your tone is warm, specific, and empathetic — never generic, never condescending. You reference the claimant's actual case stage, timeline, hearing dates, denials, and pending tasks drawn only from the case context provided. You never invent medical facts or SSA decisions. If something is missing, you either leave a bracketed placeholder or write around it. You write at a 7th-grade reading level and avoid SSA jargon except when you immediately define it in plain English.`;

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
 * Build the context-signals bullet list — a short summary of "what the AI
 * actually saw in the case file" so the reviewer can tell the draft isn't
 * a generic template.
 */
function extractContextSignals(ctx: CaseContextBundle): string[] {
  const signals: string[] = [];
  const cm = ctx.caseMeta;

  if (cm.stageName) {
    signals.push(
      `Current stage: ${cm.stageName}${
        cm.stageEnteredAt
          ? ` (since ${cm.stageEnteredAt.toISOString().split("T")[0]})`
          : ""
      }`,
    );
  }
  if (cm.hearingDate) {
    signals.push(
      `Hearing scheduled ${cm.hearingDate.toISOString().split("T")[0]}`,
    );
  }
  if (cm.allegedOnsetDate) {
    signals.push(
      `Alleged onset ${cm.allegedOnsetDate.toISOString().split("T")[0]}`,
    );
  }
  if (cm.adminLawJudge) signals.push(`ALJ: ${cm.adminLawJudge}`);

  const mostRecentInbound = ctx.communications.find(
    (c) => c.direction === "inbound",
  );
  if (mostRecentInbound) {
    signals.push(
      `Last inbound message ${
        mostRecentInbound.createdAt.toISOString().split("T")[0]
      }${
        mostRecentInbound.sentimentLabel
          ? ` (sentiment: ${mostRecentInbound.sentimentLabel})`
          : ""
      }`,
    );
  }

  if (ctx.openTasks.length > 0) {
    const urgent = ctx.openTasks.filter(
      (t) => t.priority === "urgent" || t.priority === "high",
    );
    if (urgent.length > 0) {
      signals.push(
        `${urgent.length} high-priority open task${urgent.length === 1 ? "" : "s"}: ${urgent
          .slice(0, 3)
          .map((t) => t.title)
          .join(", ")}`,
      );
    } else {
      signals.push(
        `${ctx.openTasks.length} open task${ctx.openTasks.length === 1 ? "" : "s"}`,
      );
    }
  }

  if (ctx.medicalChronology.length > 0) {
    const diagnoses = new Set<string>();
    for (const entry of ctx.medicalChronology) {
      for (const dx of entry.diagnoses ?? []) diagnoses.add(dx);
    }
    if (diagnoses.size > 0) {
      signals.push(
        `Diagnoses in file: ${Array.from(diagnoses).slice(0, 4).join(", ")}`,
      );
    }
  }

  if (ctx.stageHistory.length > 1) {
    signals.push(
      `${ctx.stageHistory.length} prior stage transition${
        ctx.stageHistory.length === 1 ? "" : "s"
      }`,
    );
  }

  if (signals.length === 0) {
    signals.push("Limited context on file — draft is generic");
  }

  return signals;
}

/**
 * Draft a communication to the client based on the full case context.
 * Returns the draft text, a disclaimer, and the list of context signals
 * so the reviewer can see exactly what the AI pulled from the file.
 *
 * This does NOT persist to ai_drafts — it's the live draft helper used
 * from the case detail "compose" flow. Use `draftReplyToMessage` for
 * inbound-reply drafting which persists for review.
 */
export async function draftCommunication(
  caseId: string,
  context: string,
): Promise<{ draft: string; disclaimer: string; contextSignals: string[] }> {
  const disclaimer =
    "AI-generated draft — review for accuracy, tone, and completeness before sending.";
  try {
    const ctx = await buildCaseContext(caseId);
    if (!ctx) {
      return {
        draft: "Case not found.",
        disclaimer,
        contextSignals: [],
      };
    }

    const promptText = formatCaseContextForPrompt(ctx);
    const claimant = ctx.claimant
      ? `${ctx.claimant.firstName} ${ctx.claimant.lastName}`
      : "the client";

    const prompt = `${DRAFT_SYSTEM_INTRO}

Draft a message to ${claimant} on behalf of Hogan Smith Law. The case manager's note about what to say: "${context}".

Requirements:
- Reference the claimant by first name
- Tie the message to the current stage or the most recent case event (if relevant)
- Be specific: mention dates, deadlines, hearing dates, or pending tasks only if they're in the case file below
- Warm and empathetic — this person is often stressed about their disability claim
- Plain English, no legal jargon (if you must use SSA terms like "ALJ" or "reconsideration", define them in parentheses)
- Do not include a subject line
- Sign off as "Hogan Smith Law"

## Case context
${promptText}

Return only the message body. Do not include commentary or explanation.`;

    const draft = await askClaude(prompt);
    const contextSignals = extractContextSignals(ctx);
    return { draft, disclaimer, contextSignals };
  } catch (error) {
    logger.error("Failed to draft communication", { caseId, error });
    return {
      draft: "Failed to draft message. Please try again.",
      disclaimer,
      contextSignals: [],
    };
  }
}

/**
 * Given an inbound communication id, draft a specific reply to it and
 * persist the draft to `ai_drafts`. The assigned reviewer is notified so
 * the draft surfaces in their inbox.
 */
export async function draftReplyToMessage(
  communicationId: string,
): Promise<{ draftId: string | null; body?: string; error?: string }> {
  const session = await requireSession();

  try {
    // Look up the source communication
    const [comm] = await db
      .select({
        id: communications.id,
        caseId: communications.caseId,
        organizationId: communications.organizationId,
        body: communications.body,
        subject: communications.subject,
        fromAddress: communications.fromAddress,
        direction: communications.direction,
        createdAt: communications.createdAt,
      })
      .from(communications)
      .where(eq(communications.id, communicationId))
      .limit(1);

    if (!comm || !comm.caseId) {
      return { draftId: null, error: "Message not found" };
    }

    const ctx = await buildCaseContext(comm.caseId);
    if (!ctx) {
      return { draftId: null, error: "Case context unavailable" };
    }

    // Resolve reviewer — prefer the case manager, else the current user
    const reviewerId =
      (await resolveReviewerForCase(comm.caseId)) ?? session.id;

    // Create a draft row in `generating` state so the UI can show a spinner
    const [draftRow] = await db
      .insert(aiDrafts)
      .values({
        organizationId: comm.organizationId,
        caseId: comm.caseId,
        type: "client_message",
        status: "generating",
        title: `Reply — ${comm.subject ?? "inbound message"}`.slice(0, 200),
        body: "",
        assignedReviewerId: reviewerId,
        sourceCommunicationId: comm.id,
        promptVersion: PROMPT_VERSION,
        model: MODEL_ID,
      })
      .returning({ id: aiDrafts.id });

    const draftId = draftRow.id;

    try {
      const promptText = formatCaseContextForPrompt(ctx);
      const claimant = ctx.claimant
        ? `${ctx.claimant.firstName} ${ctx.claimant.lastName}`
        : "the client";

      const prompt = `${DRAFT_SYSTEM_INTRO}

The claimant ${claimant} just sent the following message to the firm:

---
From: ${comm.fromAddress ?? "client"}
Sent: ${comm.createdAt.toISOString()}
Subject: ${comm.subject ?? "(no subject)"}

${comm.body ?? "(empty body)"}
---

Draft a direct reply. Your reply must:
- Directly answer or acknowledge every question / concern in the client's message
- Reference specific facts from the case file below where relevant (stage, hearing date, pending tasks, recent denial, etc.)
- Be warm and empathetic — acknowledge any frustration or worry the client expressed
- Use plain English, 7th-grade reading level
- Close with a clear next step and a reminder the client can reach out anytime
- NOT include a subject line
- Sign off as "Hogan Smith Law"

## Case context
${promptText}

Return only the reply body. No commentary, no JSON, no explanation.`;

      const body = await askClaude(prompt);

      await db
        .update(aiDrafts)
        .set({
          status: "draft_ready",
          body,
          updatedAt: new Date(),
        })
        .where(eq(aiDrafts.id, draftId));

      await logAiDraftEvent({
        organizationId: comm.organizationId,
        actorUserId: session.id,
        caseId: comm.caseId,
        draftId,
        draftType: "client_message",
        action: "ai_draft_created",
        metadata: { sourceCommunicationId: comm.id },
      });

      // Notify the reviewer
      if (reviewerId) {
        await createNotification({
          organizationId: comm.organizationId,
          userId: reviewerId,
          caseId: comm.caseId,
          title: "AI reply ready for review",
          body: `Draft reply generated for message from ${comm.fromAddress ?? "client"}. Review before sending.`,
          priority: "normal",
          actionLabel: "Review draft",
          actionHref: `/drafts/${draftId}`,
        });
      }

      revalidatePath(`/cases/${comm.caseId}/messages`);
      revalidatePath("/drafts");

      return { draftId, body };
    } catch (genErr) {
      const errorMessage =
        genErr instanceof Error ? genErr.message : String(genErr);
      await db
        .update(aiDrafts)
        .set({
          status: "error",
          errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(aiDrafts.id, draftId));

      await logAiDraftEvent({
        organizationId: comm.organizationId,
        actorUserId: session.id,
        caseId: comm.caseId,
        draftId,
        draftType: "client_message",
        action: "ai_draft_error",
        metadata: { error: errorMessage },
      });

      logger.error("draftReplyToMessage generation failed", {
        communicationId,
        error: errorMessage,
      });
      return { draftId, error: errorMessage };
    }
  } catch (error) {
    logger.error("draftReplyToMessage failed", { communicationId, error });
    return {
      draftId: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update the body of an AI draft. Also recomputes the edit distance
 * (character diff vs the original body at the time of the first save).
 * Used when the reviewer tweaks the draft before approving.
 */
export async function editAiDraft(
  draftId: string,
  newBody: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  try {
    const [row] = await db
      .select({
        id: aiDrafts.id,
        organizationId: aiDrafts.organizationId,
        caseId: aiDrafts.caseId,
        type: aiDrafts.type,
        body: aiDrafts.body,
      })
      .from(aiDrafts)
      .where(eq(aiDrafts.id, draftId))
      .limit(1);

    if (!row) return { success: false, error: "Draft not found" };

    const editDistance = characterEditDistance(row.body, newBody);

    await db
      .update(aiDrafts)
      .set({
        body: newBody,
        editDistance,
        status: "in_review",
        updatedAt: new Date(),
      })
      .where(eq(aiDrafts.id, draftId));

    await logAiDraftEvent({
      organizationId: row.organizationId,
      actorUserId: session.id,
      caseId: row.caseId,
      draftId,
      draftType: row.type,
      action: "ai_draft_updated",
      metadata: { editDistance },
    });

    revalidatePath("/drafts");
    if (row.caseId) revalidatePath(`/cases/${row.caseId}/messages`);

    return { success: true };
  } catch (error) {
    logger.error("editAiDraft failed", { draftId, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Mark an AI draft as rejected. The draft stays in the table for
 * auditability but is filtered out of the active inbox.
 */
export async function rejectAiDraft(
  draftId: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  try {
    const [row] = await db
      .select({
        id: aiDrafts.id,
        organizationId: aiDrafts.organizationId,
        caseId: aiDrafts.caseId,
        type: aiDrafts.type,
      })
      .from(aiDrafts)
      .where(eq(aiDrafts.id, draftId))
      .limit(1);

    if (!row) return { success: false, error: "Draft not found" };

    await db
      .update(aiDrafts)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(aiDrafts.id, draftId));

    await logAiDraftEvent({
      organizationId: row.organizationId,
      actorUserId: session.id,
      caseId: row.caseId,
      draftId,
      draftType: row.type,
      action: "ai_draft_rejected",
    });

    revalidatePath("/drafts");
    if (row.caseId) revalidatePath(`/cases/${row.caseId}/messages`);

    return { success: true };
  } catch (error) {
    logger.error("rejectAiDraft failed", { draftId, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Approve an AI-generated draft as a real outbound message. Updates the
 * ai_drafts row to `approved`, inserts a new `communications` row with
 * the final text, forwards it via the Case Status send bridge (if the
 * draft was for a case that's linked to Case Status), and logs the send.
 */
export async function approveDraftAndSend(
  draftId: string,
  finalBody?: string,
): Promise<{ success: boolean; communicationId?: string; error?: string }> {
  const session = await requireSession();
  try {
    const [draft] = await db
      .select({
        id: aiDrafts.id,
        organizationId: aiDrafts.organizationId,
        caseId: aiDrafts.caseId,
        type: aiDrafts.type,
        body: aiDrafts.body,
        status: aiDrafts.status,
      })
      .from(aiDrafts)
      .where(eq(aiDrafts.id, draftId))
      .limit(1);

    if (!draft) return { success: false, error: "Draft not found" };
    if (!draft.caseId) {
      return { success: false, error: "Draft is not linked to a case" };
    }
    if (draft.status === "sent" || draft.status === "approved") {
      return { success: false, error: "Draft has already been approved" };
    }

    const originalBody = draft.body;
    const bodyToSend = finalBody ?? draft.body;
    const editDistance =
      finalBody !== undefined
        ? characterEditDistance(originalBody, finalBody)
        : undefined;

    // Insert the outbound communication row
    const [message] = await db
      .insert(communications)
      .values({
        organizationId: draft.organizationId,
        caseId: draft.caseId,
        type: "message_outbound",
        direction: "outbound",
        body: bodyToSend,
        fromAddress: `${session.firstName} ${session.lastName}`,
        userId: session.id,
      })
      .returning();

    // Update the draft to approved/sent
    await db
      .update(aiDrafts)
      .set({
        status: "sent",
        body: bodyToSend,
        approvedAt: new Date(),
        approvedBy: session.id,
        approvedCommunicationId: message.id,
        ...(editDistance !== undefined ? { editDistance } : {}),
        updatedAt: new Date(),
      })
      .where(eq(aiDrafts.id, draftId));

    // Forward through Case Status bridge if configured
    if (caseStatusClient.isConfigured()) {
      try {
        const [caseRecord] = await db
          .select({ caseStatusExternalId: cases.caseStatusExternalId })
          .from(cases)
          .where(eq(cases.id, draft.caseId))
          .limit(1);

        if (caseRecord?.caseStatusExternalId) {
          await caseStatusClient.sendMessage(
            caseRecord.caseStatusExternalId,
            bodyToSend,
            `${session.firstName} ${session.lastName}`,
          );
        }
      } catch (err) {
        logger.error("Case Status forwarding failed for AI draft", { err });
        // Non-fatal — the local communication row + draft approval still stand
      }
    }

    // Audit events
    await logAiDraftEvent({
      organizationId: draft.organizationId,
      actorUserId: session.id,
      caseId: draft.caseId,
      draftId,
      draftType: draft.type,
      action: "ai_draft_approved",
      metadata: {
        communicationId: message.id,
        ...(editDistance !== undefined ? { editDistance } : {}),
      },
    });
    await logCommunicationEvent({
      organizationId: draft.organizationId,
      actorUserId: session.id,
      caseId: draft.caseId,
      communicationId: message.id,
      direction: "outbound",
      method: "ai_draft",
      action: "communication_sent",
      metadata: { fromAiDraftId: draftId },
    });

    revalidatePath(`/cases/${draft.caseId}/messages`);
    revalidatePath("/drafts");

    return { success: true, communicationId: message.id };
  } catch (error) {
    logger.error("approveDraftAndSend failed", { draftId, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Simple Levenshtein-ish character-level distance. Good enough to signal
 * "reviewer made small tweaks" vs "reviewer rewrote half of it". Uses a
 * band-limited DP to stay cheap on long strings.
 */
function characterEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const MAX = 10_000;
  const aTrim = a.slice(0, MAX);
  const bTrim = b.slice(0, MAX);
  const m = aTrim.length;
  const n = bTrim.length;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] =
        aTrim.charCodeAt(i - 1) === bTrim.charCodeAt(j - 1)
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}
