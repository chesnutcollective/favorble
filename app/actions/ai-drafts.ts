"use server";

import { requireSession } from "@/lib/auth/session";
import {
  draftMedicalRecordsRequest as svcDraftMedicalRecordsRequest,
  draftClientLetter as svcDraftClientLetter,
  draftCallScript as svcDraftCallScript,
  draftTaskInstructions as svcDraftTaskInstructions,
  draftRfcLetter as svcDraftRfcLetter,
  draftStatusUpdate as svcDraftStatusUpdate,
  resolveReviewerForCase,
  type CallScriptType,
} from "@/lib/services/ai-drafts";
import { db } from "@/db/drizzle";
import { aiDrafts, cases, communications, documents, leads } from "@/db/schema";
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { logAiDraftEvent } from "@/lib/services/hipaa-audit";
import { logger } from "@/lib/logger/server";
import { revalidatePath } from "next/cache";

/**
 * Server-action wrappers around the AI draft generators in
 * `lib/services/ai-drafts.ts`. Every action is session-gated and
 * revalidates the drafts inbox so the new row shows up immediately.
 */

export async function createMedicalRecordsRequestDraft(data: {
  caseId: string;
  provider: string;
  recordsSought: string;
  dateRange?: string;
}): Promise<{ draftId: string | null }> {
  const session = await requireSession();
  const draftId = await svcDraftMedicalRecordsRequest({
    caseId: data.caseId,
    provider: data.provider,
    recordsSought: data.recordsSought,
    dateRange: data.dateRange,
    actorUserId: session.id,
  });
  revalidatePath("/drafts");
  revalidatePath(`/cases/${data.caseId}/tasks`);
  return { draftId };
}

export async function createClientLetterDraft(data: {
  caseId: string;
  purpose: string;
  tone?: "warm" | "formal" | "neutral";
}): Promise<{ draftId: string | null }> {
  const session = await requireSession();
  const draftId = await svcDraftClientLetter({
    caseId: data.caseId,
    purpose: data.purpose,
    tone: data.tone,
    actorUserId: session.id,
  });
  revalidatePath("/drafts");
  revalidatePath(`/cases/${data.caseId}/tasks`);
  return { draftId };
}

export async function createCallScriptDraft(data: {
  caseId: string;
  callType: CallScriptType;
  scenario: string;
  counterparty: string;
}): Promise<{ draftId: string | null }> {
  const session = await requireSession();
  const draftId = await svcDraftCallScript({
    caseId: data.caseId,
    callType: data.callType,
    scenario: data.scenario,
    counterparty: data.counterparty,
    actorUserId: session.id,
  });
  revalidatePath("/drafts");
  revalidatePath(`/cases/${data.caseId}/tasks`);
  return { draftId };
}

export async function createTaskInstructionsDraft(data: {
  taskId: string;
  caseId?: string;
}): Promise<{ draftId: string | null }> {
  const session = await requireSession();
  const draftId = await svcDraftTaskInstructions({
    taskId: data.taskId,
    actorUserId: session.id,
  });
  revalidatePath("/drafts");
  if (data.caseId) revalidatePath(`/cases/${data.caseId}/tasks`);
  return { draftId };
}

export async function createRfcLetterDraft(data: {
  caseId: string;
  provider: string;
}): Promise<{ draftId: string | null }> {
  const session = await requireSession();
  const draftId = await svcDraftRfcLetter({
    caseId: data.caseId,
    provider: data.provider,
    actorUserId: session.id,
  });
  revalidatePath("/drafts");
  revalidatePath(`/cases/${data.caseId}/tasks`);
  return { draftId };
}

export async function createStatusUpdateDraft(data: {
  caseId: string;
}): Promise<{ draftId: string | null }> {
  const session = await requireSession();
  const draftId = await svcDraftStatusUpdate({
    caseId: data.caseId,
    actorUserId: session.id,
  });
  revalidatePath("/drafts");
  revalidatePath(`/cases/${data.caseId}/tasks`);
  return { draftId };
}

/**
 * Update a draft's body from the review UI (autosave-style). Does NOT
 * change status — the reviewer still needs to explicitly approve.
 */
