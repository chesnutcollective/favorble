import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { cases } from "./cases";
import { contacts } from "./contacts";

// ---------- Enums ----------

export const expenseTypeEnum = pgEnum("expense_type", [
  "filing_fee",
  "medical_record_fee",
  "copy",
  "mileage",
  "other",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "overdue",
  "void",
]);

export const invoiceLineItemTypeEnum = pgEnum("invoice_line_item_type", [
  "time",
  "expense",
  "fee",
  "other",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "check",
  "ach",
  "credit_card",
  "trust_transfer",
  "other",
]);

// ---------- Invoices (declared first because other tables FK to it) ----------

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id").references(() => cases.id),
    clientContactId: uuid("client_contact_id").references(() => contacts.id),
    invoiceNumber: text("invoice_number").notNull(),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    issueDate: timestamp("issue_date", { withTimezone: true })
      .defaultNow()
      .notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    paidDate: timestamp("paid_date", { withTimezone: true }),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    amountPaidCents: integer("amount_paid_cents").notNull().default(0),
    notes: text("notes"),
    sentToEmail: text("sent_to_email"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_invoices_org").on(table.organizationId),
    index("idx_invoices_org_status").on(table.organizationId, table.status),
    index("idx_invoices_case").on(table.caseId),
    index("idx_invoices_client").on(table.clientContactId),
    uniqueIndex("idx_invoices_org_number").on(
      table.organizationId,
      table.invoiceNumber,
    ),
  ],
);

// ---------- Time Entries ----------

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    caseId: uuid("case_id").references(() => cases.id),
    description: text("description").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    billable: boolean("billable").notNull().default(true),
    hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
    billedAt: timestamp("billed_at", { withTimezone: true }),
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    entryDate: timestamp("entry_date", { withTimezone: true })
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
    index("idx_time_entries_org").on(table.organizationId),
    index("idx_time_entries_user").on(table.userId),
    index("idx_time_entries_case").on(table.caseId),
    index("idx_time_entries_invoice").on(table.invoiceId),
    index("idx_time_entries_org_date").on(
      table.organizationId,
      table.entryDate,
    ),
    index("idx_time_entries_org_billed").on(
      table.organizationId,
      table.billedAt,
    ),
  ],
);

// ---------- Expenses ----------

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id").references(() => cases.id),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    expenseType: expenseTypeEnum("expense_type").notNull().default("other"),
    reimbursable: boolean("reimbursable").notNull().default(true),
    billedAt: timestamp("billed_at", { withTimezone: true }),
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    incurredDate: timestamp("incurred_date", { withTimezone: true })
      .defaultNow()
      .notNull(),
    receiptUrl: text("receipt_url"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_expenses_org").on(table.organizationId),
    index("idx_expenses_case").on(table.caseId),
    index("idx_expenses_invoice").on(table.invoiceId),
    index("idx_expenses_org_type").on(table.organizationId, table.expenseType),
  ],
);

// ---------- Invoice Line Items ----------

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    type: invoiceLineItemTypeEnum("type").notNull().default("other"),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 })
      .notNull()
      .default("1"),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    sourceTimeEntryId: uuid("source_time_entry_id").references(
      () => timeEntries.id,
    ),
    sourceExpenseId: uuid("source_expense_id").references(() => expenses.id),
  },
  (table) => [index("idx_invoice_line_items_invoice").on(table.invoiceId)],
);

// ---------- Payments ----------

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    amountCents: integer("amount_cents").notNull(),
    paymentMethod: paymentMethodEnum("payment_method")
      .notNull()
      .default("check"),
    paymentDate: timestamp("payment_date", { withTimezone: true })
      .defaultNow()
      .notNull(),
    referenceNumber: text("reference_number"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_payments_org").on(table.organizationId),
    index("idx_payments_invoice").on(table.invoiceId),
    index("idx_payments_org_date").on(table.organizationId, table.paymentDate),
  ],
);
