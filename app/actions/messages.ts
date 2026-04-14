"use server";

import { db } from "@/db/drizzle";
import { communications, cases } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";
import * as caseStatusClient from "@/lib/integrations/case-status";
import { logCommunicationEvent } from "@/lib/services/hipaa-audit";
import { enqueueOutboundMessageReview } from "@/lib/services/message-qa";

/**
 * Send an outbound message on a case.
 * Inserts into communications and optionally forwards to Case Status.
 */
export async function sendCaseMessage(data: { caseId: string; body: string }) {
  const session = await requireSession();

  // Insert local record
  const [message] = await db
    .insert(communications)
    .values({
      organizationId: session.organizationId,
      caseId: data.caseId,
      type: "message_outbound",
      direction: "outbound",
      body: data.body,
      fromAddress: `${session.firstName} ${session.lastName}`,
      userId: session.id,
    })
    .returning();

  logger.info("Outbound message sent", {
    messageId: message.id,
    caseId: data.caseId,
  });

  // QA-2: schedule a Claude quality review of the outbound message once
  // this action has responded. Runs async via `after()` so the client
  // send path never waits for the LLM round-trip.
  enqueueOutboundMessageReview({ communicationId: message.id });

  let deliveredVia = "local_only";

  // If Case Status is configured, also send through their API
  if (caseStatusClient.isConfigured()) {
    try {
      const [caseRecord] = await db
        .select({ caseStatusExternalId: cases.caseStatusExternalId })
        .from(cases)
        .where(eq(cases.id, data.caseId))
        .limit(1);

      if (caseRecord?.caseStatusExternalId) {
        await caseStatusClient.sendMessage(
          caseRecord.caseStatusExternalId,
          data.body,
          `${session.firstName} ${session.lastName}`,
        );
        deliveredVia = "case_status";
      }
    } catch (error) {
      logger.error("Case Status forwarding failed", { error });
      // Non-fatal — the local message was saved
    }
  }

  // Audit: record that a message was sent on this case. Threads into the
  // case activity timeline alongside stage transitions, notes, and tasks.
  await logCommunicationEvent({
    organizationId: session.organizationId,
    actorUserId: session.id,
    caseId: data.caseId,
    communicationId: message.id,
    direction: "outbound",
    method: deliveredVia,
  });

  revalidatePath(`/cases/${data.caseId}/messages`);

  return {
    id: message.id,
    type: message.type,
    direction: message.direction,
    body: message.body,
    fromAddress: message.fromAddress,
    createdAt: message.createdAt.toISOString(),
  };
}
