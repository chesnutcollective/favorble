import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { users } from "./users";

/**
 * Schemas for the 3 work domains that were stubbed in metric-collectors
 * because backing tables didn't exist: fee collection, appeals council
 * brief pipeline, and post-hearing processing.
 *
 * Kept in a single file so the "filled gap" work is obvious and the
 * related tables stay close together.
 */

// ─────────────────────────────────────────────────────────────
// Fee Collection
// ─────────────────────────────────────────────────────────────

/**
 * Fee petitions filed with SSA after a favorable decision. The fee
 * collection team owns this table and is measured on:
 * - Time from favorable decision → petition filed
 * - Share of petitions approved
 * - Collection rate on approved fees
 */
export const feePetitions = pgTable(
  "fee_petitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    assignedToId: uuid("assigned_to_id").references(() => users.id),
    status: text("status").notNull().default("pending"), // pending, filed, approved, denied, withdrawn
    favorableDecisionDate: timestamp("favorable_decision_date", {
      withTimezone: true,
    }),
    filedAt: timestamp("filed_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    deniedAt: timestamp("denied_at", { withTimezone: true }),
    requestedAmountCents: integer("requested_amount_cents"),
    approvedAmountCents: integer("approved_amount_cents"),
    collectedAmountCents: integer("collected_amount_cents")
      .notNull()
      .default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_fee_petitions_org_status").on(
      table.organizationId,
      table.status,
    ),
    index("idx_fee_petitions_case").on(table.caseId),
    index("idx_fee_petitions_assigned").on(table.assignedToId),
    index("idx_fee_petitions_filed_at").on(table.filedAt),
  ],
);

/**
 * Fee collection follow-ups — recorded contacts with claimants or SSA
 * on pending or delinquent fees. Drives the collection rate + follow-up
 * compliance metrics.
 */
export const feeCollectionFollowUps = pgTable(
  "fee_collection_follow_ups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    feePetitionId: uuid("fee_petition_id")
      .notNull()
      .references(() => feePetitions.id, { onDelete: "cascade" }),
    followedUpBy: uuid("followed_up_by").references(() => users.id),
    method: text("method").notNull(), // phone, email, letter, system
    outcome: text("outcome"), // contacted, voicemail, no_answer, paid, disputed
    notes: text("notes"),
    followedUpAt: timestamp("followed_up_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_fee_followups_petition").on(table.feePetitionId),
    index("idx_fee_followups_user").on(table.followedUpBy),
  ],
);

// ─────────────────────────────────────────────────────────────
// Appeals Council Briefs
// ─────────────────────────────────────────────────────────────

/**
 * Appeals Council brief pipeline. Rows are created when an unfavorable
 * ALJ decision triggers the appeals_council event, and get updated as
 * the brief moves from draft → review → filed.
 */
export const appealsCouncilBriefs = pgTable(
  "appeals_council_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    assignedToId: uuid("assigned_to_id").references(() => users.id),
    status: text("status").notNull().default("pending"),
    // pending → drafting → in_review → filed → granted → denied → remanded

    // Triggering event — ALJ unfavorable decision date
    unfavorableDecisionDate: timestamp("unfavorable_decision_date", {
      withTimezone: true,
    }),

    // Deadline computed from decision date (65 days under SSA rule)
    deadlineDate: timestamp("deadline_date", { withTimezone: true }),

    // Lifecycle timestamps
    draftStartedAt: timestamp("draft_started_at", { withTimezone: true }),
    draftCompletedAt: timestamp("draft_completed_at", { withTimezone: true }),
    reviewCompletedAt: timestamp("review_completed_at", {
      withTimezone: true,
    }),
    // Approve-and-file pipeline marker — set when an approved draft is
    // handed off to the filing queue. Kept distinct from `filedAt` so we
    // can track queue lag vs. actual SSA acceptance.
    filingQueuedAt: timestamp("filing_queued_at", { withTimezone: true }),
    filedAt: timestamp("filed_at", { withTimezone: true }),

    // Link back to the ai_draft row that was approved for this filing.
    draftId: uuid("draft_id"),

    // Outcome (when AC decides)
    outcomeAt: timestamp("outcome_at", { withTimezone: true }),
    outcome: text("outcome"), // granted, denied, remanded

    // Link to the draft document this brief was filed from
    draftDocumentId: uuid("draft_document_id"),

    // Issues identified in the ALJ decision (from AI extraction)
    issuesIdentified: jsonb("issues_identified"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_ac_briefs_org_status").on(table.organizationId, table.status),
    index("idx_ac_briefs_case").on(table.caseId),
    index("idx_ac_briefs_assigned").on(table.assignedToId),
    index("idx_ac_briefs_deadline").on(table.deadlineDate),
  ],
);

// ─────────────────────────────────────────────────────────────
// Post-Hearing Processing
// ─────────────────────────────────────────────────────────────

/**
 * Post-hearing processing tasks — the work that happens after a
 * hearing concludes. Captures how quickly the team processes
 * outcomes, notifies clients, and advances the case stage.
 */
export const hearingOutcomes = pgTable(
  "hearing_outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    hearingDate: timestamp("hearing_date", { withTimezone: true }).notNull(),
    outcome: text("outcome"), // favorable, unfavorable, partially_favorable, dismissed, postponed
    outcomeReceivedAt: timestamp("outcome_received_at", {
      withTimezone: true,
    }),

    // Processing lifecycle — each step is a timestamp
    clientNotifiedAt: timestamp("client_notified_at", { withTimezone: true }),
    caseStageAdvancedAt: timestamp("case_stage_advanced_at", {
      withTimezone: true,
    }),
    postHearingTasksCreatedAt: timestamp("post_hearing_tasks_created_at", {
      withTimezone: true,
    }),
    processingCompletedAt: timestamp("processing_completed_at", {
      withTimezone: true,
    }),

    processedBy: uuid("processed_by").references(() => users.id),

    // Full decision text (from ALJ decision document)
    decisionText: text("decision_text"),
    decisionDocumentId: uuid("decision_document_id"),

    // Raw outcome data from ERE scraper
    rawData: jsonb("raw_data"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_hearing_outcomes_org").on(table.organizationId),
    index("idx_hearing_outcomes_case").on(table.caseId),
    index("idx_hearing_outcomes_processor").on(table.processedBy),
    index("idx_hearing_outcomes_received").on(table.outcomeReceivedAt),
  ],
);
