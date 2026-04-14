"use server";

import { db } from "@/db/drizzle";
import {
  feePetitions,
  feeCollectionFollowUps,
  cases,
  leads,
  communications,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";
import {
  logCommunicationEvent,
  logPhiAccess,
} from "@/lib/services/hipaa-audit";

/**
 * Server actions for the Fee Collection "Send follow-up" workflow.
 *
 * Three dunning tones (polite → firm → escalation) are selectable from
 * the subnav dialog. Each send writes a communications row (direction =
 * outbound) AND a fee_collection_follow_ups row so the collection-rate
 * dashboard can track outreach cadence.
 */

export type DelinquentFeePetition = {
  petitionId: string;
  caseId: string;
  caseNumber: string;
  claimantName: string;
  outstandingCents: number;
  daysSinceApproved: number;
  approvedAt: string | null;
  lastFollowUpAt: string | null;
};

export type DunningTone = "polite" | "firm" | "escalation";

function templateForTone(
  tone: DunningTone,
  ctx: {
    claimant: string;
    caseNumber: string;
    outstandingCents: number;
    daysSinceApproved: number;
  },
): { subject: string; body: string } {
  const dollars = (ctx.outstandingCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  if (tone === "polite") {
    return {
      subject: `Friendly reminder — balance for ${ctx.claimant} (${ctx.caseNumber})`,
      body: `Hello,

This is a courtesy reminder from Hogan Smith Law. A balance of ${dollars} remains outstanding for ${ctx.claimant} (case ${ctx.caseNumber}).

We understand life gets busy, and we want to make this as easy as possible. If you've already sent payment, please disregard this note. Otherwise, we would appreciate a response with your preferred timeline or a payment plan that works for you.

You can reach us directly at your convenience. Thank you in advance for your attention to this.

Warm regards,
Fee Collection Team
Hogan Smith Law`,
    };
  }

  if (tone === "firm") {
    return {
      subject: `Second notice — balance outstanding (${ctx.caseNumber})`,
      body: `Hello,

This is our second notice regarding the outstanding balance of ${dollars} on your file with Hogan Smith Law (case ${ctx.caseNumber}). The fee was approved ${ctx.daysSinceApproved} days ago and remains unpaid.

We would like to resolve this promptly. Please respond within seven (7) business days of this message with either full payment or a concrete payment schedule.

If there is a dispute or a hardship we should be aware of, please contact us directly — we're here to work with you.

Regards,
Fee Collection Team
Hogan Smith Law`,
    };
  }

  return {
    subject: `Final notice — ${ctx.claimant} (${ctx.caseNumber})`,
    body: `This is a final notice regarding the outstanding balance of ${dollars} owed to Hogan Smith Law on case ${ctx.caseNumber}. The fee was approved ${ctx.daysSinceApproved} days ago and has not been resolved despite prior outreach.

Unless we receive full payment, or enter into a written payment plan, within seven (7) calendar days of this notice, this account will be referred for additional collection review.

If you would like to resolve this matter directly, please contact our Fee Collection Team immediately.

Regards,
Fee Collection Team
Hogan Smith Law`,
  };
}

/**
 * Generate the preview body for a specific petition + tone, without
 * persisting anything. Used by the dialog's "Preview" step.
 */
export async function previewFeeCollectionFollowUp(data: {
  petitionId: string;
  tone: DunningTone;
}): Promise<{
  subject: string;
  body: string;
  target: DelinquentFeePetition | null;
}> {
  const session = await requireSession();
  const [row] = await db
    .select({
      id: feePetitions.id,
      caseId: feePetitions.caseId,
      organizationId: feePetitions.organizationId,
      approvedAt: feePetitions.approvedAt,
      approvedAmountCents: feePetitions.approvedAmountCents,
      collectedAmountCents: feePetitions.collectedAmountCents,
      caseNumber: cases.caseNumber,
      leadFirstName: leads.firstName,
      leadLastName: leads.lastName,
    })
    .from(feePetitions)
    .innerJoin(cases, eq(feePetitions.caseId, cases.id))
    .leftJoin(leads, eq(cases.leadId, leads.id))
    .where(
      and(
        eq(feePetitions.id, data.petitionId),
        eq(feePetitions.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!row) {
    return {
      subject: "",
      body: "",
      target: null,
    };
  }

  const claimantName =
    row.leadFirstName || row.leadLastName
      ? `${row.leadFirstName ?? ""} ${row.leadLastName ?? ""}`.trim()
      : "Claimant";
  const outstanding = Math.max(
    0,
    (row.approvedAmountCents ?? 0) - (row.collectedAmountCents ?? 0),
  );
  const approvedAtMs = row.approvedAt
    ? new Date(row.approvedAt).getTime()
    : null;
  const daysSinceApproved = approvedAtMs
    ? Math.max(0, Math.floor((Date.now() - approvedAtMs) / 86_400_000))
    : 0;

  // TODO: swap in real LLM generator — for now deterministic templates.
  const template = templateForTone(data.tone, {
    claimant: claimantName,
    caseNumber: row.caseNumber ?? "—",
    outstandingCents: outstanding,
    daysSinceApproved,
  });

  await logPhiAccess({
    organizationId: row.organizationId,
    userId: session.id,
    entityType: "fee_petition",
    entityId: row.id,
    caseId: row.caseId,
    reason: "fee_followup_preview",
    fieldsAccessed: ["caseNumber", "claimantName", "balance"],
    metadata: { tone: data.tone },
  });

  return {
    subject: template.subject,
    body: template.body,
    target: {
      petitionId: row.id,
      caseId: row.caseId,
      caseNumber: row.caseNumber ?? "—",
      claimantName,
      outstandingCents: outstanding,
      daysSinceApproved,
      approvedAt: row.approvedAt ? new Date(row.approvedAt).toISOString() : null,
      lastFollowUpAt: null,
    },
  };
}

/**
 * List delinquent petitions for the picker: approved with an outstanding
 * balance, ordered by oldest approval date first.
 */
export async function listDelinquentFeePetitions(
  limit = 20,
): Promise<DelinquentFeePetition[]> {
  const session = await requireSession();

  try {
    const rows = await db
      .select({
        id: feePetitions.id,
        caseId: feePetitions.caseId,
        approvedAt: feePetitions.approvedAt,
        approvedAmountCents: feePetitions.approvedAmountCents,
        collectedAmountCents: feePetitions.collectedAmountCents,
        caseNumber: cases.caseNumber,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
      })
      .from(feePetitions)
      .innerJoin(cases, eq(feePetitions.caseId, cases.id))
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .where(
        and(
          eq(feePetitions.organizationId, session.organizationId),
          inArray(feePetitions.status, ["approved", "filed", "pending"]),
        ),
      )
      .orderBy(asc(feePetitions.approvedAt), asc(feePetitions.filedAt))
      .limit(limit * 3);

    const now = Date.now();
    return rows
      .map((r) => {
        const outstanding = Math.max(
          0,
          (r.approvedAmountCents ?? 0) - (r.collectedAmountCents ?? 0),
        );
        const approvedAtMs = r.approvedAt
          ? new Date(r.approvedAt).getTime()
          : null;
        const daysSinceApproved = approvedAtMs
          ? Math.max(0, Math.floor((now - approvedAtMs) / 86_400_000))
          : 0;
        const claimantName =
          r.leadFirstName || r.leadLastName
            ? `${r.leadFirstName ?? ""} ${r.leadLastName ?? ""}`.trim()
            : "Unknown claimant";
        return {
          petitionId: r.id,
          caseId: r.caseId,
          caseNumber: r.caseNumber ?? "—",
          claimantName,
          outstandingCents: outstanding,
          daysSinceApproved,
          approvedAt: r.approvedAt
            ? new Date(r.approvedAt).toISOString()
            : null,
          lastFollowUpAt: null,
        } satisfies DelinquentFeePetition;
      })
      .filter((r) => r.outstandingCents > 0 || r.daysSinceApproved > 0)
      .slice(0, limit);
  } catch (err) {
    logger.error("listDelinquentFeePetitions failed", { error: err });
    return [];
  }
}

/**
 * Record and queue a fee collection follow-up. Inserts:
 *   1. A communications row (type = email_outbound, deliveryStatus = pending)
 *   2. A fee_collection_follow_ups row (method = email) so the metrics
 *      dashboard can compute follow-up cadence.
 */
export async function sendFeeCollectionFollowUp(
  petitionId: string,
  template: DunningTone,
): Promise<{
  success: boolean;
  message?: string;
  communicationId?: string;
}> {
  const session = await requireSession();

  const [row] = await db
    .select({
      id: feePetitions.id,
      caseId: feePetitions.caseId,
      organizationId: feePetitions.organizationId,
      approvedAt: feePetitions.approvedAt,
      approvedAmountCents: feePetitions.approvedAmountCents,
      collectedAmountCents: feePetitions.collectedAmountCents,
      caseNumber: cases.caseNumber,
      leadFirstName: leads.firstName,
      leadLastName: leads.lastName,
    })
    .from(feePetitions)
    .innerJoin(cases, eq(feePetitions.caseId, cases.id))
    .leftJoin(leads, eq(cases.leadId, leads.id))
    .where(
      and(
        eq(feePetitions.id, petitionId),
        eq(feePetitions.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!row) {
    return { success: false, message: "Petition not found" };
  }

  const claimantName =
    row.leadFirstName || row.leadLastName
      ? `${row.leadFirstName ?? ""} ${row.leadLastName ?? ""}`.trim()
      : "Claimant";
  const outstanding = Math.max(
    0,
    (row.approvedAmountCents ?? 0) - (row.collectedAmountCents ?? 0),
  );
  const daysSinceApproved = row.approvedAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(row.approvedAt).getTime()) / 86_400_000,
        ),
      )
    : 0;

  const { subject, body } = templateForTone(template, {
    claimant: claimantName,
    caseNumber: row.caseNumber ?? "—",
    outstandingCents: outstanding,
    daysSinceApproved,
  });

  try {
    const [comm] = await db
      .insert(communications)
      .values({
        organizationId: row.organizationId,
        caseId: row.caseId,
        type: "email_outbound",
        direction: "outbound",
        subject,
        body,
        sourceSystem: "fee_collection_follow_up",
        deliveryStatus: "pending",
        userId: session.id,
        metadata: {
          feePetitionId: row.id,
          template,
          outstandingCents: outstanding,
          triggeredBy: "fee_collection_subnav",
        },
      })
      .returning({ id: communications.id });

    await db.insert(feeCollectionFollowUps).values({
      organizationId: row.organizationId,
      feePetitionId: row.id,
      followedUpBy: session.id,
      method: "email",
      outcome: "contacted",
      notes: `Automated follow-up (${template}) — communication ${comm.id}`,
    });

    await logCommunicationEvent({
      organizationId: row.organizationId,
      actorUserId: session.id,
      caseId: row.caseId,
      communicationId: comm.id,
      direction: "outbound",
      method: "email",
      metadata: {
        feePetitionId: row.id,
        template,
      },
    });

    logger.info("sendFeeCollectionFollowUp queued", {
      petitionId: row.id,
      communicationId: comm.id,
      template,
    });

    revalidatePath("/fee-collection");
    revalidatePath("/dashboard");

    return {
      success: true,
      communicationId: comm.id,
      message: `${template} follow-up queued for ${claimantName}`,
    };
  } catch (err) {
    logger.error("sendFeeCollectionFollowUp failed", {
      error: err,
      petitionId,
    });
    return {
      success: false,
      message: err instanceof Error ? err.message : "Send failed",
    };
  }
}
