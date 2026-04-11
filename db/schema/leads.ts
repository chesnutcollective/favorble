import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  integer,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { leadStatusEnum, signatureStatusEnum } from "./enums";

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    status: leadStatusEnum("status").notNull().default("new"),
    // Extended 30+ stage pipeline (free-form, managed via lead-pipeline-config.ts)
    // We keep the existing status enum for backward compatibility and add these
    // free-form text columns to support the richer MyCase-style pipeline.
    pipelineStage: text("pipeline_stage"),
    pipelineStageGroup: text("pipeline_stage_group"),
    pipelineStageOrder: integer("pipeline_stage_order"),
    source: text("source").default("website"),
    sourceData: jsonb("source_data").default({}),
    assignedToId: uuid("assigned_to_id").references(() => users.id),
    convertedToCaseId: uuid("converted_to_case_id"),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    intakeData: jsonb("intake_data").default({}),
    metadata: jsonb("metadata").default({}),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_leads_org_status").on(table.organizationId, table.status),
    index("idx_leads_assigned").on(table.assignedToId),
    index("idx_leads_org_created").on(table.organizationId, table.createdAt),
    index("idx_leads_pipeline_stage").on(
      table.organizationId,
      table.pipelineStage,
    ),
  ],
);

export const leadSignatureRequests = pgTable(
  "lead_signature_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    signerEmail: text("signer_email").notNull(),
    signerName: text("signer_name").notNull(),
    contractType: text("contract_type").default("retainer"),
    status: signatureStatusEnum("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (table) => [
    index("idx_lead_sig_lead").on(table.leadId),
    index("idx_lead_sig_status").on(table.status),
  ],
);
