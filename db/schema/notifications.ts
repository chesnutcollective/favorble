import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { cases } from "./cases";
import { notificationChannelEnum, notificationPriorityEnum } from "./enums";

/**
 * In-app notifications. Backs the notification bell, the "what do I need
 * to do next" feed, and the 3-tier escalation ladder (SA-1, SA-7).
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    // Optional case context — nearly every notification is case-scoped
    caseId: uuid("case_id").references(() => cases.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    priority: notificationPriorityEnum("priority").notNull().default("normal"),
    // Short action hint for the UI (e.g. "Review draft" or "Open case")
    actionLabel: text("action_label"),
    actionHref: text("action_href"),
    // Grouping key — helps dedupe repeated "approaching deadline" notices
    dedupeKey: text("dedupe_key"),
    // If this notification was generated from a supervisor event, link back
    sourceEventId: uuid("source_event_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_notifications_user_unread").on(
      table.userId,
      table.readAt,
      table.createdAt,
    ),
    index("idx_notifications_org").on(table.organizationId),
    index("idx_notifications_case").on(table.caseId),
    index("idx_notifications_dedupe").on(table.dedupeKey),
  ],
);

/**
 * Delivery attempts per channel per notification. Keeps in-app separate
 * from email/SMS/push so we can retry or escalate through channels.
 */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    channel: notificationChannelEnum("channel").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_notification_deliveries_notification").on(table.notificationId),
  ],
);

/**
 * Per-user notification preferences. Lets users mute certain channels or
 * event types. Minimal for MVP — expand as needed.
 */
export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  pushEnabled: boolean("push_enabled").notNull().default(true),
  mutedEventTypes: text("muted_event_types").array(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
