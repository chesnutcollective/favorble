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
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";
import * as caseStatusClient from "@/lib/integrations/case-status";
import { notifyNewMessage } from "@/lib/services/portal-sms";

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
      }
    } catch (error) {
      logger.error("Case Status forwarding failed", { error });
      // Non-fatal — the local message was saved
    }
  }

  revalidatePath(`/cases/${data.caseId}/messages`);

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
