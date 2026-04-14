import {
  pgTable,
  uuid,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { cases } from "./cases";
import { users } from "./users";
import { workflowTemplates } from "./workflows";

/**
 * Per-case workflow overrides (D2).
 *
 * Allows disabling a specific `workflowTemplates` row for a specific `cases`
 * row without affecting the global workflow. The workflow engine should
 * consult this table before firing any template for a given case.
 */
export const caseWorkflowOverrides = pgTable(
  "case_workflow_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workflowTemplates.id, { onDelete: "cascade" }),
    disabled: boolean("disabled").notNull().default(true),
    disabledBy: uuid("disabled_by").references(() => users.id),
    disabledAt: timestamp("disabled_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_case_wf_overrides_case").on(table.caseId),
    index("idx_case_wf_overrides_template").on(table.templateId),
    uniqueIndex("idx_case_wf_overrides_case_template").on(
      table.caseId,
      table.templateId,
    ),
  ],
);
