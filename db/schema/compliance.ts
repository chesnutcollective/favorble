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
import {
  complianceFindingSeverityEnum,
  complianceFindingStatusEnum,
} from "./enums";

/**
 * Compliance rules. Each rule is a named check that runs against cases,
 * documents, communications, or tasks. Rule implementations live in
 * code (lib/services/compliance-scanner.ts) keyed by this code column,
 * but the metadata, description, and severity-in-context live here so
 * admins can see/tune them without deploys.
 *
 * Feeds PR-2.
 */
export const complianceRules = pgTable(
  "compliance_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    // Unique code referenced by the scanner. e.g. "BAR_TRUST_DISBURSEMENT_LOG"
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(), // bar, ethics, documentation, hipaa
    defaultSeverity:
      complianceFindingSeverityEnum("default_severity").notNull().default(
        "medium",
      ),
    enabled: boolean("enabled").notNull().default(true),
    config: jsonb("config"), // rule-specific tuning (thresholds, excludes)
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

/**
 * Compliance findings. A row per (rule, subject) where the scanner
 * found a violation. `subjectType` + `subjectId` is a polymorphic
 * pointer — could point at a case, a document, a user, a communication.
 */
export const complianceFindings = pgTable(
  "compliance_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    ruleCode: text("rule_code").notNull(),
    caseId: uuid("case_id").references(() => cases.id),
    subjectType: text("subject_type").notNull(), // case, document, user, etc.
    subjectId: uuid("subject_id").notNull(),
    severity: complianceFindingSeverityEnum("severity").notNull(),
    status: complianceFindingStatusEnum("status").notNull().default("open"),
    summary: text("summary").notNull(),
    details: jsonb("details"),
    remediationHint: text("remediation_hint"),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    remediatedAt: timestamp("remediated_at", { withTimezone: true }),
    detectedAt: timestamp("detected_at", { withTimezone: true })
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
    index("idx_compliance_findings_org_status").on(
      table.organizationId,
      table.status,
    ),
    index("idx_compliance_findings_case").on(table.caseId),
    index("idx_compliance_findings_severity").on(table.severity),
    index("idx_compliance_findings_rule").on(table.ruleCode),
  ],
);
