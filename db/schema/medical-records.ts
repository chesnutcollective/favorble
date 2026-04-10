import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { users } from "./users";

/**
 * Status for a Request for Functional Capacity form tracked by the
 * Medical Records team.
 */
export const rfcStatusEnum = pgEnum("rfc_status", [
  "not_requested",
  "requested",
  "received",
  "completed",
]);

/**
 * Encrypted credential vault for patient portals / provider sites used
 * by Medical Records Specialists.
 *
 * IMPORTANT: all username / password / TOTP fields are AES-256-GCM
 * encrypted via lib/encryption.ts. They are NEVER returned from list
 * queries — only the credential metadata is exposed to the UI.
 */
export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    providerName: text("provider_name").notNull(),
    label: text("label"),
    usernameEncrypted: text("username_encrypted").notNull(),
    passwordEncrypted: text("password_encrypted").notNull(),
    totpSecretEncrypted: text("totp_secret_encrypted"),
    isActive: boolean("is_active").notNull().default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_provider_creds_org").on(table.organizationId),
    index("idx_provider_creds_org_active").on(
      table.organizationId,
      table.isActive,
    ),
    index("idx_provider_creds_org_provider").on(
      table.organizationId,
      table.providerName,
    ),
  ],
);

/**
 * Request for Functional Capacity (RFC) tracker rows. One case can have
 * multiple RFC requests going out to different providers.
 */
export const rfcRequests = pgTable(
  "rfc_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    status: rfcStatusEnum("status").notNull().default("not_requested"),
    providerName: text("provider_name"),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    notes: text("notes"),
    assignedTo: uuid("assigned_to").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_rfc_requests_org").on(table.organizationId),
    index("idx_rfc_requests_case").on(table.caseId),
    index("idx_rfc_requests_org_status").on(
      table.organizationId,
      table.status,
    ),
    index("idx_rfc_requests_due").on(table.dueDate),
  ],
);
