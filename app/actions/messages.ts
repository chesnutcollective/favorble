"use server";

import { db } from "@/db/drizzle";
import { after } from "next/server";
import {
  caseContacts,
  cases,
  communications,
  contacts,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";
import * as caseStatusClient from "@/lib/integrations/case-status";
import { logCommunicationEvent } from "@/lib/services/hipaa-audit";
import { enqueueOutboundMessageReview } from "@/lib/services/message-qa";
import { notifyNewMessage } from "@/lib/services/portal-sms";
import type { MessageFilters } from "@/lib/messages/filters";

export type MessageRow = {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  fromAddress: string | null;
  sourceSystem: string | null;
  createdAt: string;
  caseId: string | null;
  caseNumber: string | null;
  urgency: string | null;
  category: string | null;
  readAt: string | null;
};

/**
 * Fetch recent communications for the org-wide inbox view, optionally
 * filtered by urgency / category / unread. Mirrors the shape returned
 * by `fetchRecentMessages` on the messages page so MessageFeed can
 * consume the result directly.
 */
export async function getMessages(
  filters: MessageFilters = {},
): Promise<MessageRow[]> {
  const session = await requireSession();
  const limit = filters.limit ?? 100;

  const conditions: SQL[] = [
    eq(communications.organizationId, session.organizationId),
  ];

  if (filters.urgency) {
    conditions.push(eq(communications.urgency, filters.urgency));
  }
  if (filters.category) {
    conditions.push(eq(communications.category, filters.category));
  }
  if (filters.unreadOnly) {
    conditions.push(isNull(communications.readAt));
  }

  const rows = await db
    .select({
      id: communications.id,
      type: communications.type,
      subject: communications.subject,
      body: communications.body,
      fromAddress: communications.fromAddress,
      sourceSystem: communications.sourceSystem,
      createdAt: communications.createdAt,
      caseId: communications.caseId,
      caseNumber: cases.caseNumber,
      urgency: communications.urgency,
      category: communications.category,
      readAt: communications.readAt,
    })
    .from(communications)
    .leftJoin(cases, eq(communications.caseId, cases.id))
    .where(and(...conditions))
    .orderBy(desc(communications.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    readAt: r.readAt ? r.readAt.toISOString() : null,
  }));
}

/**
 * Send an outbound message on a case.
 * Inserts into communications and optionally forwards to Case Status.
 *
 * `visibleToClient` (B1) — when true, this message also renders on the
 * claimant's portal thread at `/portal/messages`. Defaults to false so
 * existing callers don't accidentally leak internal comms.
 */
export async function sendCaseMessage(data: {
  caseId: string;
  body: string;
  visibleToClient?: boolean;
}) {
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
      visibleToClient: data.visibleToClient === true,
    })
    .returning();

  logger.info("Outbound message sent", {
    messageId: message.id,
    caseId: data.caseId,
    visibleToClient: data.visibleToClient === true,
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
  if (data.visibleToClient === true) {
    revalidatePath("/portal/messages");
  }

  // Portal SMS notification — fire in the background so the staff user's
  // send is never gated on Twilio latency. If no claimant is linked, or
  // they've opted out, or Twilio isn't configured, sendPortalSms degrades
  // gracefully.
  after(async () => {
    try {
      const [claimant] = await db
        .select({
          id: contacts.id,
          preferredLocale: contacts.preferredLocale,
        })
        .from(caseContacts)
        .innerJoin(contacts, eq(contacts.id, caseContacts.contactId))
        .where(
          and(
            eq(caseContacts.caseId, data.caseId),
            eq(caseContacts.relationship, "claimant"),
          ),
        )
        .limit(1);
      if (!claimant) return;
      await notifyNewMessage({
        contactId: claimant.id,
        caseId: data.caseId,
        preferredLocale: claimant.preferredLocale,
      });
    } catch (error) {
      logger.error("portal sms: new-message notify failed", {
        caseId: data.caseId,
        error,
      });
    }
  });

  return {
    id: message.id,
    type: message.type,
    direction: message.direction,
    body: message.body,
    fromAddress: message.fromAddress,
    createdAt: message.createdAt.toISOString(),
  };
}
