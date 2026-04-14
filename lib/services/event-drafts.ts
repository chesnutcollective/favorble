import "server-only";
import { db } from "@/db/drizzle";
import { aiDrafts, cases, caseAssignments } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { askClaude } from "@/lib/ai/client";
import {
  buildCaseContext,
  formatCaseContextForPrompt,
  type CaseContextBundle,
} from "@/lib/services/case-context";
import { logger } from "@/lib/logger/server";
import { logAiDraftEvent } from "@/lib/services/hipaa-audit";

/**
 * Event-triggered AI draft generators (SA-2).
 *
 * When a supervisor event fires (denial received, unfavorable decision,
 * hearing scheduled, favorable decision, etc.) the event router kicks
 * off the right bundle of drafts from this module.
 *
 * Every function:
 *   1. Loads full case context via `buildCaseContext`
 *   2. Prompts Claude with a role-specific system header
 *   3. Persists an `ai_drafts` row (status = `draft_ready` on success,
 *      `error` on failure)
 *   4. Logs the draft via the HIPAA audit helper
 *   5. Links the draft back to the triggering supervisor event via
 *      `sourceEventId`
 *   6. Returns the new draft id (or null on error)
 *
 * Drafts are never sent directly — they land in the drafts inbox where
 * a human reviewer approves, edits, or rejects them.
 */

const MODEL_ID = "claude-sonnet-4-20250514";
const PROMPT_VERSION = "sa2-2026-04-10";

const SYSTEM_INTRO = `You are a senior paralegal at Hogan Smith Law, a boutique Social Security Disability law firm. You draft professional work product for attorneys and case managers. You are trained on the SSA Blue Book, 20 CFR §§ 404/416, HALLEX, and the POMS. You write in plain, empathetic English. You never fabricate medical facts, dates, diagnoses, or quotes — if a fact is not in the case file, leave a clearly bracketed placeholder like [TO BE CONFIRMED] rather than invent one. Every draft must be reviewable by a human before it leaves the firm.`;

type DraftType =
  | "reconsideration_request"
  | "appeals_council_brief"
  | "pre_hearing_brief"
  | "fee_petition"
  | "client_letter";

type DraftInput = {
  caseId: string;
  eventId: string;
  actorUserId?: string | null;
  reviewerId?: string | null;
};

type DraftCtx = {
  ctx: CaseContextBundle;
  promptText: string;
};

