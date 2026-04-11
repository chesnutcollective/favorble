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
import { users } from "./users";
import { coachingFlagStatusEnum } from "./enums";

/**
 * Coaching flags raised when a user's metrics suggest underperformance.
 * Feeds CC-1, CC-3. A flag links to the metric that triggered it and
 * the suggested action steps.
 */
export const coachingFlags = pgTable(
  "coaching_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    // The team member the flag is about
    subjectUserId: uuid("subject_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The supervisor who should act on this flag (if auto-assigned)
    supervisorUserId: uuid("supervisor_user_id").references(() => users.id),
    role: text("role").notNull(),
    // Metric key from role-metrics that triggered the flag
    metricKey: text("metric_key").notNull(),
    // How far off the target is this user? (e.g. z-score, delta %)
    severity: integer("severity").notNull(), // 1-10
    status: coachingFlagStatusEnum("status").notNull().default("open"),
    summary: text("summary").notNull(),
    // Action steps array — each is { label, description, dueDate? }
    suggestedActionSteps: jsonb("suggested_action_steps").notNull().default([]),
    // Is this a process problem (team-wide) or people problem (outlier)?
    classification: text("classification"), // "people" | "process" | "unclear"
    notes: text("notes"),
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
    index("idx_coaching_flags_subject").on(table.subjectUserId),
    index("idx_coaching_flags_org_status").on(
      table.organizationId,
      table.status,
    ),
  ],
);

/**
 * Drafted coaching conversations — the AI pulls the subject user's
 * recent activity (audit + tasks + communications + stage transitions)
 * and drafts a conversation outline for the supervisor. Feeds CC-2,
 * CC-4 (the call script variant is a draft in ai_drafts with type
 * coaching_conversation).
 */
export const coachingDrafts = pgTable(
  "coaching_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    coachingFlagId: uuid("coaching_flag_id")
      .references(() => coachingFlags.id, { onDelete: "set null" }),
    subjectUserId: uuid("subject_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    supervisorUserId: uuid("supervisor_user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    // Narrative conversation outline — talking points, specific examples,
    // suggested improvement plan
    body: text("body").notNull(),
    // File-specific examples the AI pulled:
    //   [{ caseId, eventDate, observation }, ...]
    examples: jsonb("examples"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_coaching_drafts_subject").on(table.subjectUserId),
    index("idx_coaching_drafts_supervisor").on(table.supervisorUserId),
  ],
);

/**
 * Training gaps — aggregated across all users in a role. Distinguishes
 * "one person is struggling" from "the whole team is struggling with
 * X." Feeds CC-3.
 */
export const trainingGaps = pgTable(
  "training_gaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    role: text("role").notNull(),
    metricKey: text("metric_key").notNull(),
    // How many users in the role are below target for this metric
    affectedUserCount: integer("affected_user_count").notNull(),
    totalUserCount: integer("total_user_count").notNull(),
    // Short description of the gap
    summary: text("summary").notNull(),
    // Suggested training response
    recommendation: text("recommendation"),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_training_gaps_role").on(table.role),
  ],
);
