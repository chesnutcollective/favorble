import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { users } from "./users";

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    contactType: text("contact_type").notNull().default("claimant"),
    metadata: jsonb("metadata").default({}),
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
    index("idx_contacts_org").on(table.organizationId),
    index("idx_contacts_org_type").on(table.organizationId, table.contactType),
    index("idx_contacts_email").on(table.email),
  ],
);

export const caseContacts = pgTable(
  "case_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    relationship: text("relationship").notNull().default("claimant"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_case_contacts_case").on(table.caseId),
    index("idx_case_contacts_contact").on(table.contactId),
    uniqueIndex("idx_case_contacts_unique").on(
      table.caseId,
      table.contactId,
      table.relationship,
    ),
  ],
);
