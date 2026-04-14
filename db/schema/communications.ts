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
import { portalUsers } from "./portal";
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
    /**
     * High-level source of the communication — e.g. 'portal', 'case_status',
     * 'twilio_inbound'. Added in migration 0025 so we can filter portal-sent
     * SMS from staff-side Twilio traffic without parsing metadata blobs.
     */
    sourceType: text("source_type"),
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

    // (sourceType is declared earlier — provenance marker for workflow /
    // case_status / portal_sms origins, unified across Phase 2 + Phase 4.)

    // Portal (B1) — outbound messages only surface on the client portal when
    // staff explicitly toggles "Visible to client" on the composer. Inbound
    // messages from the portal set this to true so the staff side can
    // distinguish them from email/SMS inbound.
    visibleToClient: boolean("visible_to_client").default(false).notNull(),

    // Portal (B1) — for inbound messages sent via the portal composer, the
    // id of the portal_users row that sent it. Null for all other inbound
    // (email/SMS/API) and outbound traffic.
    sentByPortalUserId: uuid("sent_by_portal_user_id").references(
      () => portalUsers.id,
    ),

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
    index("idx_comms_visible_to_client").on(table.visibleToClient),
    index("idx_comms_portal_sender").on(table.sentByPortalUserId),
  ],
);
