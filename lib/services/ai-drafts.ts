import "server-only";
import { db } from "@/db/drizzle";
import { aiDrafts, cases, tasks, users, caseAssignments } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { askClaude } from "@/lib/ai/client";
import {
  buildCaseContext,
  formatCaseContextForPrompt,
  type CaseContextBundle,
} from "@/lib/services/case-context";
import { logger } from "@/lib/logger/server";
import { logAiDraftEvent } from "@/lib/services/hipaa-audit";
import { getCallScenario } from "@/lib/services/call-script-scenarios";

/**
 * AI draft generators for team-facing artifacts (CM-4). Every function:
 *
 *   1. Loads the full case context via `buildCaseContext`
 *   2. Formats it through `formatCaseContextForPrompt`
 *   3. Prompts Claude with a role-specific system header
 *   4. Persists an `ai_drafts` row (status = `draft_ready` on success,
 *      `error` on failure) with the assigned reviewer defaulted to the
 *      caller (if provided) or the case's primary case manager
 *   5. Logs the draft creation through the HIPAA audit helper
 *   6. Returns `{ draftId }`
 *
 * Drafts are never sent directly — they land in the drafts inbox where a
 * human approves, edits, or rejects them.
 */

const MODEL_ID = "claude-sonnet-4-20250514";
const PROMPT_VERSION = "cm4-2026-04-10";

const SYSTEM_INTRO = `You are a senior paralegal at Hogan Smith Law, a boutique Social Security Disability law firm in Ohio. You draft professional work product for attorneys and case managers. You are trained on the SSA Blue Book, 20 CFR §§ 404/416, HALLEX, and the POMS. You write in plain, empathetic English. You never fabricate medical facts, dates, diagnoses, or quotes — if a fact is not in the case file, you leave a clearly bracketed placeholder like [TO BE CONFIRMED] rather than invent one. Every draft must be reviewable by a human before it leaves the firm.`;

type DraftContext = {
  ctx: CaseContextBundle;
  promptText: string;
};

async function loadCtxOrThrow(caseId: string): Promise<DraftContext> {
  const ctx = await buildCaseContext(caseId);
  if (!ctx) {
    throw new Error(`Case ${caseId} not found or context unavailable`);
  }
  return { ctx, promptText: formatCaseContextForPrompt(ctx) };
}

/**
 * Resolve the default reviewer for a new draft. Prefers the passed
 * `reviewerId`, falls back to the case's primary case manager, then to the
 * first primary assignee, else null.
 *
 * Exported so `app/actions/ai.ts` (and other callers) can reuse the same
 * resolution logic for `draftReplyToMessage`.
 */
export async function resolveReviewerForCase(
  caseId: string,
): Promise<string | null> {
  return resolveReviewer(caseId, null);
}

