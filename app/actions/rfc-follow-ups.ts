"use server";

import { db } from "@/db/drizzle";
import {
  rfcRequests,
  cases,
  leads,
  communications,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";
import {
  logCommunicationEvent,
  logPhiAccess,
} from "@/lib/services/hipaa-audit";

/**
 * Server actions for the Medical Records "Send AI follow-up" workflow.
 *
 * The dialog queries `listPendingProviderFollowUps` to populate a picker
 * of overdue RFC requests. Once a provider + message body is confirmed,
 * `sendProviderFollowUp` writes a communications row (method = email) and
 * stamps the RFC request so the oldest-overdue ordering updates.
 *
 * We intentionally do NOT call an external mail provider here — the
 * outbound integration is owned by `app/actions/mail.ts` and the drafts
 * workflow. This action records a pending communication that the mail
 * clerk / integration can then send downstream.
 */

export type PendingProviderFollowUp = {
  requestId: string;
  caseId: string;
  caseNumber: string;
  claimantName: string;
  providerName: string;
  daysOverdue: number;
  dueDate: string | null;
  requestedAt: string | null;
};

/**
 * Compute a templated follow-up body from provider + claimant metadata.
 * Template only — the real LLM integration is a TODO.
 */
export async function previewProviderFollowUp(data: {
  requestId: string;
}): Promise<{
  body: string;
  target: PendingProviderFollowUp | null;
}> {
  const session = await requireSession();
  const [row] = await db
    .select({
      id: rfcRequests.id,
      caseId: rfcRequests.caseId,
      providerName: rfcRequests.providerName,
      dueDate: rfcRequests.dueDate,
      requestedAt: rfcRequests.requestedAt,
      status: rfcRequests.status,
      caseNumber: cases.caseNumber,
      organizationId: rfcRequests.organizationId,
      leadFirstName: leads.firstName,
      leadLastName: leads.lastName,
    })
    .from(rfcRequests)
    .innerJoin(cases, eq(rfcRequests.caseId, cases.id))
    .leftJoin(leads, eq(cases.leadId, leads.id))
    .where(
      and(
        eq(rfcRequests.id, data.requestId),
        eq(rfcRequests.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!row) {
    return { body: "", target: null };
  }

  const claimantName =
    row.leadFirstName || row.leadLastName
      ? `${row.leadFirstName ?? ""} ${row.leadLastName ?? ""}`.trim()
      : "our client";
  const providerName = row.providerName ?? "Medical Provider";
  const requestedAt = row.requestedAt ? new Date(row.requestedAt) : null;
  const requestedAtLabel = requestedAt
    ? requestedAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "the original request date";
  const daysOverdue = row.dueDate
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(row.dueDate).getTime()) / 86_400_000,
        ),
      )
    : 0;

  // TODO: swap in real LLM generator — for now a deterministic template.
  const body = `Hello ${providerName},

This is a follow-up regarding the medical records request we sent on ${requestedAtLabel} for our client ${claimantName} (case ${row.caseNumber}). The records remain outstanding${
    daysOverdue > 0 ? ` and are now ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} past due` : ""
  }.

As a courtesy reminder, a signed HIPAA authorization for this claimant is already on file with your office. We would appreciate any status you can share, or an updated timeline for fulfillment.

If the records have already been mailed or faxed, please disregard this message and kindly reply with the date of transmission so we can confirm receipt on our end.

Thank you for your continued assistance.

— Hogan Smith Law
Medical Records Team`;

  await logPhiAccess({
    organizationId: row.organizationId,
    userId: session.id,
    entityType: "rfc_request",
    entityId: row.id,
    caseId: row.caseId,
    reason: "provider_followup_preview",
    fieldsAccessed: ["providerName", "claimantName", "caseNumber"],
  });

  return {
    body,
    target: {
      requestId: row.id,
      caseId: row.caseId,
      caseNumber: row.caseNumber ?? "—",
      claimantName,
      providerName,
      daysOverdue,
      dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : null,
      requestedAt: row.requestedAt
        ? new Date(row.requestedAt).toISOString()
        : null,
    },
  };
}

/**
 * List the most overdue pending RFC / provider requests for the org so
 * the picker can show the user an ordered set. Oldest due-date first,
 * falling back to oldest requestedAt.
 */
