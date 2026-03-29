import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { caseStages } from "./cases";
import { workflowTriggerTypeEnum, teamEnum, taskPriorityEnum } from "./enums";

export const workflowTemplates = pgTable(
  "workflow_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    triggerType: workflowTriggerTypeEnum("trigger_type").notNull(),
    triggerStageId: uuid("trigger_stage_id").references(() => caseStages.id),
    triggerConfig: jsonb("trigger_config").default({}),
    isActive: boolean("is_active").notNull().default(true),
    notifyAssignees: boolean("notify_assignees").notNull().default(true),
    notifyCaseManager: boolean("notify_case_manager").notNull().default(true),
    sendClientMessage: boolean("send_client_message").notNull().default(false),
    clientMessageTemplate: text("client_message_template"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_wf_org").on(table.organizationId),
    index("idx_wf_trigger_stage").on(table.triggerStageId),
    index("idx_wf_org_active").on(table.organizationId, table.isActive),
  ],
);

export const workflowTaskTemplates = pgTable(
  "workflow_task_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowTemplateId: uuid("workflow_template_id")
      .notNull()
      .references(() => workflowTemplates.id),
    title: text("title").notNull(),
    description: text("description"),
    assignToTeam: teamEnum("assign_to_team"),
    assignToRole: text("assign_to_role"),
    assignToUserId: uuid("assign_to_user_id"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    dueDaysOffset: integer("due_days_offset").notNull().default(1),
    dueBusinessDaysOnly: boolean("due_business_days_only")
      .notNull()
      .default(true),
    displayOrder: integer("display_order").notNull().default(0),
    dependsOnTemplateId: uuid("depends_on_template_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idx_wtt_workflow").on(table.workflowTemplateId)],
);
