import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Daily rollup of per-user performance metrics. Populated by a nightly
 * cron reading `tasks`, `communications`, `caseStageTransitions`,
 * `cases`, etc. into a dense table so trend charts and leaderboards
 * don't re-aggregate millions of rows on every page load.
 *
 * Feeds RP-1, RP-2, RP-4, QA-4, SM-5, and the coaching flag detection
 * logic (CC-1, CC-3).
 */
export const performanceSnapshots = pgTable(
  "performance_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Role snapshot — captured so we can still report historically
    // if a user changes role later
    role: text("role").notNull(),
    // The "day" bucket for this snapshot, always midnight-aligned UTC
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    // Canonical metric key (defined in lib/services/role-metrics.ts)
    // e.g. "task_completion_rate", "avg_response_time_minutes",
    // "mr_requests_sent", "hearings_won"
    metricKey: text("metric_key").notNull(),
    // Numeric value for the metric on this day
    value: numeric("value", { precision: 14, scale: 4 }).notNull(),
    // Optional extra context (sample size, breakdown, etc.)
    context: jsonb("context"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("uq_perf_snapshots_user_metric_day").on(
      table.userId,
      table.metricKey,
      table.periodStart,
    ),
    index("idx_perf_snapshots_org_day").on(
      table.organizationId,
      table.periodStart,
    ),
    index("idx_perf_snapshots_role_metric").on(
      table.role,
      table.metricKey,
      table.periodStart,
    ),
  ],
);

/**
 * Team-level rollup of the same metrics. Keeps aggregate queries cheap
 * (leaderboard: "top 5 filing agents this week") and removes the need
 * to sum user rows every time.
 */
export const teamPerformanceSnapshots = pgTable(
  "team_performance_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    team: text("team").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    metricKey: text("metric_key").notNull(),
    value: numeric("value", { precision: 14, scale: 4 }).notNull(),
    // Number of team members contributing to this aggregate
    memberCount: integer("member_count").notNull().default(0),
    context: jsonb("context"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("uq_team_perf_snapshots_team_metric_day").on(
      table.team,
      table.metricKey,
      table.periodStart,
    ),
    index("idx_team_perf_snapshots_org_day").on(
      table.organizationId,
      table.periodStart,
    ),
  ],
);