export async function listPendingProviderFollowUps(
  limit = 20,
): Promise<PendingProviderFollowUp[]> {
  const session = await requireSession();

  try {
    const rows = await db
      .select({
        id: rfcRequests.id,
        caseId: rfcRequests.caseId,
        providerName: rfcRequests.providerName,
        status: rfcRequests.status,
        dueDate: rfcRequests.dueDate,
        requestedAt: rfcRequests.requestedAt,
        caseNumber: cases.caseNumber,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
      })
      .from(rfcRequests)
      .innerJoin(cases, eq(rfcRequests.caseId, cases.id))
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .where(
        and(
          eq(rfcRequests.organizationId, session.organizationId),
          inArray(rfcRequests.status, ["requested", "not_requested"]),
          isNull(cases.deletedAt),
        ),
      )
      .orderBy(asc(rfcRequests.dueDate), asc(rfcRequests.requestedAt))
      .limit(limit);

    const now = Date.now();
    return rows.map((r) => {
      const due = r.dueDate ? new Date(r.dueDate).getTime() : null;
      const daysOverdue =
        due !== null
          ? Math.max(0, Math.floor((now - due) / 86_400_000))
          : 0;
      const claimant =
        r.leadFirstName || r.leadLastName
          ? `${r.leadFirstName ?? ""} ${r.leadLastName ?? ""}`.trim()
          : "Unknown claimant";
      return {
        requestId: r.id,
        caseId: r.caseId,
        caseNumber: r.caseNumber ?? "—",
        claimantName: claimant,
        providerName: r.providerName ?? "—",
        daysOverdue,
        dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : null,
        requestedAt: r.requestedAt
          ? new Date(r.requestedAt).toISOString()
          : null,
      } satisfies PendingProviderFollowUp;
    });
  } catch (err) {
    logger.error("listPendingProviderFollowUps failed", { error: err });
    return [];
  }
}

/**
 * Persist an outbound follow-up for a given RFC request. Records a
 * communications row (type = email_outbound, deliveryStatus = pending)
 * so the downstream mail integration can pick it up for actual send.
 *
 * HIPAA: logs a communication event bound to the case + claimant.
 */
export async function sendProviderFollowUp(
  requestId: string,
  body: string,
): Promise<{
  success: boolean;
  message?: string;
  communicationId?: string;
}> {
  const session = await requireSession();

  if (!body.trim()) {
    return { success: false, message: "Message body is empty" };
  }

  const [row] = await db
    .select({
      id: rfcRequests.id,
      caseId: rfcRequests.caseId,
      organizationId: rfcRequests.organizationId,
      providerName: rfcRequests.providerName,
    })
    .from(rfcRequests)
    .where(
      and(
        eq(rfcRequests.id, requestId),
        eq(rfcRequests.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!row) {
    return { success: false, message: "Request not found" };
  }

  try {
    const subject = `Records follow-up — ${row.providerName ?? "provider"}`;
    const [comm] = await db
      .insert(communications)
      .values({
        organizationId: row.organizationId,
        caseId: row.caseId,
        type: "email_outbound",
        direction: "outbound",
        subject,
        body,
        sourceSystem: "provider_follow_up",
        deliveryStatus: "pending",
        userId: session.id,
        metadata: {
          rfcRequestId: row.id,
          providerName: row.providerName ?? null,
          triggeredBy: "medical_records_subnav",
        },
      })
      .returning({ id: communications.id });

    await db
      .update(rfcRequests)
      .set({ updatedAt: new Date() })
      .where(eq(rfcRequests.id, row.id));

    await logCommunicationEvent({
      organizationId: row.organizationId,
      actorUserId: session.id,
      caseId: row.caseId,
      communicationId: comm.id,
      direction: "outbound",
      method: "email",
      metadata: {
        rfcRequestId: row.id,
        providerName: row.providerName ?? null,
        template: "provider_followup",
      },
    });

    logger.info("sendProviderFollowUp queued", {
      requestId: row.id,
      communicationId: comm.id,
    });

    revalidatePath("/medical-records");
    revalidatePath("/dashboard");

    return {
      success: true,
      communicationId: comm.id,
      message: `Follow-up queued for ${row.providerName ?? "provider"}`,
    };
  } catch (err) {
    logger.error("sendProviderFollowUp failed", {
      error: err,
      requestId,
    });
    return {
      success: false,
      message: err instanceof Error ? err.message : "Send failed",
    };
  }
}