async function resolveReviewer(
  caseId: string,
  explicitReviewerId: string | null | undefined,
): Promise<string | null> {
  if (explicitReviewerId) return explicitReviewerId;
  try {
    const rows = await db
      .select({
        userId: caseAssignments.userId,
        role: caseAssignments.role,
        isPrimary: caseAssignments.isPrimary,
      })
      .from(caseAssignments)
      .where(
        and(
          eq(caseAssignments.caseId, caseId),
          isNull(caseAssignments.unassignedAt),
        ),
      );

    const cm = rows.find(
      (r) => r.role === "case_manager" || r.role === "primary_case_manager",
    );
    if (cm) return cm.userId;
    const primary = rows.find((r) => r.isPrimary);
    if (primary) return primary.userId;
    return rows[0]?.userId ?? null;
  } catch (err) {
    logger.warn("resolveReviewer failed", {
      caseId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

type PersistDraftInput = {
  organizationId: string;
  caseId: string;
  type:
    | "client_message"
    | "client_letter"
    | "call_script"
    | "appeal_form"
    | "reconsideration_request"
    | "pre_hearing_brief"
    | "appeals_council_brief"
    | "medical_records_request"
    | "fee_petition"
    | "task_instructions"
    | "status_update"
    | "rfc_letter"
    | "coaching_conversation"
    | "other";
  title: string;
  body: string;
  structuredFields?: Record<string, unknown> | null;
  assignedReviewerId: string | null;
  sourceCommunicationId?: string | null;
  sourceTaskId?: string | null;
  sourceEventId?: string | null;
  actorUserId?: string | null;
};

async function persistDraft(input: PersistDraftInput): Promise<string> {
  const [row] = await db
    .insert(aiDrafts)
    .values({
      organizationId: input.organizationId,
      caseId: input.caseId,
      type: input.type,
      status: "draft_ready",
      assignedReviewerId: input.assignedReviewerId,
      title: input.title,
      body: input.body,
      structuredFields: input.structuredFields ?? null,
      sourceCommunicationId: input.sourceCommunicationId ?? null,
      sourceTaskId: input.sourceTaskId ?? null,
      sourceEventId: input.sourceEventId ?? null,
      promptVersion: PROMPT_VERSION,
      model: MODEL_ID,
    })
    .returning({ id: aiDrafts.id });

  await logAiDraftEvent({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    caseId: input.caseId,
    draftId: row.id,
    draftType: input.type,
    action: "ai_draft_created",
  });

  return row.id;
}

async function persistErrorDraft(input: {
  organizationId: string;
  caseId: string;
  type: PersistDraftInput["type"];
  title: string;
  message: string;
  assignedReviewerId: string | null;
  actorUserId?: string | null;
}): Promise<string | null> {
  try {
    const [row] = await db
      .insert(aiDrafts)
      .values({
        organizationId: input.organizationId,
        caseId: input.caseId,
        type: input.type,
        status: "error",
        title: input.title,
        body: `Generation failed: ${input.message}`,
        assignedReviewerId: input.assignedReviewerId,
        errorMessage: input.message,
        promptVersion: PROMPT_VERSION,
        model: MODEL_ID,
      })
      .returning({ id: aiDrafts.id });

    await logAiDraftEvent({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      caseId: input.caseId,
      draftId: row.id,
      draftType: input.type,
      action: "ai_draft_error",
      metadata: { error: input.message },
    });

    return row.id;
  } catch (err) {
    logger.error("persistErrorDraft failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function claimantLabel(ctx: CaseContextBundle): string {
  if (!ctx.claimant) return "the claimant";
  return `${ctx.claimant.firstName} ${ctx.claimant.lastName}`;
}

async function withOrg(caseId: string): Promise<string> {
  const [row] = await db
    .select({ organizationId: cases.organizationId })
    .from(cases)
    .where(eq(cases.id, caseId))
    .limit(1);
  if (!row) throw new Error(`Case ${caseId} not found`);
  return row.organizationId;
}

// ---------------------------------------------------------------------------
// Medical records request
// ---------------------------------------------------------------------------

export async function draftMedicalRecordsRequest(input: {
  caseId: string;
  provider: string;
  recordsSought: string;
  dateRange?: string;
  actorUserId?: string | null;
  reviewerId?: string | null;
}): Promise<string | null> {
  const organizationId = await withOrg(input.caseId);
  const reviewerId = await resolveReviewer(input.caseId, input.reviewerId);
  const title = `MR request — ${input.provider}`;
  try {
    const { ctx, promptText } = await loadCtxOrThrow(input.caseId);
    const prompt = `${SYSTEM_INTRO}

Draft a formal medical records request letter from Hogan Smith Law addressed to "${input.provider}". The firm represents ${claimantLabel(ctx)} in a pending Social Security Disability claim and needs records that are responsive to the following scope: ${input.recordsSought}.${
      input.dateRange ? ` Date range: ${input.dateRange}.` : ""
    }

Requirements:
- Formal business letter tone, HIPAA-compliant request language
- Reference the authorization-to-release on file (attached)
- Specifically enumerate the categories of records sought (office notes, imaging, labs, discharge summaries, functional assessments as relevant)
- Include a response-due date 14 calendar days from today
- Close with firm signature block placeholder
- Use [bracketed placeholders] for anything not in the case file

## Case context
${promptText}

Return only the letter body. Do not include a subject preface or commentary.`;

    const body = await askClaude(prompt);
    return await persistDraft({
      organizationId,
      caseId: input.caseId,
      type: "medical_records_request",
      title,
      body,
      structuredFields: {
        provider: input.provider,
        recordsSought: input.recordsSought,
        dateRange: input.dateRange ?? null,
      },
      assignedReviewerId: reviewerId,
      actorUserId: input.actorUserId ?? null,
    });
  } catch (err) {
    return persistErrorDraft({
      organizationId,
      caseId: input.caseId,
      type: "medical_records_request",
      title,
      message: err instanceof Error ? err.message : String(err),
      assignedReviewerId: reviewerId,
      actorUserId: input.actorUserId ?? null,
    });
  }
}

// ---------------------------------------------------------------------------
// Client letter
// ---------------------------------------------------------------------------

export async function draftClientLetter(input: {
  caseId: string;
  purpose: string;
  tone?: "warm" | "formal" | "neutral";
  actorUserId?: string | null;
  reviewerId?: string | null;
}): Promise<string | null> {
  const organizationId = await withOrg(input.caseId);
  const reviewerId = await resolveReviewer(input.caseId, input.reviewerId);
  const title = `Client letter — ${input.purpose.slice(0, 48)}`;
  const tone = input.tone ?? "warm";
  try {
    const { ctx, promptText } = await loadCtxOrThrow(input.caseId);
    const prompt = `${SYSTEM_INTRO}

Draft a letter from Hogan Smith Law to ${claimantLabel(ctx)} about: "${input.purpose}".

Tone: ${tone}. Write at a 7th-grade reading level, avoid legal jargon, explain anything SSA-specific in plain terms. Reference only facts from the case context below. Close with a warm sign-off and a reminder that the firm is here to help.

## Case context
${promptText}

Return only the letter body.`;

    const body = await askClaude(prompt);
    return await persistDraft({
      organizationId,
      caseId: input.caseId,
      type: "client_letter",
      title,
      body,
      structuredFields: { purpose: input.purpose, tone },
      assignedReviewerId: reviewerId,
      actorUserId: input.actorUserId ?? null,
    });
  } catch (err) {
    return persistErrorDraft({
      organizationId,
      caseId: input.caseId,
      type: "client_letter",
      title,
      message: err instanceof Error ? err.message : String(err),
      assignedReviewerId: reviewerId,
      actorUserId: input.actorUserId ?? null,
    });
  }
}

// ---------------------------------------------------------------------------
// Call script
// ---------------------------------------------------------------------------

export type CallScriptType =
  | "client_update"
  | "provider_followup"
  | "ssa_inquiry"
  | "denial_notification"
  | "hearing_prep"
  | "welcome_call"
  | "fee_collection"
  | "coaching_conversation";

export async function draftCallScript(input: {
  caseId: string;
  callType: CallScriptType;
  scenario: string;
  counterparty: string;
  actorUserId?: string | null;
  reviewerId?: string | null;
}): Promise<string | null> {
  const organizationId = await withOrg(input.caseId);
  const reviewerId = await resolveReviewer(input.caseId, input.reviewerId);
  const title = `Call script — ${input.callType} — ${input.counterparty}`;
  try {
    const { ctx, promptText } = await loadCtxOrThrow(input.caseId);
    const labelByType: Record<CallScriptType, string> = {
      client_update: "friendly status update with the client",
      provider_followup: "follow-up call to a medical provider",
      ssa_inquiry: "call to the SSA field office / hearing office",
      denial_notification: "call to notify the client of a denial",
      hearing_prep: "hearing preparation call with the client",
      welcome_call: "initial welcome call to a new client",
      fee_collection: "fee collection follow-up call",
      coaching_conversation:
        "supervisor coaching conversation with a team member",
    };

    // SA-4: Pull scenario-specific prompt additions from the library
    const scenario = getCallScenario(input.callType);
    const scenarioBlock = scenario
      ? `\n\nScenario guidance: ${scenario.systemPromptAddition}\n\nStructure your script around these points:\n${scenario.structureHints.map((h, i) => `${i + 1}. ${h}`).join("\n")}`
      : "";

    const prompt = `${SYSTEM_INTRO}

Draft a call script for the following call:

- Call type: ${input.callType} (${labelByType[input.callType] ?? input.callType})
- Counterparty: ${input.counterparty}
- Scenario: ${input.scenario}
- Claimant: ${claimantLabel(ctx)}
${scenarioBlock}

The script should have:
1. A one-line opening greeting + identification
2. Purpose of the call (one sentence)
3. Three to five suggested talking points tailored to this case
4. Two or three anticipated questions with suggested responses
5. A clear close / next-step statement

Use empathetic, professional language. If the call is denial_notification, lead with empathy and explain the appeal rights plainly. Pull relevant specifics from the case file.

## Case context
${promptText}

Return the script as a numbered outline.`;

    const body = await askClaude(prompt);
    return await persistDraft({
      organizationId,
      caseId: input.caseId,
      type: "call_script",
      title,
      body,
      structuredFields: {
        callType: input.callType,
        counterparty: input.counterparty,
        scenario: input.scenario,
      },
      assignedReviewerId: reviewerId,
      actorUserId: input.actorUserId ?? null,
    });
  } catch (err) {
    return persistErrorDraft({
      organizationId,
      caseId: input.caseId,
      type: "call_script",
      title,
      message: err instanceof Error ? err.message : String(err),
      assignedReviewerId: reviewerId,
      actorUserId: input.actorUserId ?? null,
    });
  }
}

// ---------------------------------------------------------------------------
// Task instructions
// ---------------------------------------------------------------------------

export async function draftTaskInstructions(input: {
  taskId: string;
  actorUserId?: string | null;
  reviewerId?: string | null;
}): Promise<string | null> {
  // Look up the task first so we can derive caseId + title
  const [task] = await db
    .select({
      id: tasks.id,
      caseId: tasks.caseId,
      title: tasks.title,
      description: tasks.description,
      organizationId: tasks.organizationId,
      assignedToId: tasks.assignedToId,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      assigneeFirst: users.firstName,
      assigneeLast: users.lastName,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assignedToId, users.id))
    .where(eq(tasks.id, input.taskId))
    .limit(1);

  if (!task) {
    logger.warn("draftTaskInstructions: task not found", {
      taskId: input.taskId,
    });
    return null;
  }

  const reviewerId =
    input.reviewerId ??
    task.assignedToId ??
    (await resolveReviewer(task.caseId, null));
  const title = `How-to — ${task.title}`.slice(0, 200);

  try {
    const { ctx, promptText } = await loadCtxOrThrow(task.caseId);
    const assignee =
      task.assigneeFirst && task.assigneeLast
        ? `${task.assigneeFirst} ${task.assigneeLast}`
        : "the assignee";
    const prompt = `${SYSTEM_INTRO}

Draft step-by-step instructions for ${assignee} to complete the following task on this case.

Task: ${task.title}
Description: ${task.description ?? "(no description)"}
Priority: ${task.priority}
Due: ${task.dueDate ? task.dueDate.toISOString().split("T")[0] : "no due date"}

Requirements:
- 5 to 10 numbered steps
- Include exactly which case fields / documents to reference
- Call out any SSA deadlines or regulations that apply
- End with a one-line definition of done
- If any step depends on information not in the case file, add a bracketed [TO BE CONFIRMED] note

## Case context
${promptText}

Return only the numbered instructions.`;

    const body = await askClaude(prompt);
    return await persistDraft({
      organizationId: task.organizationId,
      caseId: task.caseId,
      type: "task_instructions",
      title,
      body,
      structuredFields: {
        taskId: task.id,
        taskTitle: task.title,
      },
      assignedReviewerId: reviewerId,
      sourceTaskId: task.id,
      actorUserId: input.actorUserId ?? null,
    });
  } catch (err) {
    return persistErrorDraft({
      organizationId: task.organizationId,
      caseId: task.caseId,
      type: "task_instructions",
      title,
      message: err instanceof Error ? err.message : String(err),
      assignedReviewerId: reviewerId,
      actorUserId: input.actorUserId ?? null,
    });
  }
}

// ---------------------------------------------------------------------------
// RFC letter
// ---------------------------------------------------------------------------

export async function draftRfcLetter(input: {
  caseId: string;
  provider: string;
  actorUserId?: string | null;
  reviewerId?: string | null;
}): Promise<string | null> {
  const organizationId = await withOrg(input.caseId);
  const reviewerId = await resolveReviewer(input.caseId, input.reviewerId);
  const title = `RFC letter — ${input.provider}`;
  try {
    const { ctx, promptText } = await loadCtxOrThrow(input.caseId);
    const prompt = `${SYSTEM_INTRO}

Draft a Residual Functional Capacity (RFC) opinion request letter to "${input.provider}", the treating provider for ${claimantLabel(ctx)}.

The letter must:
- Explain the purpose (supporting a Social Security Disability claim)
- Provide a short, accurate summary of the claimant's relevant diagnoses and treatment history drawn only from the case context below
- Ask the provider to complete the attached RFC form (mental or physical as appropriate)
- Specifically ask them to address: standing/walking tolerance, sitting tolerance, lift/carry, handling/fingering, pace/persistence, absenteeism, off-task percentage, and any applicable limitations for ${claimantLabel(ctx)}'s conditions
- Politely note the SSA appeal deadline if one is present in the case file
- Include a response-due date 21 days from today
- Use [bracketed placeholders] for anything missing

## Case context
${promptText}

Return only the letter body.`;

    const body = await askClaude(prompt);
    return await persistDraft({
      organizationId,
      caseId: input.caseId,
      type: "rfc_letter",
      title,
      body,
      structuredFields: { provider: input.provider },
      assignedReviewerId: reviewerId,
      actorUserId: input.actorUserId ?? null,
    });
  } catch (err) {
    return persistErrorDraft({
      organizationId,
      caseId: input.caseId,
      type: "rfc_letter",
      title,
      message: err instanceof Error ? err.message : String(err),
      assignedReviewerId: reviewerId,
      actorUserId: input.actorUserId ?? null,
    });
  }
}

// ---------------------------------------------------------------------------
// Status update (client-facing)
// ---------------------------------------------------------------------------

export async function draftStatusUpdate(input: {
  caseId: string;
  actorUserId?: string | null;
  reviewerId?: string | null;
}): Promise<string | null> {
  const organizationId = await withOrg(input.caseId);
  const reviewerId = await resolveReviewer(input.caseId, input.reviewerId);
  const title = "Client status update";
  try {
    const { ctx, promptText } = await loadCtxOrThrow(input.caseId);
    const prompt = `${SYSTEM_INTRO}

Draft a short, friendly status update message to ${claimantLabel(ctx)} that they can read in under 60 seconds. Summarize:

- Where their case is today (in plain English, no SSA jargon)
- What the team has done recently
- What the team is waiting on / doing next
- Any action the client needs to take (or "nothing needed from you right now")

Keep it to 4-6 short sentences, warm and reassuring tone. Do not include a subject line. Sign off as "The Hogan Smith Law team".

## Case context
${promptText}

Return only the message body.`;

    const body = await askClaude(prompt);
    return await persistDraft({
      organizationId,
      caseId: input.caseId,
      type: "status_update",
      title,
      body,
      assignedReviewerId: reviewerId,
      actorUserId: input.actorUserId ?? null,
    });
  } catch (err) {
    return persistErrorDraft({
      organizationId,
      caseId: input.caseId,
      type: "status_update",
      title,
      message: err instanceof Error ? err.message : String(err),
      assignedReviewerId: reviewerId,
      actorUserId: input.actorUserId ?? null,
    });
  }
}
