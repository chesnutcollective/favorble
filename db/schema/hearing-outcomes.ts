import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { users } from "./users";

/**
 * Post-hearing outcomes tracked for the post_hearing persona.
 *
 * Flow:
 *   1. Source system (ERE, notification webhook, or manual logging) creates a
 *      row with `outcome` (fully_favorable | partially_favorable | unfavorable
 *      | dismissed) and sets `status = 'pending_review'`.
 *   2. Reviewer approves the outcome → `status = 'approved_for_processing'`,
 *      `approvedAt` stamped, case stage advances when appropriate.
 *   3. Post-hearing tasks kick off. When complete → `status = 'complete'`.
 *
 * `aiConfidence` (0-100) is set when the outcome was auto-detected. Rows with
 * confidence < 60 show up in the "Override AI" picker so a human can correct.
 * When a human overrides, we keep the original in `originalOutcome` / `aiOutcome`
 * and stamp `overriddenAt` + `overrideReason` (audit-log also records the override).
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

    // Outcome classification. Stored as text (not enum) so downstream consumers
    // can add new values without a migration. Canonical values:
    //   fully_favorable | partially_favorable | unfavorable | dismissed | remanded
    outcome: text("outcome").notNull(),

    // Workflow status. Canonical values:
    //   pending_review | approved_for_processing | complete | overridden
    status: text("status").notNull().default("pending_review"),

    // AI auto-detection metadata. Null when the outcome was logged by a human.
    aiConfidence: integer("ai_confidence"),
    aiOutcome: text("ai_outcome"),

    // Override tracking (set when a reviewer corrects an AI-flagged outcome).
    originalOutcome: text("original_outcome"),
    overrideReason: text("override_reason"),
    overriddenAt: timestamp("overridden_at", { withTimezone: true }),
    overriddenBy: uuid("overridden_by").references(() => users.id),

    // Approval tracking.
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id),

    // Completion tracking.
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => users.id),

    // Free-form note attached to the outcome (e.g. ALJ remarks).
    notes: text("notes"),

    // When the hearing itself occurred, if known. Used for sort order.
    hearingDate: timestamp("hearing_date", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (table) => [
    index("idx_hearing_outcomes_org").on(table.organizationId),
    index("idx_hearing_outcomes_case").on(table.caseId),
    index("idx_hearing_outcomes_org_status").on(
      table.organizationId,
      table.status,
    ),
    index("idx_hearing_outcomes_org_confidence").on(
      table.organizationId,
      table.aiConfidence,
    ),
    index("idx_hearing_outcomes_created").on(table.createdAt),
  ],
);
