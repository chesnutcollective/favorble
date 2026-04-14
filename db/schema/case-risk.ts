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
import { cases } from "./cases";

/**
 * Per-case risk score. Updated by a scanner service that rolls up
 * signals from stage dwell time, task overdue count, ALJ historical
 * win rate, communication gaps, MR status, hearing proximity, missed
 * deadlines, and client sentiment.
 *
 * Feeds PR-1 directly. Signals are surfaced in `factors` so the UI can
 * show "why is this case flagged?" without re-running the scorer.
 *
 * Starts as a heuristic (weighted sum of factors). Upgradeable to ML
 * later without schema change.
 */
export const caseRiskScores = pgTable(
  "case_risk_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" })
      .unique(),
    // Risk score 0-100. Higher = riskier.
    score: integer("score").notNull().default(0),
    // "low" / "medium" / "high" / "critical" — derived buckets
    riskBand: text("risk_band").notNull().default("low"),
    // Array of factor objects:
    //   { key, label, contribution, note }
    factors: jsonb("factors").notNull().default([]),
    // When the scorer last ran this
    scoredAt: timestamp("scored_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Version of the scoring logic, so we can recompute old scores if
    // we change the formula
    scorerVersion: text("scorer_version").notNull().default("v1"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_case_risk_org_band").on(table.organizationId, table.riskBand),
    index("idx_case_risk_score").on(table.score),
  ],
);