export async function updateDraftBody(data: {
  draftId: string;
  body: string;
  title?: string;
}): Promise<{ ok: boolean }> {
  const session = await requireSession();
  const [row] = await db
    .select({
      id: aiDrafts.id,
      organizationId: aiDrafts.organizationId,
      caseId: aiDrafts.caseId,
      type: aiDrafts.type,
    })
    .from(aiDrafts)
    .where(eq(aiDrafts.id, data.draftId))
    .limit(1);
  if (!row) return { ok: false };
  if (row.organizationId !== session.organizationId) return { ok: false };

  await db
    .update(aiDrafts)
    .set({
      body: data.body,
      title: data.title ?? undefined,
      status: "in_review",
      updatedAt: new Date(),
    })
    .where(eq(aiDrafts.id, data.draftId));

  await logAiDraftEvent({
    organizationId: row.organizationId,
    actorUserId: session.id,
    caseId: row.caseId,
    draftId: row.id,
    draftType: row.type,
    action: "ai_draft_updated",
  });

  revalidatePath("/drafts");
  revalidatePath(`/drafts/${data.draftId}`);
  return { ok: true };
}

/**
 * Approve a draft. Depending on type, we either:
 *  - insert a communications row (client_letter, client_message, call_script, status_update)
 *  - insert a documents row (everything else — the reviewer can then
 *    open it in the document detail page)
 * and then update the draft to `approved` with the artifact id stamped.
 */
export async function approveDraft(data: {
  draftId: string;
  body: string;
  title?: string;
}): Promise<{ ok: boolean; artifactId?: string }> {
  const session = await requireSession();
  const [draft] = await db
    .select()
    .from(aiDrafts)
    .where(eq(aiDrafts.id, data.draftId))
    .limit(1);
  if (!draft) return { ok: false };
  if (draft.organizationId !== session.organizationId) return { ok: false };

  const now = new Date();
  const finalBody = data.body;
  const finalTitle = data.title ?? draft.title;

  let approvedCommunicationId: string | null = null;
  let approvedDocumentId: string | null = null;

  const commTypes = new Set([
    "client_message",
    "client_letter",
    "call_script",
    "status_update",
  ]);

  if (draft.caseId && commTypes.has(draft.type)) {
    const [comm] = await db
      .insert(communications)
      .values({
        organizationId: draft.organizationId,
        caseId: draft.caseId,
        type: "message_outbound",
        direction: "outbound",
        subject: finalTitle,
        body: finalBody,
        sourceSystem: "ai_draft",
        metadata: {
          draftId: draft.id,
          draftType: draft.type,
          approvedBy: session.id,
        },
      })
      .returning({ id: communications.id });
    approvedCommunicationId = comm.id;
  } else if (draft.caseId) {
    // Persist as a stub document. The reviewer can download/print from
    // the document detail page. We use a data: URL of the text body as
    // the storagePath so downstream ingest can pick it up.
    const encoded = Buffer.from(finalBody, "utf-8").toString("base64");
    const storagePath = `data:text/plain;base64,${encoded}`;
    const [doc] = await db
      .insert(documents)
      .values({
        organizationId: draft.organizationId,
        caseId: draft.caseId,
        fileName: `${finalTitle.replace(/[^a-z0-9]+/gi, "_")}.txt`,
        fileType: "text/plain",
        storagePath,
        source: "template",
        category: draft.type,
        description: finalTitle,
        metadata: {
          draftId: draft.id,
          draftType: draft.type,
          approvedBy: session.id,
        },
      })
      .returning({ id: documents.id });
    approvedDocumentId = doc.id;
  }

  await db
    .update(aiDrafts)
    .set({
      status: "approved",
      body: finalBody,
      title: finalTitle,
      approvedAt: now,
      approvedBy: session.id,
      approvedCommunicationId,
      approvedDocumentId,
      updatedAt: now,
    })
    .where(eq(aiDrafts.id, draft.id));

  await logAiDraftEvent({
    organizationId: draft.organizationId,
    actorUserId: session.id,
    caseId: draft.caseId,
    draftId: draft.id,
    draftType: draft.type,
    action: "ai_draft_approved",
    metadata: {
      approvedCommunicationId,
      approvedDocumentId,
    },
  });

  revalidatePath("/drafts");
  revalidatePath(`/drafts/${data.draftId}`);
  return {
    ok: true,
    artifactId: approvedCommunicationId ?? approvedDocumentId ?? undefined,
  };
}