async function loadCtxOrThrow(caseId: string): Promise<DraftCtx> {
  const ctx = await buildCaseContext(caseId);
  if (!ctx) {
    throw new Error(`Case ${caseId} not found or context unavailable`);
  }
  return { ctx, promptText: formatCaseContextForPrompt(ctx) };
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

async function withOrg(caseId: string): Promise<string> {
  const [row] = await db
    .select({ organizationId: cases.organizationId })
    .from(cases)
    .where(eq(cases.id, caseId))
    .limit(1);
  if (!row) throw new Error(`Case ${caseId} not found`);
  return row.organizationId;
}

function claimantLabel(ctx: CaseContextBundle): string {
  if (!ctx.claimant) return "the claimant";
  return `${ctx.claimant.firstName} ${ctx.claimant.lastName}`;
}

async function persistDraft(input: {
  organizationId: string;
  caseId: string;
  type: DraftType;
  title: string;
  body: string;
  structuredFields?: Record<string, unknown> | null;
  assignedReviewerId: string | null;
  sourceEventId: string;
  actorUserId?: string | null;
}): Promise<string> {
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
      sourceEventId: input.sourceEventId,
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
  type: DraftType;
  title: string;
  message: string;
  assignedReviewerId: string | null;
  sourceEventId: string;
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
        sourceEventId: input.sourceEventId,
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

// ---------------------------------------------------------------------------
// Reconsideration request (fires on denial_received)
// ---------------------------------------------------------------------------

export async function draftAppealReconsideration(
  input: DraftInput,
): Promise<string | null> {
  const organizationId = await withOrg(input.caseId);
  const reviewerId = await resolveReviewer(input.caseId, input.reviewerId);
  const title = "Request for Reconsideration";
  try {
    const { ctx, promptText } = await loadCtxOrThrow(input.caseId);
    const prompt = `${SYSTEM_INTRO}

Draft a Request for Reconsideration (SSA-561 cover letter / statement) for ${claimantLabel(ctx)} in response to the recent notice of denial on this case.

Requirements:
- Formal, professional tone; addressed to the SSA field office or DDS
- Reference the claimant's name, SSN placeholder [SSN], and claim number if present in case context
- Cite the denial notice date from case context (or use [DENIAL DATE] if missing)
- Argue why the denial is incorrect, drawing specifically on the case's medical chronology and any diagnoses on file
- Identify any new or additional evidence the firm plans to submit
- Note the 60 + 5 day filing deadline is being met
- Close with a firm signature block placeholder
- Use [bracketed placeholders] for anything not in the case file

## Case context
${promptText}

Return only the letter body. No preface or commentary.`;

    const body = await askClaude(prompt);
    return await persistDraft({
      organizationId,
      caseId: input.caseId,
      type: "reconsideration_request",
      title,
      body,
      assignedReviewerId: reviewerId,
      sourceEventId: input.eventId,
      actorUserId: input.actorUserId ?? null,
    });
  } catch (err) {
    return persistErrorDraft({
      organizationId,
      caseId: input.caseId,
      type: "reconsideration_request",
      title,
      message: err instanceof Error ? err.message : String(err),
      assignedReviewerId: reviewerId,
      sourceEventId: input.eventId,
      actorUserId: input.actorUserId ?? null,
    });
  }
}

// ---------------------------------------------------------------------------
// Appeals Council brief (fires on unfavorable_decision)
// ---------------------------------------------------------------------------

export async function draftAppealsCouncilBrief(
  input: DraftInput,
): Promise<string | null> {
  const organizationId = await withOrg(input.caseId);
  const reviewerId = await resolveReviewer(input.caseId, input.reviewerId);
  const title = "Appeals Council brief";
  try {
    const { ctx, promptText } = await loadCtxOrThrow(input.caseId);
    const prompt = `${SYSTEM_INTRO}

Draft an Appeals Council brief (HA-520 style) for ${claimantLabel(ctx)} in response to an unfavorable ALJ decision on this case.

Requirements:
- Formal legal brief structure: Statement of the Case, Issues Presented, Argument, Conclusion
- Identify specific errors of law, policy, or evidentiary weight in the ALJ decision
- Draw facts from the case context's medical chronology, documents, and stage history
- Cite applicable SSR / HALLEX sections where you know the exact citation; use [citation needed] otherwise
- Note the 60 + 5 day AC filing deadline is being met
- Use [bracketed placeholders] for facts not in the case file
- Target length: a concise 2-4 page brief

## Case context
${promptText}

Return only the brief body.`;

    const body = await askClaude(prompt);
    return await persistDraft({
      organizationId,
      caseId: input.caseId,
      type: "appeals_council_brief",
      title,
      body,
      assignedReviewerId: reviewerId,
      sourceEventId: input.eventId,
      actorUserId: input.actorUserId ?? null,
    });
  } catch (err) {
    return persistErrorDraft({
      organizationId,
      caseId: input.caseId,
      type: "appeals_council_brief",
      title,
      message: err instanceof Error ? err.message : String(err),
      assignedReviewerId: reviewerId,
      sourceEventId: input.eventId,
      actorUserId: input.actorUserId ?? null,
    });
  }
}

// ---------------------------------------------------------------------------
// Pre-hearing brief (fires on hearing_scheduled)
// ---------------------------------------------------------------------------

export async function draftPreHearingBrief(
  input: DraftInput,
): Promise<string | null> {
  const organizationId = await withOrg(input.caseId);
  const reviewerId = await resolveReviewer(input.caseId, input.reviewerId);
  const title = "Pre-hearing brief";
  try {
    const { ctx, promptText } = await loadCtxOrThrow(input.caseId);
    const prompt = `${SYSTEM_INTRO}

Draft a pre-hearing brief for the upcoming ALJ hearing on ${claimantLabel(ctx)}'s disability claim.

Structure:
1. Introduction: claimant identity, claim type, alleged onset date, date last insured (if applicable)
2. Statement of facts: work history, impairments, treatment summary drawn from the medical chronology
3. Legal argument: why the claimant meets or equals a listing, or why the RFC precludes past relevant work and alternative work at step 5
4. Proposed findings for each step of the sequential evaluation
5. Exhibits referenced (pull from the recent documents list)
6. Conclusion: requested relief

Tone: precise, professional, advocacy-forward but grounded in the file. Use [bracketed placeholders] for any fact not in the case context. Note the 5-day evidence rule if applicable.

## Case context
${promptText}

Return only the brief body.`;

    const body = await askClaude(prompt);
    return await persistDraft({
      organizationId,
      caseId: input.caseId,
      type: "pre_hearing_brief",
      title,
      body,
      assignedReviewerId: reviewerId,
      sourceEventId: input.eventId,
      actorUserId: input.actorUserId ?? null,
    });
  } catch (err) {
    return persistErrorDraft({
      organizationId,
      caseId: input.caseId,
      type: "pre_hearing_brief",
      title,
      message: err instanceof Error ? err.message : String(err),
      assignedReviewerId: reviewerId,
      sourceEventId: input.eventId,
      actorUserId: input.actorUserId ?? null,
    });
  }
}

// ---------------------------------------------------------------------------
// Fee petition (fires on favorable_decision)
// ---------------------------------------------------------------------------

export async function draftFeePetition(
  input: DraftInput,
): Promise<string | null> {
  const organizationId = await withOrg(input.caseId);
  const reviewerId = await resolveReviewer(input.caseId, input.reviewerId);
  const title = "Fee petition";
  try {
    const { ctx, promptText } = await loadCtxOrThrow(input.caseId);
    const prompt = `${SYSTEM_INTRO}

Draft a fee petition (SSA-1560) for attorney fees in ${claimantLabel(ctx)}'s favorable decision.

Requirements:
- Formal fee petition structure compliant with 20 CFR § 404.1725 / § 416.1525
- Identify the representative (Hogan Smith Law) and the claimant
- Note the favorable decision date (from stage history or case context)
- Summarize the services rendered, time spent, and complexity of the case — use [HOURS] and [SERVICE DATES] placeholders where the actual data is not available in case context
- Request the fee amount as a percentage of past-due benefits with a cap at the statutory maximum
- Note the 60-day fee petition filing deadline
- Close with attorney signature block placeholder
- Use [bracketed placeholders] for any missing data

## Case context
${promptText}

Return only the petition body.`;

    const body = await askClaude(prompt);
    return await persistDraft({
      organizationId,
      caseId: input.caseId,
      type: "fee_petition",
      title,
      body,
      assignedReviewerId: reviewerId,
      sourceEventId: input.eventId,
      actorUserId: input.actorUserId ?? null,
    });
  } catch (err) {
    return persistErrorDraft({
      organizationId,
      caseId: input.caseId,
      type: "fee_petition",
      title,
      message: err instanceof Error ? err.message : String(err),
      assignedReviewerId: reviewerId,
      sourceEventId: input.eventId,
      actorUserId: input.actorUserId ?? null,
    });
  }
}

// ---------------------------------------------------------------------------
// Client-facing letters (empathetic plain-English)
// ---------------------------------------------------------------------------

export async function draftClientDenialNotification(
  input: DraftInput,
): Promise<string | null> {
  const organizationId = await withOrg(input.caseId);
  const reviewerId = await resolveReviewer(input.caseId, input.reviewerId);
  const title = "Client letter — denial received";
  try {
    const { ctx, promptText } = await loadCtxOrThrow(input.caseId);
    const prompt = `${SYSTEM_INTRO}

Draft a warm, empathetic letter to ${claimantLabel(ctx)} explaining that SSA has denied their claim at this stage and laying out the next steps.

Requirements:
- 7th-grade reading level, no legal jargon
- Lead with empathy: acknowledge the news is hard to hear
- Explain in plain English what happened and why SSA said no
- Explain clearly that this is not the end — the firm will file an appeal on their behalf
- Tell them exactly what the firm is doing next and by when
- Tell them what (if anything) they need to do (often "nothing right now")
- Reassurance + sign-off from "The Hogan Smith Law team"
- Keep it to 4-6 short paragraphs

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
      structuredFields: { trigger: "denial_received" },
      assignedReviewerId: reviewerId,
      sourceEventId: input.eventId,
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
      sourceEventId: input.eventId,
      actorUserId: input.actorUserId ?? null,
    });
  }
}

export async function draftHearingNotification(
  input: DraftInput,
): Promise<string | null> {
  const organizationId = await withOrg(input.caseId);
  const reviewerId = await resolveReviewer(input.caseId, input.reviewerId);
  const title = "Client letter — hearing scheduled";
  try {
    const { ctx, promptText } = await loadCtxOrThrow(input.caseId);
    const prompt = `${SYSTEM_INTRO}

Draft a warm, reassuring letter to ${claimantLabel(ctx)} announcing that their disability hearing has been scheduled and walking them through what to expect.

Requirements:
- 7th-grade reading level, no legal jargon
- State the hearing date, time, and hearing office from the case context (or [HEARING DATE] / [HEARING TIME] placeholders if missing)
- Explain in plain English what the hearing will look like and who will be there (judge, vocational expert, medical expert, claimant, attorney)
- Tell them what the firm will do to prepare (pre-hearing brief, gather records, prep session with the claimant)
- Tell them what they need to do: show up on time, dress neatly, be prepared to answer questions honestly about their daily life and symptoms
- Offer a prep meeting
- Warm sign-off from "The Hogan Smith Law team"
- Keep it to 5-7 short paragraphs

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
      structuredFields: { trigger: "hearing_scheduled" },
      assignedReviewerId: reviewerId,
      sourceEventId: input.eventId,
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
      sourceEventId: input.eventId,
      actorUserId: input.actorUserId ?? null,
    });
  }
}

