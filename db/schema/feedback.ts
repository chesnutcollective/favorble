import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),

    userId: text("user_id"),
    userEmail: text("user_email").notNull(),
    userName: text("user_name"),

    message: text("message").notNull(),
    /** bug | feature | ux | data | question | other */
    category: text("category").notNull().default("other"),
    /** open | building | testing | staging | production | wont_fix */
    status: text("status").notNull().default("open"),

    pageUrl: text("page_url"),
    pageTitle: text("page_title"),

    /** Rich context — filled out by Phase 2: screenshot, voice, pinned element,
     * browser metadata, persona, viewing-as, etc. */
    context: jsonb("context").default({}).notNull(),

    /** Array<{ status, timestamp, source }> — appended on every status change */
    statusHistory: jsonb("status_history").default([]).notNull(),

    adminNotes: text("admin_notes"),
    resolvedLink: text("resolved_link"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_feedback_org_created").on(table.organizationId, table.createdAt),
    index("idx_feedback_org_status").on(table.organizationId, table.status),
    index("idx_feedback_org_category").on(
      table.organizationId,
      table.category,
    ),
  ],
);

export type FeedbackRow = typeof feedback.$inferSelect;
export type NewFeedbackRow = typeof feedback.$inferInsert;
