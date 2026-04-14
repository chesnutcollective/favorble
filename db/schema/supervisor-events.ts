import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { cases } from "./cases";
import { tasks } from "./tasks";
import { supervisorEventTypeEnum, supervisorEventStatusEnum } from "./enums";

/**
 * Supervisor events are the unified event log that drives the entire
 * AI Supervisor module. Every "triggering event" (denial received,
 * hearing scheduled, appeal deadline approaching, workload imbalance,
 * etc.) inserts a row here. Background jobs and webhooks both write.
 *
 * Each row tracks the lifecycle (SA-8): detected → file_updated →
 * draft_created → task_assigned → awaiting_review → resolved. The
 * `steps` JSONB column captures the full history of transitions for
 * rendering on a single timeline.
 */
export const supervisorEvents = pgTable(
  "supervisor_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id").references(() => cases.id),
    eventType: supervisorEventTypeEnum("event_type").notNull(),
    status: supervisorEventStatusEnum("status").notNull().default("detected"),

    // Short human description — rendered directly in the timeline UI
    summary: text("summary").notNull(),

    // Who's responsible for acting on this event (if any)
    assignedUserId: uuid("assigned_user_id").references(() => users.id),

    // Full payload from the source (webhook body, scan result, etc.)
    payload: jsonb("payload"),

    // Lifecycle step history for SA-8. Each entry is
    // { at: iso, status: "draft_created", by: "system" | userId, note?: string }
    steps: jsonb("steps").notNull().default([]),

    // Linked artifacts created in response (tasks, drafts, notifications)
    linkedTaskIds: uuid("linked_task_ids").array(),
    linkedDraftIds: uuid("linked_draft_ids").array(),
    linkedNotificationIds: uuid("linked_notification_ids").array(),

    // What the AI said the team should do next
    recommendedAction: text("recommended_action"),

    detectedAt: timestamp("detected_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_supervisor_events_org_status").on(
      table.organizationId,
      table.status,
      table.detectedAt,
    ),
    index("idx_supervisor_events_case").on(table.caseId),
    index("idx_supervisor_events_type").on(table.eventType),
    index("idx_supervisor_events_assigned").on(table.assignedUserId),
  ],
);
