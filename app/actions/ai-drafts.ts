"use server";

import { requireSession } from "@/lib/auth/session";
import {
  draftMedicalRecordsRequest as svcDraftMedicalRecordsRequest,
  draftClientLetter as svcDraftClientLetter,
  draftCallScript as svcDraftCallScript,
  draftTaskInstructions as svcDraftTaskInstructions,
  draftRfcLetter as svcDraftRfcLetter,
  draftStatusUpdate as svcDraftStatusUpdate,
  type CallScriptType,
} from "@/lib/services/ai-drafts";
import { db } from "@/db/drizzle";
import { aiDrafts, communications, documents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAiDraftEvent } from "@/lib/services/hipaa-audit";
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
