import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * Lightweight event log for integration health checks, webhook
 * deliveries, and usage counters. Auto-TTL at 30 days via a cron
 * cleanup. Feeds the per-integration detail page sparklines,
 * "last verified" timestamps, and webhook delivery logs.
 */

export const integrationEvents = pgTable(
  "integration_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    /** Matches IntegrationConfig.id from the static registry */
    integrationId: text("integration_id").notNull(),
    /** Event type — determines what the payload contains */
    eventType: text("event_type").notNull(),
    // "health_check" | "webhook_received" | "webhook_delivered" |
    // "api_call" | "error" | "config_changed"

    /** Result of the event */
    status: text("status").notNull(), // "ok" | "warn" | "error" | "timeout"

    /** Response latency in milliseconds (for health checks and API calls) */
    latencyMs: integer("latency_ms"),

    /** HTTP status code if applicable */
    httpStatus: integer("http_status"),

    /** Short human-readable summary */
    summary: text("summary"),

    /** Full payload — request/response bodies for webhook deliveries,
     *  error messages for failures, etc. */
    payload: jsonb("payload"),

    /** For webhook events — the path that was hit */
    webhookPath: text("webhook_path"),

    /** For webhook events — the event type from the source system */
    webhookEventType: text("webhook_event_type"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_integration_events_integration_created").on(
      table.integrationId,
      table.createdAt,
    ),
    index("idx_integration_events_org").on(table.organizationId),
    index("idx_integration_events_type").on(table.eventType),
    index("idx_integration_events_status").on(table.status),
    index("idx_integration_events_created").on(table.createdAt),
  ],
);

/**
 * Alert rules per integration. When an integration's error rate exceeds
 * a threshold, fire a notification to admin users.
 */
export const integrationAlertRules = pgTable(
  "integration_alert_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    integrationId: text("integration_id").notNull(),
    /** Number of failures within the window that triggers the alert */
    failureThreshold: integer("failure_threshold").notNull().default(3),
    /** Window in minutes to count failures */
    windowMinutes: integer("window_minutes").notNull().default(60),
    /** Is this rule active? */
    enabled: text("enabled").notNull().default("true"),
    /** Last time this rule fired (to prevent spam) */
    lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_integration_alert_rules_org").on(table.organizationId),
    index("idx_integration_alert_rules_integration").on(table.integrationId),
  ],
);
