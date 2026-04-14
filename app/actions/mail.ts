"use server";

import { db } from "@/db/drizzle";
import {
  cases,
  contacts,
  caseContacts,
  caseStages,
  documents,
  outboundMail,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

export type MailCategory =
  | "medical_record"
  | "ssa_correspondence"
  | "hearing_notice"
  | "decision"
  | "other";

export type OutboundMailType = "certified" | "regular" | "fedex" | "ups";

export type MailSearchResult = {
  caseId: string;
  caseNumber: string;
  stageName: string | null;
  stageColor: string | null;
  claimantFirstName: string | null;
  claimantLastName: string | null;
  ssnLast4: string | null;
  dateOfBirth: string | null;
};

/**
 * Fuzzy search cases for the Mail Clerk workspace.
 *
 * Matches across case number, claimant first/last name, and (if stored in
 * contact metadata) last-4 of SSN. Uses ilike with % wildcards and limits
 * results to 20.
 */
export async function searchCasesForMail(
  query: string,
): Promise<MailSearchResult[]> {
  const session = await requireSession();
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const term = `%${trimmed}%`;

  // SSN last-4 lookup: contacts.metadata->>'ssnLast4' ilike %term%
  const ssnLast4Expr = sql<string>`(${contacts.metadata} ->> 'ssnLast4')`;

  const rows = await db
    .select({
      caseId: cases.id,
      caseNumber: cases.caseNumber,
      stageName: caseStages.name,
      stageColor: caseStages.color,
      claimantFirstName: contacts.firstName,
      claimantLastName: contacts.lastName,
      ssnLast4: ssnLast4Expr,
      dateOfBirth: cases.dateOfBirth,
    })
    .from(cases)
    .leftJoin(
      caseContacts,
      and(
        eq(caseContacts.caseId, cases.id),
        eq(caseContacts.isPrimary, true),
        eq(caseContacts.relationship, "claimant"),
      ),
    )
    .leftJoin(contacts, eq(caseContacts.contactId, contacts.id))
    .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
    .where(
      and(
        eq(cases.organizationId, session.organizationId),
        isNull(cases.deletedAt),
        or(
          ilike(cases.caseNumber, term),
          ilike(cases.ssaClaimNumber, term),
          ilike(contacts.firstName, term),
          ilike(contacts.lastName, term),
          sql`${ssnLast4Expr} ilike ${term}`,
        ),
      ),
    )
    .orderBy(asc(contacts.lastName), asc(contacts.firstName))
    .limit(20);

  return rows.map((r) => ({
    caseId: r.caseId,
    caseNumber: r.caseNumber,
    stageName: r.stageName ?? null,
    stageColor: r.stageColor ?? null,
    claimantFirstName: r.claimantFirstName ?? null,
    claimantLastName: r.claimantLastName ?? null,
    ssnLast4: r.ssnLast4 ?? null,
    dateOfBirth: r.dateOfBirth ? r.dateOfBirth.toISOString() : null,
  }));
}

export type InboundMailItem = {
  id: string;
  fileName: string;
  fileType: string;
  caseId: string | null;
  caseNumber: string | null;
  claimantFirstName: string | null;
  claimantLastName: string | null;
  receivedAt: string;
  ageInDays: number;
  category: string | null;
  notes: string | null;
};

/**
 * Get the inbound mail queue — documents tagged as received via mail and
 * still in `pending_processing` state. Ordered by receivedAt ASC (oldest first).
 *
 * Since the `documents.source` enum does not include "mail", we identify mail
 * items by a "mail" tag and track processing state via metadata.processingStatus.
 */
export async function getInboundMailQueue(): Promise<InboundMailItem[]> {
  const session = await requireSession();

  const receivedAtExpr = sql<string>`(${documents.metadata} ->> 'receivedAt')`;

  const rows = await db
    .select({
      id: documents.id,
      fileName: documents.fileName,
      fileType: documents.fileType,
      category: documents.category,
      description: documents.description,
      caseId: cases.id,
      caseNumber: cases.caseNumber,
      receivedAt: receivedAtExpr,
      createdAt: documents.createdAt,
      claimantFirstName: contacts.firstName,
      claimantLastName: contacts.lastName,
    })
    .from(documents)
    .leftJoin(cases, eq(documents.caseId, cases.id))
    .leftJoin(
      caseContacts,
      and(
        eq(caseContacts.caseId, cases.id),
        eq(caseContacts.isPrimary, true),
        eq(caseContacts.relationship, "claimant"),
      ),
    )
    .leftJoin(contacts, eq(caseContacts.contactId, contacts.id))
    .where(
      and(
        eq(documents.organizationId, session.organizationId),
        isNull(documents.deletedAt),
        sql`'mail' = ANY(${documents.tags})`,
        sql`(${documents.metadata} ->> 'processingStatus') = 'pending_processing'`,
      ),
    )
    .orderBy(asc(receivedAtExpr), asc(documents.createdAt));

  const now = Date.now();
  return rows.map((r) => {
    const received = r.receivedAt
      ? new Date(r.receivedAt)
      : (r.createdAt ?? new Date());
    const ageInDays = Math.max(
      0,
      Math.floor((now - received.getTime()) / (1000 * 60 * 60 * 24)),
    );
    return {
      id: r.id,
      fileName: r.fileName,
      fileType: r.fileType,
      caseId: r.caseId ?? null,
      caseNumber: r.caseNumber ?? null,
      claimantFirstName: r.claimantFirstName ?? null,
      claimantLastName: r.claimantLastName ?? null,
      receivedAt: received.toISOString(),
      ageInDays,
      category: r.category ?? null,
      notes: r.description ?? null,
    };
  });
}

export type OutboundMailItem = {
  id: string;
  caseId: string | null;
  caseNumber: string | null;
  recipientName: string;
  recipientAddress: string | null;
  mailType: OutboundMailType;
  trackingNumber: string | null;
  sentAt: string;
  deliveredAt: string | null;
  notes: string | null;
  deliveryStatus: "delivered" | "in_transit";
};

/**
 * Get the outbound mail queue — all outbound mail rows ordered by sentAt DESC.
 */
export async function getOutboundMailQueue(): Promise<OutboundMailItem[]> {
  const session = await requireSession();

  const rows = await db
    .select({
      id: outboundMail.id,
      caseId: outboundMail.caseId,
      caseNumber: cases.caseNumber,
      recipientName: outboundMail.recipientName,
      recipientAddress: outboundMail.recipientAddress,
      mailType: outboundMail.mailType,
      trackingNumber: outboundMail.trackingNumber,
      sentAt: outboundMail.sentAt,
      deliveredAt: outboundMail.deliveredAt,
      notes: outboundMail.notes,
    })
    .from(outboundMail)
    .leftJoin(cases, eq(outboundMail.caseId, cases.id))
    .where(eq(outboundMail.organizationId, session.organizationId))
    .orderBy(desc(outboundMail.sentAt))
    .limit(100);

  return rows.map((r) => ({
    id: r.id,
    caseId: r.caseId ?? null,
    caseNumber: r.caseNumber ?? null,
    recipientName: r.recipientName,
    recipientAddress: r.recipientAddress ?? null,
    mailType: r.mailType,
    trackingNumber: r.trackingNumber ?? null,
    sentAt: r.sentAt.toISOString(),
    deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
    notes: r.notes ?? null,
    deliveryStatus: r.deliveredAt ? "delivered" : "in_transit",
  }));
}

/**
 * Process an inbound mail document: set its category, update notes, attach
 * to a case (if not already attached), and mark processed.
 */
export async function processInboundMail(
  documentId: string,
  category: MailCategory,
  notes: string,
  caseId?: string,
) {
  const session = await requireSession();

  const [doc] = await db
    .select({
      id: documents.id,
      caseId: documents.caseId,
      metadata: documents.metadata,
      tags: documents.tags,
    })
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.organizationId, session.organizationId),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);

  if (!doc) throw new Error("Document not found");

  const prevMeta =
    (doc.metadata as Record<string, unknown> | null | undefined) ?? {};
  const nextMeta = {
    ...prevMeta,
    processingStatus: "processed",
    processedAt: new Date().toISOString(),
    processedBy: session.id,
  };

  const updates: Record<string, unknown> = {
    category,
    description: notes,
    metadata: nextMeta,
  };

  // Attach to case if an override was provided and differs from the current link.
  if (caseId && caseId !== doc.caseId) {
    updates.caseId = caseId;
  }

  await db.update(documents).set(updates).where(eq(documents.id, documentId));

  logger.info("Inbound mail processed", {
    documentId,
    category,
    attachedCaseId: caseId ?? doc.caseId,
  });

  revalidatePath("/mail");
}

/**
 * Record a new outbound mail entry.
 */
export async function addOutboundMail(
  caseId: string | null,
  recipient: string,
  certifiedTrackingNumber: string | null,
  type: OutboundMailType,
  notes: string | null,
  recipientAddress?: string,
) {
  const session = await requireSession();

  const [inserted] = await db
    .insert(outboundMail)
    .values({
      organizationId: session.organizationId,
      caseId: caseId ?? null,
      recipientName: recipient,
      recipientAddress: recipientAddress ?? null,
      mailType: type,
      trackingNumber: certifiedTrackingNumber,
      notes,
      sentBy: session.id,
    })
    .returning();

  logger.info("Outbound mail added", {
    id: inserted.id,
    caseId,
    type,
    trackingNumber: certifiedTrackingNumber,
  });

  revalidatePath("/mail");
  return inserted;
}

/**
 * Mark an outbound mail entry as delivered.
 */
export async function markOutboundDelivered(mailId: string, deliveredAt: Date) {
  const session = await requireSession();

  await db
    .update(outboundMail)
    .set({ deliveredAt })
    .where(
      and(
        eq(outboundMail.id, mailId),
        eq(outboundMail.organizationId, session.organizationId),
      ),
    );

  revalidatePath("/mail");
}
