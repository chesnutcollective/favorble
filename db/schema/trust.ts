import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { cases } from "./cases";
import { contacts } from "./contacts";

export const trustTransactionTypeEnum = pgEnum("trust_transaction_type", [
  "deposit",
  "withdrawal",
  "transfer_out",
  "fee",
  "refund",
]);

export const trustAccounts = pgTable(
  "trust_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    accountNumberEncrypted: text("account_number_encrypted"),
    bankName: text("bank_name"),
    balanceCents: integer("balance_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idx_trust_accounts_org").on(table.organizationId)],
);

export const trustTransactions = pgTable(
  "trust_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trustAccountId: uuid("trust_account_id")
      .notNull()
      .references(() => trustAccounts.id),
    caseId: uuid("case_id").references(() => cases.id),
    clientContactId: uuid("client_contact_id").references(() => contacts.id),
    transactionType: trustTransactionTypeEnum("transaction_type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    balanceAfterCents: integer("balance_after_cents").notNull(),
    description: text("description"),
    referenceNumber: text("reference_number"),
    transactionDate: timestamp("transaction_date", { withTimezone: true })
      .defaultNow()
      .notNull(),
    reconciled: boolean("reconciled").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_trust_tx_account").on(table.trustAccountId),
    index("idx_trust_tx_case").on(table.caseId),
    index("idx_trust_tx_client").on(table.clientContactId),
    index("idx_trust_tx_date").on(table.transactionDate),
  ],
);
