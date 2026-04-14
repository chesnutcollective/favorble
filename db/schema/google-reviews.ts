import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { contacts } from "./contacts";
import { users } from "./users";

/**
 * Google Reviews pulled from Google Business Profile.
 *
 * Phase 1 (C4): schema + admin config card + viewing page only.
 * The actual GMB OAuth + scraping pipeline is deferred — rows will not be
 * populated until the OAuth integration ships in a follow-up phase.
 */
export const googleReviews = pgTable(
  "google_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    // GMB Place ID (Google's identifier for the business location).
    placeId: text("place_id").notNull(),
    // Google's per-review identifier. Unique so re-fetches are idempotent.
    externalReviewId: text("external_review_id").notNull(),
    reviewerName: text("reviewer_name"),
    // 1..5 stars. Stored as an integer so we don't lean on float math.
    rating: integer("rating").notNull(),
    comment: text("comment"),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Set when the firm responds to the review on Google's side.
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    response: text("response"),
    // Optional link back to the case that earned the review, once matched.
    matchedCaseId: uuid("matched_case_id").references(() => cases.id),
  },
  (table) => [
    uniqueIndex("idx_google_reviews_external_id").on(table.externalReviewId),
    index("idx_google_reviews_org_posted").on(
      table.organizationId,
      table.postedAt,
    ),
    index("idx_google_reviews_case").on(table.matchedCaseId),
  ],
);

/**
 * Review requests — a log of "please leave a review" prompts the firm sent
 * to a claimant. Written even when the actual send is deferred so we can
 * audit intent separately from delivery.
 */
export const reviewRequests = pgTable(
  "review_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    // 'sms' | 'email' | 'in_portal'. Kept as text (not an enum) so the list
    // can grow without a migration as channels are added.
    channel: text("channel").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index("idx_review_requests_org").on(table.organizationId),
    index("idx_review_requests_case").on(table.caseId),
    index("idx_review_requests_channel").on(table.channel),
  ],
);
