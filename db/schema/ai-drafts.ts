import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { cases } from "./cases";
import { tasks } from "./tasks";
import { aiDraftTypeEnum, aiDraftStatusEnum } from "./enums";

/**
 * AI-generated draft artifacts (letters, call scripts, filings, briefs,
 * client messages, etc.). Every draft is reviewable by a team member
 * before it fires. Feeds CM-2, CM-4, SA-2, SA-3, SA-4.
 *
 * NOTE: drafts that are sent as outbound messages also write a row to
 * `communications` once approved — this table is the draft workspace,
 * not the final record.
 */
export const aiDrafts = pgTable(
  "ai_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id").references(() => cases.id),
    type: aiDraftTypeEnum("type").notNull(),
    status: aiDraftStatusEnum("status").notNull().default("generating"),

    // Who is this draft for? (the team member who should review)
    assignedReviewerId: uuid("assigned_reviewer_id").references(() => users.id),

    // Title and primary body content
    title: text("title").notNull(),
    body: text("body").notNull(),

    // For drafts that get rendered into a structured document
    // (e.g. pre-hearing brief, appeal form) — store the generated
    // template slots here
    structuredFields: jsonb("structured_fields"),

    // What prompted this draft — link back to the supervisor event or
    // communication that triggered it
    sourceEventId: uuid("source_event_id"),
    sourceCommunicationId: uuid("source_communication_id"),
    sourceTaskId: uuid("source_task_id").references(() => tasks.id),

    // LLM metadata for auditability
    promptVersion: text("prompt_version"),
    model: text("model"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),

    // Post-approval: link to the final artifact (document or communication)
    approvedDocumentId: uuid("approved_document_id"),
    approvedCommunicationId: uuid("approved_communication_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id),

    // Edit tracking — how much did the reviewer change the draft?
    // Useful for measuring AI draft quality over time.
    editDistance: integer("edit_distance"),

    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_ai_drafts_org_status").on(table.organizationId, table.status),
    index("idx_ai_drafts_case").on(table.caseId),
    index("idx_ai_drafts_reviewer").on(table.assignedReviewerId),
    index("idx_ai_drafts_type").on(table.type),
  ],
);
