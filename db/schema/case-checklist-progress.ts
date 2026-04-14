import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { cases, caseStages } from "./cases";
import { users } from "./users";

/**
 * D4 — Per-case, per-stage checklist progress.
 *
 * Each row represents the status of a single checklist item (identified by
 * its `itemKey`) on a particular stage of a particular case. The set of
 * available items and whether each one is `required` is defined on
 * `case_stages.client_checklist_items`.
 *
 * Required items must be `done` before `changeCaseStage` will allow the case
 * to move off of the stage (unless `forceAdvance: true` is passed).
 */
export const caseChecklistProgress = pgTable(
  "case_checklist_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => caseStages.id),
    itemKey: text("item_key").notNull(),
    // 'pending' | 'done' | 'skipped'
    status: text("status").notNull().default("pending"),
    completedBy: uuid("completed_by").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_checklist_progress_case").on(table.caseId),
    index("idx_checklist_progress_case_stage").on(table.caseId, table.stageId),
    uniqueIndex("idx_checklist_progress_case_stage_item").on(
      table.caseId,
      table.stageId,
      table.itemKey,
    ),
  ],
);
