import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { users } from "./users";

export const mailTypeEnum = pgEnum("mail_type", [
  "certified",
  "regular",
  "fedex",
  "ups",
]);

/**
 * Outbound physical mail tracking. Used by the Mail Clerk workspace to
 * record certified mail sent from the firm to claimants, SSA, providers, etc.
 */
export const outboundMail = pgTable(
  "outbound_mail",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id").references(() => cases.id),
    recipientName: text("recipient_name").notNull(),
    recipientAddress: text("recipient_address"),
    mailType: mailTypeEnum("mail_type").notNull().default("regular"),
    trackingNumber: text("tracking_number"),
    sentAt: timestamp("sent_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    notes: text("notes"),
    sentBy: uuid("sent_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_outbound_mail_org").on(table.organizationId),
    index("idx_outbound_mail_case").on(table.caseId),
    index("idx_outbound_mail_tracking").on(table.trackingNumber),
    index("idx_outbound_mail_sent_at").on(table.sentAt),
  ],
);
