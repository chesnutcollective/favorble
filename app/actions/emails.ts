"use server";

import { db } from "@/db/drizzle";
import { communications, contacts, caseContacts, cases } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, isNull, isNotNull, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";
import * as outlook from "@/lib/integrations/outlook";

/**
 * Fetch emails from Outlook for all contacts linked to cases,
 * auto-match them by contact email -> case_contacts -> case,
 * and store as communications.
 */
export async function fetchAndMatchEmails() {
  const session = await requireSession();

  if (!outlook.isConfigured()) {
    return {
      matched: 0,
      unmatched: 0,
      error: "Microsoft Graph API not configured",
    };
  }

  // Get all contacts with emails that are linked to cases
  const contactsWithCases = await db
    .select({
      contactEmail: contacts.email,
      caseId: caseContacts.caseId,
      contactId: contacts.id,
    })
    .from(contacts)
    .innerJoin(caseContacts, eq(contacts.id, caseContacts.contactId))
    .innerJoin(cases, eq(caseContacts.caseId, cases.id))
    .where(
      and(
        eq(contacts.organizationId, session.organizationId),
        isNotNull(contacts.email),
        isNull(cases.deletedAt),
      ),
    );

  // Build a map: contactEmail -> caseIds
  const emailToCases = new Map<
    string,
    { caseId: string; contactId: string }[]
  >();
  for (const row of contactsWithCases) {
    if (!row.contactEmail) continue;
    const key = row.contactEmail.toLowerCase();
    if (!emailToCases.has(key)) {
      emailToCases.set(key, []);
    }
    emailToCases.get(key)!.push({
      caseId: row.caseId,
      contactId: row.contactId,
    });
  }

  let matched = 0;
  let unmatched = 0;

  // For each unique contact email, search for emails
  for (const [contactEmail, caseLinks] of emailToCases) {
    try {
      // Use the session user's email as the mailbox to search
      const emails = await outlook.searchEmails(
        session.email,
        contactEmail,
        // Look back 7 days
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      );

      for (const email of emails) {
        // Check if we already stored this email
        const existing = await db
          .select({ id: communications.id })
          .from(communications)
          .where(
            and(
              eq(communications.externalMessageId, email.id),
              eq(communications.sourceSystem, "outlook"),
            ),
          )
          .limit(1);

        if (existing.length > 0) continue;

        // Determine direction
        const isInbound = email.from.toLowerCase() === contactEmail;
        const direction = isInbound ? "inbound" : "outbound";
        const type = isInbound ? "email_inbound" : "email_outbound";

        // Associate with the first matching case
        const caseLink = caseLinks[0];

        await db.insert(communications).values({
          organizationId: session.organizationId,
          caseId: caseLink.caseId,
          type: type as "email_inbound" | "email_outbound",
          direction,
          subject: email.subject,
          body: email.bodyPreview,
          fromAddress: email.from,
          toAddress: email.to.join(", "),
          externalMessageId: email.id,
          sourceSystem: "outlook",
          metadata: {
            hasAttachments: email.hasAttachments,
            receivedAt: email.receivedAt,
            contactId: caseLink.contactId,
          },
          userId: session.id,
        });

        matched++;
      }
    } catch (error) {
      logger.error("Error fetching emails for contact", {
        contactEmail,
        error,
      });
      unmatched++;
    }
  }

  revalidatePath("/email");

  return { matched, unmatched, error: null };
}

/**
 * Get emails that are stored but not yet associated with a case.
 * These appear in the email review queue.
 */
export async function getUnmatchedEmails() {
  const session = await requireSession();

  const results = await db
    .select({
      id: communications.id,
      type: communications.type,
      subject: communications.subject,
      body: communications.body,
      fromAddress: communications.fromAddress,
      toAddress: communications.toAddress,
      externalMessageId: communications.externalMessageId,
      createdAt: communications.createdAt,
      metadata: communications.metadata,
    })
    .from(communications)
    .where(
      and(
        eq(communications.organizationId, session.organizationId),
        isNull(communications.caseId),
        sql`${communications.type} IN ('email_inbound', 'email_outbound')`,
      ),
    )
    .orderBy(desc(communications.createdAt))
    .limit(100);

  return results;
}

/**
 * Get all email communications (both matched and unmatched) for the review queue.
 */
export async function getAllEmails() {
  const session = await requireSession();

  const results = await db
    .select({
      id: communications.id,
      type: communications.type,
      subject: communications.subject,
      body: communications.body,
      fromAddress: communications.fromAddress,
      toAddress: communications.toAddress,
      externalMessageId: communications.externalMessageId,
      createdAt: communications.createdAt,
      metadata: communications.metadata,
      caseId: communications.caseId,
      caseNumber: cases.caseNumber,
    })
    .from(communications)
    .leftJoin(cases, eq(communications.caseId, cases.id))
    .where(
      and(
        eq(communications.organizationId, session.organizationId),
        sql`${communications.type} IN ('email_inbound', 'email_outbound')`,
      ),
    )
    .orderBy(desc(communications.createdAt))
    .limit(100);

  return results;
}

/**
 * Manually associate an email with a case.
 * Used from the email review queue when auto-matching fails.
 */
export async function associateEmailWithCase(emailId: string, caseId: string) {
  const session = await requireSession();

  // Verify the email belongs to the same organization
  const [email] = await db
    .select({
      id: communications.id,
      organizationId: communications.organizationId,
    })
    .from(communications)
    .where(eq(communications.id, emailId))
    .limit(1);

  if (!email || email.organizationId !== session.organizationId) {
    throw new Error("Email not found");
  }

  // Verify the case belongs to the same organization
  const [caseRecord] = await db
    .select({ id: cases.id, organizationId: cases.organizationId })
    .from(cases)
    .where(eq(cases.id, caseId))
    .limit(1);

  if (!caseRecord || caseRecord.organizationId !== session.organizationId) {
    throw new Error("Case not found");
  }

  await db
    .update(communications)
    .set({ caseId })
    .where(eq(communications.id, emailId));

  logger.info("Email manually associated with case", {
    emailId,
    caseId,
    userId: session.id,
  });

  revalidatePath("/email");
  revalidatePath(`/cases/${caseId}/activity`);

  return { success: true };
}

/**
 * Get email communications for a specific case.
 */
export async function getCaseEmails(caseId: string) {
  const results = await db
    .select({
      id: communications.id,
      type: communications.type,
      subject: communications.subject,
      body: communications.body,
      fromAddress: communications.fromAddress,
      toAddress: communications.toAddress,
      direction: communications.direction,
      createdAt: communications.createdAt,
      metadata: communications.metadata,
    })
    .from(communications)
    .where(
      and(
        eq(communications.caseId, caseId),
        sql`${communications.type} IN ('email_inbound', 'email_outbound')`,
      ),
    )
    .orderBy(desc(communications.createdAt));

  return results;
}

/**
 * Get a simple list of cases for the case picker dialog.
 */
export async function getCasesForPicker() {
  const session = await requireSession();

  const result = await db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
    })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, session.organizationId),
        isNull(cases.deletedAt),
        eq(cases.status, "active"),
      ),
    )
    .orderBy(desc(cases.createdAt))
    .limit(200);

  return result;
}
