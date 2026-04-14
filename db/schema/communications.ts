import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { users } from "./users";
import {
  communicationTypeEnum,
  sentimentLabelEnum,
  messageQaStatusEnum,
} from "./enums";

export const communications = pgTable(
  "communications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id").references(() => cases.id),
    type: communicationTypeEnum("type").notNull(),
    direction: text("direction"),
    subject: text("subject"),
    body: text("body"),
    fromAddress: text("from_address"),
    toAddress: text("to_address"),
    externalMessageId: text("external_message_id"),
    sourceSystem: text("source_system"),
    metadata: jsonb("metadata").default({}),
    userId: uuid("user_id").references(() => users.id),

    // Threading — groups a chain of messages across inbound + outbound
    threadId: uuid("thread_id"),

    // Read/delivery state for inbound messages in the inbox
    readAt: timestamp("read_at", { withTimezone: true }),
    deliveryStatus: text("delivery_status"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),

    // Response time tracking — when did a team member respond to this
    // inbound message? Used to compute per-member response SLAs.
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    responseTimeSeconds: integer("response_time_seconds"),
    respondedBy: uuid("responded_by").references(() => users.id),

    // Tier 1 QA foundation — sentiment analysis (QA-3)
    sentimentScore: numeric("sentiment_score", { precision: 5, scale: 3 }),
    sentimentLabel: sentimentLabelEnum("sentiment_label"),
    sentimentAnalyzedAt: timestamp("sentiment_analyzed_at", {
      withTimezone: true,
    }),

    // Tier 1 QA foundation — outbound QA review (QA-2)
    qaStatus: messageQaStatusEnum("qa_status"),
    qaScore: integer("qa_score"),
    qaNotes: text("qa_notes"),
    qaReviewedAt: timestamp("qa_reviewed_at", { withTimezone: true }),

    // B4: inbox triage fields (plain text so we can iterate on values without
    // needing a migration per change). Validated at the action layer via
    // `URGENCY_VALUES` / `CATEGORY_VALUES` in app/actions/messages.ts.
    urgency: text("urgency").default("normal"),
    category: text("category"),

    // D3: distinguishes workflow-generated messages from human-sent ones so
    // the follow-up nudger can skip anything sent by a template.
    isAutomated: boolean("is_automated").default(false).notNull(),

    // Provenance marker — e.g. "workflow:{templateId}", "human", "case_status".
    // Nullable for legacy rows.
    sourceType: text("source_type"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_comms_case").on(table.caseId),
    index("idx_comms_type").on(table.type),
    index("idx_comms_case_created").on(table.caseId, table.createdAt),
    uniqueIndex("uq_comms_external")
      .on(table.sourceSystem, table.externalMessageId)
      .where(sql`${table.externalMessageId} is not null`),
    index("idx_comms_thread").on(table.threadId),
    index("idx_comms_sentiment").on(table.sentimentLabel),
    index("idx_comms_read").on(table.readAt),
    index("idx_comms_urgency").on(table.urgency),
    index("idx_comms_category").on(table.category),
    index("idx_comms_is_automated").on(table.isAutomated),
  ],
);
