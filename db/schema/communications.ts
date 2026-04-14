import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { users } from "./users";
import { communicationTypeEnum } from "./enums";

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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_comms_case").on(table.caseId),
    index("idx_comms_type").on(table.type),
    index("idx_comms_case_created").on(table.caseId, table.createdAt),
    index("idx_comms_external").on(table.sourceSystem, table.externalMessageId),
  ],
);
