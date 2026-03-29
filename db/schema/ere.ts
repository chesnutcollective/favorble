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
import { cases } from "./cases";
import { users } from "./users";
import { ereJobStatusEnum, ereJobTypeEnum } from "./enums";

export const ereCredentials = pgTable(
  "ere_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    label: text("label"),
    usernameEncrypted: text("username_encrypted").notNull(),
    passwordEncrypted: text("password_encrypted").notNull(),
    totpSecretEncrypted: text("totp_secret_encrypted"),
    isActive: boolean("is_active").notNull().default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    lastErrorMessage: text("last_error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (table) => [
    index("idx_ere_creds_org").on(table.organizationId),
    index("idx_ere_creds_org_active").on(table.organizationId, table.isActive),
  ],
);

export const ereJobs = pgTable(
  "ere_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    credentialId: uuid("credential_id")
      .notNull()
      .references(() => ereCredentials.id),
    jobType: ereJobTypeEnum("job_type").notNull().default("full_scrape"),
    status: ereJobStatusEnum("status").notNull().default("pending"),
    ssaClaimNumber: text("ssa_claim_number"),
    documentsFound: integer("documents_found"),
    documentsDownloaded: integer("documents_downloaded"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (table) => [
    index("idx_ere_jobs_case").on(table.caseId),
    index("idx_ere_jobs_org_status").on(table.organizationId, table.status),
    index("idx_ere_jobs_created").on(table.createdAt),
    index("idx_ere_jobs_case_status").on(table.caseId, table.status),
  ],
);

export const scrapedCaseData = pgTable(
  "scraped_case_data",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    ereJobId: uuid("ere_job_id")
      .notNull()
      .references(() => ereJobs.id),
    claimStatus: text("claim_status"),
    hearingDate: timestamp("hearing_date", { withTimezone: true }),
    hearingOffice: text("hearing_office"),
    adminLawJudge: text("admin_law_judge"),
    documentsOnFile: integer("documents_on_file"),
    rawData: jsonb("raw_data"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_scraped_case_created").on(table.caseId, table.createdAt),
  ],
);
