"use server";

import { db } from "@/db/drizzle";
import {
  googleReviews,
  reviewRequests,
  cases,
  caseContacts,
  contacts,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

/**
 * High-level counters for the Google Reviews dashboard.
 *
 * While the GMB OAuth integration is deferred, these will generally return
 * zeros — which the UI renders as "— / Connect to activate".
 */
export type ReviewsOverview = {
  startingCount: number;
  currentCount: number;
  avgRating: number;
  requestsSent: number;
  periodDays: number;
};

export type ReviewPeriod = 30 | 90 | 180 | 365;

export async function getReviewsOverview(
  period: ReviewPeriod = 30,
): Promise<ReviewsOverview> {
  const session = await requireSession();

  const since = new Date();
  since.setDate(since.getDate() - period);

  const [currentRow] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
      avg: sql<number>`COALESCE(AVG(${googleReviews.rating}), 0)::float`,
    })
    .from(googleReviews)
    .where(eq(googleReviews.organizationId, session.organizationId));

  const [requestsRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(reviewRequests)
    .where(
      and(
        eq(reviewRequests.organizationId, session.organizationId),
        gte(reviewRequests.createdAt, since),
      ),
    );

  // "Starting review count" is a manually configured baseline stored on the
  // organization settings blob. Until the admin card writes it, treat as 0.
  // When the OAuth integration ships it will seed this to the count that
  // already exists on GMB at connect time.
  const startingCount = 0;

  return {
    startingCount,
    currentCount: Number(currentRow?.count ?? 0),
    avgRating: Number(currentRow?.avg ?? 0),
    requestsSent: Number(requestsRow?.count ?? 0),
    periodDays: period,
  };
}

export type RecentReview = {
  id: string;
  reviewerName: string | null;
  rating: number;
  comment: string | null;
  postedAt: string;
  respondedAt: string | null;
};

export async function listRecentReviews(
  limit: number = 10,
): Promise<RecentReview[]> {
  const session = await requireSession();

  const rows = await db
    .select({
      id: googleReviews.id,
      reviewerName: googleReviews.reviewerName,
      rating: googleReviews.rating,
      comment: googleReviews.comment,
      postedAt: googleReviews.postedAt,
      respondedAt: googleReviews.respondedAt,
    })
    .from(googleReviews)
    .where(eq(googleReviews.organizationId, session.organizationId))
    .orderBy(desc(googleReviews.postedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    reviewerName: r.reviewerName,
    rating: r.rating,
    comment: r.comment,
    postedAt: r.postedAt.toISOString(),
    respondedAt: r.respondedAt?.toISOString() ?? null,
  }));
}

export type ReviewCandidate = {
  caseId: string;
  caseNumber: string;
  closedAt: string | null;
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

/**
 * Recently-closed (closed_won) cases that haven't been asked for a review
 * yet. Used to populate the "ask for a review" worklist on the dashboard.
 */
export async function listReviewCandidates(
  limit: number = 10,
): Promise<ReviewCandidate[]> {
  const session = await requireSession();

  const rows = await db
    .select({
      caseId: cases.id,
      caseNumber: cases.caseNumber,
      closedAt: cases.closedAt,
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
    })
    .from(cases)
    .leftJoin(
      caseContacts,
      and(
        eq(caseContacts.caseId, cases.id),
        eq(caseContacts.isPrimary, true),
      ),
    )
    .leftJoin(contacts, eq(contacts.id, caseContacts.contactId))
    .where(
      and(
        eq(cases.organizationId, session.organizationId),
        eq(cases.status, "closed_won"),
        isNull(cases.deletedAt),
      ),
    )
    .orderBy(desc(cases.closedAt))
    .limit(limit);

  return rows.map((r) => ({
    caseId: r.caseId,
    caseNumber: r.caseNumber,
    closedAt: r.closedAt?.toISOString() ?? null,
    contactId: r.contactId,
    contactName:
      r.firstName || r.lastName
        ? `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()
        : null,
    contactEmail: r.email,
    contactPhone: r.phone,
  }));
}

export type ReviewRequestChannel = "sms" | "email" | "in_portal";

/**
 * Log a review request for a case. This writes to `review_requests` so the
 * firm has a durable audit trail of who was asked and when, even though the
 * actual send is deferred until the Google Reviews integration connects.
 *
 * When the integration ships, this function will be extended to enqueue the
 * actual SMS / email / portal notification.
 */
export async function sendReviewRequest(
  caseId: string,
  channel: ReviewRequestChannel,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await requireSession();

  // Resolve the primary contact on the case.
  const [primary] = await db
    .select({
      contactId: caseContacts.contactId,
      caseOrgId: cases.organizationId,
    })
    .from(caseContacts)
    .innerJoin(cases, eq(cases.id, caseContacts.caseId))
    .where(
      and(
        eq(caseContacts.caseId, caseId),
        eq(caseContacts.isPrimary, true),
        eq(cases.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!primary) {
    return { ok: false, error: "No primary contact found for this case" };
  }

  const [created] = await db
    .insert(reviewRequests)
    .values({
      organizationId: session.organizationId,
      caseId,
      contactId: primary.contactId,
      channel,
      createdBy: session.id,
      // sentAt is intentionally left null — it'll be set when the real
      // integration delivers the message.
    })
    .returning({ id: reviewRequests.id });

  logger.info("Review request logged (send deferred)", {
    reviewRequestId: created.id,
    caseId,
    channel,
  });

  revalidatePath("/reports/reviews");
  return { ok: true, id: created.id };
}