export async function draftClientFavorableNotification(
  input: DraftInput,
): Promise<string | null> {
  const organizationId = await withOrg(input.caseId);
  const reviewerId = await resolveReviewer(input.caseId, input.reviewerId);
  const title = "Client letter — favorable decision";
  try {
    const { ctx, promptText } = await loadCtxOrThrow(input.caseId);
    const prompt = `${SYSTEM_INTRO}

Draft a warm, celebratory letter to ${claimantLabel(ctx)} announcing that SSA has issued a favorable decision on their disability claim.

Requirements:
- 7th-grade reading level, no legal jargon
- Celebrate the win plainly and warmly
- Explain in plain English what happens next: SSA will calculate past-due benefits, the claimant will receive a Notice of Award, monthly benefits will start, Medicare eligibility if applicable
- Note that the firm will file a fee petition with SSA and the firm's fee comes out of past-due benefits (not the claimant's monthly check)
- Offer to answer any questions
- Warm sign-off from "The Hogan Smith Law team"
- Keep it to 4-6 short paragraphs

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
      structuredFields: { trigger: "favorable_decision" },
      assignedReviewerId: reviewerId,
      sourceEventId: input.eventId,
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
      sourceEventId: input.eventId,
      actorUserId: input.actorUserId ?? null,
    });
  }
}