export async function rejectDraft(data: {
  draftId: string;
  reason?: string;
}): Promise<{ ok: boolean }> {
  const session = await requireSession();
  const [draft] = await db
    .select()
    .from(aiDrafts)
    .where(eq(aiDrafts.id, data.draftId))
    .limit(1);
  if (!draft) return { ok: false };
  if (draft.organizationId !== session.organizationId) return { ok: false };

  await db
    .update(aiDrafts)
    .set({
      status: "rejected",
      errorMessage: data.reason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(aiDrafts.id, data.draftId));

  await logAiDraftEvent({
    organizationId: draft.organizationId,
    actorUserId: session.id,
    caseId: draft.caseId,
    draftId: draft.id,
    draftType: draft.type,
    action: "ai_draft_rejected",
    metadata: { reason: data.reason ?? null },
  });

  revalidatePath("/drafts");
  revalidatePath(`/drafts/${data.draftId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Case picker + template drafts for pre-hearing brief and PHI sheet.
// These two actions are template-only (no LLM call) — a row is inserted in
// `ai_drafts` with status `draft_ready` so the reviewer can refine in the
// drafts inbox. TODO: swap templates for real LLM generator once the
// infrastructure for long-form case-context prompts is available from the
// subnav dialog.
// ---------------------------------------------------------------------------

export type HearingCasePickerRow = {
  caseId: string;
  caseNumber: string;
  claimantName: string;
  hearingDate: string | null;
  daysUntilHearing: number | null;
};

export type PhiSheetCasePickerRow = {
  caseId: string;
  caseNumber: string;
  claimantName: string;
  phiSheetStatus: string | null;
  hearingDate: string | null;
  daysUntilHearing: number | null;
};

/**
 * List active cases with a hearing in the next N days (default 14) so the
 * pre-hearing prep picker can show the oldest-hearing-first queue.
 */
export async function listUpcomingHearingCases(
  horizonDays = 14,
): Promise<HearingCasePickerRow[]> {
  const session = await requireSession();

  const now = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + horizonDays);

  try {
    const rows = await db
      .select({
        caseId: cases.id,
        caseNumber: cases.caseNumber,
        hearingDate: cases.hearingDate,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
      })
      .from(cases)
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .where(
        and(
          eq(cases.organizationId, session.organizationId),
          isNull(cases.deletedAt),
          eq(cases.status, "active"),
          gte(cases.hearingDate, now),
          lte(cases.hearingDate, horizon),
        ),
      )
      .orderBy(asc(cases.hearingDate))
      .limit(50);

    return rows.map((r) => {
      const hearing = r.hearingDate ? new Date(r.hearingDate) : null;
      const daysUntil = hearing
        ? Math.ceil((hearing.getTime() - now.getTime()) / 86_400_000)
        : null;
      const claimant =
        r.leadFirstName || r.leadLastName
          ? `${r.leadFirstName ?? ""} ${r.leadLastName ?? ""}`.trim()
          : "Unknown claimant";
      return {
        caseId: r.caseId,
        caseNumber: r.caseNumber,
        claimantName: claimant,
        hearingDate: hearing ? hearing.toISOString() : null,
        daysUntilHearing: daysUntil,
      } satisfies HearingCasePickerRow;
    });
  } catch (err) {
    logger.error("listUpcomingHearingCases failed", { error: err });
    return [];
  }
}

/**
 * List active cases needing a PHI sheet (status unassigned / assigned /
 * in_progress). Ordered by soonest hearing first so the draft generator
 * bites off the most urgent sheets.
 */
export async function listCasesNeedingPhiSheet(
  limit = 50,
): Promise<PhiSheetCasePickerRow[]> {
  const session = await requireSession();

  const now = new Date();

  try {
    const rows = await db
      .select({
        caseId: cases.id,
        caseNumber: cases.caseNumber,
        phiSheetStatus: cases.phiSheetStatus,
        hearingDate: cases.hearingDate,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
      })
      .from(cases)
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .where(
        and(
          eq(cases.organizationId, session.organizationId),
          isNull(cases.deletedAt),
          eq(cases.status, "active"),
        ),
      )
      .orderBy(asc(cases.hearingDate))
      .limit(limit * 2);

    return rows
      .filter((r) => {
        const s = (r.phiSheetStatus ?? "unassigned").toLowerCase();
        return s !== "complete";
      })
      .map((r) => {
        const hearing = r.hearingDate ? new Date(r.hearingDate) : null;
        const daysUntil = hearing
          ? Math.ceil((hearing.getTime() - now.getTime()) / 86_400_000)
          : null;
        const claimant =
          r.leadFirstName || r.leadLastName
            ? `${r.leadFirstName ?? ""} ${r.leadLastName ?? ""}`.trim()
            : "Unknown claimant";
        return {
          caseId: r.caseId,
          caseNumber: r.caseNumber,
          claimantName: claimant,
          phiSheetStatus: r.phiSheetStatus ?? "unassigned",
          hearingDate: hearing ? hearing.toISOString() : null,
          daysUntilHearing: daysUntil,
        } satisfies PhiSheetCasePickerRow;
      })
      .slice(0, limit);
  } catch (err) {
    logger.error("listCasesNeedingPhiSheet failed", { error: err });
    return [];
  }
}

async function getCaseForTemplate(caseId: string, organizationId: string) {
  const [row] = await db
    .select({
      id: cases.id,
      organizationId: cases.organizationId,
      caseNumber: cases.caseNumber,
      hearingDate: cases.hearingDate,
      allegedOnsetDate: cases.allegedOnsetDate,
      hearingOffice: cases.hearingOffice,
      adminLawJudge: cases.adminLawJudge,
      phiSheetStatus: cases.phiSheetStatus,
      leadFirstName: leads.firstName,
      leadLastName: leads.lastName,
    })
    .from(cases)
    .leftJoin(leads, eq(cases.leadId, leads.id))
    .where(and(eq(cases.id, caseId), eq(cases.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

function formatTemplateDate(d: Date | null | undefined): string {
  if (!d) return "[TO BE CONFIRMED]";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Create a pre-hearing brief AI draft. Template-only stub — fills a
 * structured outline from case metadata and leaves [TO BE CONFIRMED]
 * placeholders for anything missing. Persists directly via `ai_drafts`
 * with type=pre_hearing_brief so the reviewer can open it in
 * `/drafts/{id}` and refine.
 */
export async function createPreHearingBriefDraft(data: {
  caseId: string;
}): Promise<{
  success: boolean;
  draftId?: string;
  message?: string;
}> {
  const session = await requireSession();

  const row = await getCaseForTemplate(data.caseId, session.organizationId);
  if (!row) {
    return { success: false, message: "Case not found" };
  }

  const claimant =
    row.leadFirstName || row.leadLastName
      ? `${row.leadFirstName ?? ""} ${row.leadLastName ?? ""}`.trim()
      : "[Claimant]";
  const title = `Pre-hearing brief — ${claimant} (${row.caseNumber})`;

  // TODO: replace with real LLM brief generator once case-context
  // retrieval is wired from the subnav. For now this is a structured
  // template scaffold the reviewer will refine in the drafts inbox.
  const body = `PRE-HEARING BRIEF — DRAFT
Case: ${row.caseNumber}
Claimant: ${claimant}
Hearing date: ${formatTemplateDate(row.hearingDate)}
Hearing office: ${row.hearingOffice ?? "[TO BE CONFIRMED]"}
Presiding ALJ: ${row.adminLawJudge ?? "[TO BE CONFIRMED]"}

I. STATEMENT OF THE CASE
   [TO BE CONFIRMED — procedural history: application date, initial denial, reconsideration, hearing request]

II. ISSUES PRESENTED
   1. Whether the claimant meets or equals a listing.
   2. Whether the claimant retains the residual functional capacity to perform past relevant work or other work existing in significant numbers in the national economy.

III. ALLEGED ONSET DATE
   ${formatTemplateDate(row.allegedOnsetDate)}

IV. SUMMARY OF MEDICAL EVIDENCE
   [TO BE CONFIRMED — populate from chronology / medical chronicle]

V. VOCATIONAL PROFILE
   [TO BE CONFIRMED — age, education, past relevant work]

VI. THEORY OF THE CASE
   [TO BE CONFIRMED — primary theory (listing match / grid rule / RFC argument)]

VII. ANTICIPATED VE TESTIMONY
   [TO BE CONFIRMED — hypotheticals to pose]

VIII. CONCLUSION
   Based on the evidence of record and applicable SSA regulations, the claimant should be found disabled as of the alleged onset date.

— Hogan Smith Law
Pre-hearing prep team`;

  try {
    const reviewerId = await resolveReviewerForCase(row.id);
    const [inserted] = await db
      .insert(aiDrafts)
      .values({
        organizationId: row.organizationId,
        caseId: row.id,
        type: "pre_hearing_brief",
        status: "draft_ready",
        title,
        body,
        assignedReviewerId: reviewerId,
        promptVersion: "template-v1",
        model: "template",
        structuredFields: {
          caseNumber: row.caseNumber,
          hearingDate: row.hearingDate
            ? new Date(row.hearingDate).toISOString()
            : null,
          hearingOffice: row.hearingOffice ?? null,
          adminLawJudge: row.adminLawJudge ?? null,
        },
      })
      .returning({ id: aiDrafts.id });

    await logAiDraftEvent({
      organizationId: row.organizationId,
      actorUserId: session.id,
      caseId: row.id,
      draftId: inserted.id,
      draftType: "pre_hearing_brief",
      action: "ai_draft_created",
      metadata: { source: "pre_hearing_prep_subnav", template: true },
    });

    revalidatePath("/drafts");
    revalidatePath(`/cases/${row.id}`);

    return {
      success: true,
      draftId: inserted.id,
      message: `Pre-hearing brief drafted for ${claimant}`,
    };
  } catch (err) {
    logger.error("createPreHearingBriefDraft failed", {
      error: err,
      caseId: row.id,
    });
    return {
      success: false,
      message: err instanceof Error ? err.message : "Draft generation failed",
    };
  }
}

/**
 * Create a PHI sheet AI draft. Template-only stub — structured outline
 * from case metadata. Persists via `ai_drafts` with type=phi_sheet.
 * The `phi_sheet` enum value was added in supabase migration
 * 20260413120000_add_phi_sheet_ai_draft_type.sql.
 */
export async function createPhiSheetDraft(data: {
  caseId: string;
}): Promise<{
  success: boolean;
  draftId?: string;
  message?: string;
}> {
  const session = await requireSession();

  const row = await getCaseForTemplate(data.caseId, session.organizationId);
  if (!row) {
    return { success: false, message: "Case not found" };
  }

  const claimant =
    row.leadFirstName || row.leadLastName
      ? `${row.leadFirstName ?? ""} ${row.leadLastName ?? ""}`.trim()
      : "[Claimant]";
  const title = `PHI sheet — ${claimant} (${row.caseNumber})`;

  // TODO: replace with real LLM generator once chronology lookup is wired
  // into the subnav dialog. Template scaffold only.
  const body = `PRE-HEARING INTELLIGENCE (PHI) SHEET — DRAFT
Case: ${row.caseNumber}
Claimant: ${claimant}
Hearing date: ${formatTemplateDate(row.hearingDate)}
Presiding ALJ: ${row.adminLawJudge ?? "[TO BE CONFIRMED]"}
Hearing office: ${row.hearingOffice ?? "[TO BE CONFIRMED]"}
Alleged onset date: ${formatTemplateDate(row.allegedOnsetDate)}

1. THEORY OF THE CASE
   [TO BE CONFIRMED — one-sentence primary theory]

2. KEY EXHIBITS (with page refs)
   [TO BE CONFIRMED — top 5 medical exhibits the attorney should have open]

3. LISTINGS / GRID RULES IN PLAY
   [TO BE CONFIRMED]

4. STRONGEST FACTS FOR THE CLAIMANT
   - [TO BE CONFIRMED]
   - [TO BE CONFIRMED]
   - [TO BE CONFIRMED]

5. LIKELY ALJ CONCERNS & RESPONSES
   - [TO BE CONFIRMED]

6. CLIENT PREP NOTES
   - Background / temperament: [TO BE CONFIRMED]
   - Topics to reinforce: [TO BE CONFIRMED]
   - Topics to soften: [TO BE CONFIRMED]

7. VE CROSS-EXAM PREP
   - [TO BE CONFIRMED]

8. OPEN QUESTIONS FOR THE TEAM
   - [TO BE CONFIRMED]

— Hogan Smith Law
PHI sheet team`;

  try {
    const reviewerId = await resolveReviewerForCase(row.id);
    const [inserted] = await db
      .insert(aiDrafts)
      .values({
        organizationId: row.organizationId,
        caseId: row.id,
        type: "phi_sheet",
        status: "draft_ready",
        title,
        body,
        assignedReviewerId: reviewerId,
        promptVersion: "template-v1",
        model: "template",
        structuredFields: {
          caseNumber: row.caseNumber,
          hearingDate: row.hearingDate
            ? new Date(row.hearingDate).toISOString()
            : null,
          phiSheetStatusAtDraft: row.phiSheetStatus ?? null,
        },
      })
      .returning({ id: aiDrafts.id });

    await logAiDraftEvent({
      organizationId: row.organizationId,
      actorUserId: session.id,
      caseId: row.id,
      draftId: inserted.id,
      draftType: "phi_sheet",
      action: "ai_draft_created",
      metadata: { source: "phi_sheet_writer_subnav", template: true },
    });

    revalidatePath("/drafts");
    revalidatePath("/phi-writer");
    revalidatePath(`/cases/${row.id}`);

    return {
      success: true,
      draftId: inserted.id,
      message: `PHI sheet drafted for ${claimant}`,
    };
  } catch (err) {
    logger.error("createPhiSheetDraft failed", {
      error: err,
      caseId: row.id,
    });
    return {
      success: false,
      message: err instanceof Error ? err.message : "Draft generation failed",
    };
  }
}
