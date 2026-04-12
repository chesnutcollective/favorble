/**
 * Billing data seed script for Hogan & Smith CaseFlow.
 *
 * Populates the staging database with realistic billing data:
 *   - 15 invoices across all statuses (draft, sent, paid, overdue, void)
 *   - 50 time entries (billable hours logged by staff)
 *   - 20 expenses (medical records, filing fees, mileage, copies)
 *   - 8 payments matching paid invoices
 *   - Invoice line items linking time entries and expenses to invoices
 *
 * Run with: pnpm tsx scripts/seed-billing-data.ts --yes-staging
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { faker } from "@faker-js/faker";
import * as schema from "../db/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

faker.seed(99);

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomItems<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function randomDateBetween(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime()),
  );
}

function centsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

const argv = new Set(process.argv.slice(2));

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const connectionString = rawUrl.replace(/\\n$/, "").replace(/\n$/, "");

const hostMatch = connectionString.match(/@([^:?]+)(?::|\/|\?|$)/);
const host = hostMatch?.[1] ?? "";
const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
if (!isLocal && !argv.has("--yes-staging")) {
  console.error(
    `Refusing: DATABASE_URL host is "${host}". Pass --yes-staging to run against a remote DB.`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Time entry descriptions (SSD law firm context)
// ---------------------------------------------------------------------------

const TIME_DESCRIPTIONS = [
  "Review medical records",
  "Prepare hearing brief",
  "Client phone call",
  "Draft interrogatories",
  "Review SSA denial letter",
  "Prepare claimant questionnaire",
  "Conference with medical expert",
  "Analyze vocational evidence",
  "Draft pre-hearing memorandum",
  "Review consultative examination report",
  "Prepare client for hearing testimony",
  "Draft appeal to Appeals Council",
  "Review RFC assessment",
  "Coordinate with treating physician",
  "Research disability listing criteria",
  "Prepare objections to VE testimony",
  "Review earnings record",
  "Draft fee petition",
  "Analyze mental health records",
  "Prepare medical source statement request",
  "Review ALJ decision for errors",
  "Conference call with SSA representative",
  "Update case chronology",
  "Draft response to SSA request for information",
  "Review pharmacy records",
];

const EXPENSE_CONFIGS = {
  medical_record_fee: {
    descriptions: [
      "Medical records - Dr. Johnson",
      "Radiology records - City Hospital",
      "Mental health records - Behavioral Health Center",
      "Pharmacy records - Walgreens",
      "Emergency room records - St. Mary's",
      "Lab results - Quest Diagnostics",
    ],
    minCents: 2500,
    maxCents: 15000,
  },
  filing_fee: {
    descriptions: [
      "Federal court filing fee",
      "Appeals Council filing fee",
      "District court filing fee",
      "Motion filing fee",
    ],
    minCents: 5000,
    maxCents: 40000,
  },
  mileage: {
    descriptions: [
      "Travel to hearing office",
      "Travel to client meeting",
      "Travel to medical examination",
      "Travel to SSA field office",
    ],
    minCents: 2000,
    maxCents: 8000,
  },
  copy: {
    descriptions: [
      "Copy costs - hearing exhibit binder",
      "Copy costs - medical records summary",
      "Copy costs - appeal documents",
      "Copy costs - client file",
    ],
    minCents: 500,
    maxCents: 5000,
  },
} as const;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  console.log("=== Hogan & Smith Billing Data Seed ===\n");

  // -------------------------------------------------------------------------
  // Fetch existing org, users, cases
  // -------------------------------------------------------------------------

  const org = await db.query.organizations.findFirst();
  if (!org) {
    throw new Error(
      "No organization found. Run the base seed first: npx tsx db/seed/index.ts",
    );
  }
  const organizationId = org.id;
  console.log(`Organization: ${org.name} (${organizationId})`);

  const existingUsers = await db.query.users.findMany({
    where: eq(schema.users.organizationId, organizationId),
  });
  if (existingUsers.length === 0) {
    throw new Error("No users found. Run the base seed first.");
  }
  console.log(`Found ${existingUsers.length} users`);

  const existingCases = await db.query.cases.findMany({
    where: eq(schema.cases.organizationId, organizationId),
  });
  if (existingCases.length === 0) {
    throw new Error("No cases found. Run the demo data seed first.");
  }
  console.log(`Found ${existingCases.length} cases`);

  // -------------------------------------------------------------------------
  // Idempotency check — skip if invoices already exist
  // -------------------------------------------------------------------------

  const existingInvoices = await db.query.invoices.findMany({
    where: eq(schema.invoices.organizationId, organizationId),
  });
  if (existingInvoices.length > 0) {
    console.log(
      `\nFound ${existingInvoices.length} existing invoices. Billing data already seeded — skipping.`,
    );
    console.log(
      "To re-seed, delete existing billing data first or reset the database.",
    );
    await client.end();
    return;
  }

  // -------------------------------------------------------------------------
  // Pick random cases and users for seeding
  // -------------------------------------------------------------------------

  const casePool = randomItems(
    existingCases,
    Math.min(15, existingCases.length),
  );
  const userPool = existingUsers;

  // -------------------------------------------------------------------------
  // 1. Create 15 invoices
  // -------------------------------------------------------------------------

  console.log("\nSeeding invoices...");

  type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";
  const invoiceStatuses: InvoiceStatus[] = [
    "draft",
    "draft",
    "draft",
    "sent",
    "sent",
    "sent",
    "sent",
    "sent",
    "paid",
    "paid",
    "paid",
    "overdue",
    "overdue",
    "void",
    "void",
  ];

  const invoiceInserts: (typeof schema.invoices.$inferInsert)[] = [];

  for (let i = 0; i < 15; i++) {
    const status = invoiceStatuses[i];
    const linkedCase = casePool[i % casePool.length];
    const createdBy = randomItem(userPool);

    // SSD attorney fees: $2,000 - $9,200 (SSA fee cap)
    const subtotalCents = faker.number.int({ min: 200000, max: 920000 });
    const taxCents = 0; // legal fees typically not taxed
    const totalCents = subtotalCents + taxCents;

    const issueDate = randomDateBetween(daysAgo(120), daysAgo(5));
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + 30);

    let paidDate: Date | null = null;
    let amountPaidCents = 0;
    let sentAt: Date | null = null;

    if (status === "paid") {
      paidDate = randomDateBetween(issueDate, new Date());
      amountPaidCents = totalCents;
      sentAt = issueDate;
    } else if (status === "sent") {
      sentAt = issueDate;
    } else if (status === "overdue") {
      sentAt = issueDate;
    }

    invoiceInserts.push({
      organizationId,
      caseId: linkedCase.id,
      invoiceNumber: `INV-2025-${String(i + 1).padStart(4, "0")}`,
      status,
      issueDate,
      dueDate,
      paidDate,
      subtotalCents,
      taxCents,
      totalCents,
      amountPaidCents,
      notes:
        status === "void"
          ? "Voided — duplicate invoice"
          : (faker.helpers.maybe(() => `Fee approved per SSA fee agreement`, {
              probability: 0.4,
            }) ?? null),
      sentToEmail:
        status !== "draft"
          ? faker.internet.email({ provider: "example.com" })
          : null,
      sentAt,
      createdBy: createdBy.id,
    });
  }

  const insertedInvoices = await db
    .insert(schema.invoices)
    .values(invoiceInserts)
    .returning();

  console.log(`  Created ${insertedInvoices.length} invoices`);

  // Group invoices by status for later reference
  const paidInvoices = insertedInvoices.filter((inv) => inv.status === "paid");
  const sentInvoices = insertedInvoices.filter((inv) => inv.status === "sent");
  const billableInvoices = insertedInvoices.filter(
    (inv) => inv.status !== "void" && inv.status !== "draft",
  );

  // -------------------------------------------------------------------------
  // 2. Create 50 time entries
  // -------------------------------------------------------------------------

  console.log("Seeding time entries...");

  const timeEntryInserts: (typeof schema.timeEntries.$inferInsert)[] = [];
  const hourlyRates = ["150.00", "200.00", "250.00", "300.00", "175.00"];

  // Link ~30 time entries to invoices, ~20 unbilled
  const invoicesForTimeEntries = [
    ...billableInvoices,
    ...randomItems(
      insertedInvoices.filter((inv) => inv.status === "draft"),
      2,
    ),
  ];

  for (let i = 0; i < 50; i++) {
    const user = randomItem(userPool);
    const linkedCase = randomItem(casePool);
    const durationMinutes = faker.helpers.arrayElement([
      15, 30, 30, 45, 60, 60, 90, 120, 120, 180, 240, 480,
    ]);

    const isBilled = i < 30;
    const linkedInvoice = isBilled ? randomItem(invoicesForTimeEntries) : null;

    timeEntryInserts.push({
      organizationId,
      userId: user.id,
      caseId: linkedCase.id,
      description: randomItem(TIME_DESCRIPTIONS),
      durationMinutes,
      billable: true,
      hourlyRate: randomItem(hourlyRates),
      billedAt: isBilled
        ? daysAgo(faker.number.int({ min: 1, max: 60 }))
        : null,
      invoiceId: linkedInvoice?.id ?? null,
      entryDate: randomDateBetween(daysAgo(90), daysAgo(1)),
    });
  }

  const insertedTimeEntries = await db
    .insert(schema.timeEntries)
    .values(timeEntryInserts)
    .returning();

  console.log(`  Created ${insertedTimeEntries.length} time entries`);

  // -------------------------------------------------------------------------
  // 3. Create 20 expenses
  // -------------------------------------------------------------------------

  console.log("Seeding expenses...");

  type ExpenseType = "filing_fee" | "medical_record_fee" | "copy" | "mileage";
  const expenseTypes: ExpenseType[] = [
    "medical_record_fee",
    "medical_record_fee",
    "medical_record_fee",
    "medical_record_fee",
    "medical_record_fee",
    "medical_record_fee",
    "filing_fee",
    "filing_fee",
    "filing_fee",
    "filing_fee",
    "mileage",
    "mileage",
    "mileage",
    "mileage",
    "copy",
    "copy",
    "copy",
    "copy",
    "medical_record_fee",
    "filing_fee",
  ];

  const expenseInserts: (typeof schema.expenses.$inferInsert)[] = [];

  for (let i = 0; i < 20; i++) {
    const expenseType = expenseTypes[i];
    const cfg = EXPENSE_CONFIGS[expenseType];
    const amountCents = faker.number.int({
      min: cfg.minCents,
      max: cfg.maxCents,
    });

    const isBilled = i < 12;
    const linkedInvoice = isBilled ? randomItem(billableInvoices) : null;
    const isReimbursable = faker.datatype.boolean({ probability: 0.7 });

    expenseInserts.push({
      organizationId,
      caseId: randomItem(casePool).id,
      description: randomItem(cfg.descriptions),
      amountCents,
      expenseType,
      reimbursable: isReimbursable,
      billedAt: isBilled
        ? daysAgo(faker.number.int({ min: 1, max: 60 }))
        : null,
      invoiceId: linkedInvoice?.id ?? null,
      incurredDate: randomDateBetween(daysAgo(120), daysAgo(3)),
      createdBy: randomItem(userPool).id,
    });
  }

  const insertedExpenses = await db
    .insert(schema.expenses)
    .values(expenseInserts)
    .returning();

  console.log(`  Created ${insertedExpenses.length} expenses`);

  // -------------------------------------------------------------------------
  // 4. Create invoice line items
  // -------------------------------------------------------------------------

  console.log("Seeding invoice line items...");

  const lineItemInserts: (typeof schema.invoiceLineItems.$inferInsert)[] = [];

  // Line items for time entries linked to invoices
  for (const te of insertedTimeEntries.filter((t) => t.invoiceId)) {
    const hours = te.durationMinutes / 60;
    const rate = Number(te.hourlyRate ?? "200");
    const rateCents = Math.round(rate * 100);
    const totalCents = Math.round(hours * rateCents);

    lineItemInserts.push({
      invoiceId: te.invoiceId!,
      type: "time",
      description: `${te.description} (${hours.toFixed(1)} hrs @ $${rate}/hr)`,
      quantity: hours.toFixed(3),
      unitPriceCents: rateCents,
      totalCents,
      sourceTimeEntryId: te.id,
    });
  }

  // Line items for expenses linked to invoices
  for (const exp of insertedExpenses.filter((e) => e.invoiceId)) {
    lineItemInserts.push({
      invoiceId: exp.invoiceId!,
      type: "expense",
      description: exp.description,
      quantity: "1",
      unitPriceCents: exp.amountCents,
      totalCents: exp.amountCents,
      sourceExpenseId: exp.id,
    });
  }

  // Add a flat fee line item to each invoice that doesn't have line items yet
  const invoiceIdsWithLineItems = new Set(
    lineItemInserts.map((li) => li.invoiceId),
  );
  for (const inv of insertedInvoices) {
    if (!invoiceIdsWithLineItems.has(inv.id)) {
      lineItemInserts.push({
        invoiceId: inv.id,
        type: "fee",
        description: "Attorney fee per SSA fee agreement",
        quantity: "1",
        unitPriceCents: inv.totalCents,
        totalCents: inv.totalCents,
      });
    }
  }

  if (lineItemInserts.length > 0) {
    const insertedLineItems = await db
      .insert(schema.invoiceLineItems)
      .values(lineItemInserts)
      .returning();
    console.log(`  Created ${insertedLineItems.length} invoice line items`);
  }

  // -------------------------------------------------------------------------
  // 5. Create 8 payments for paid invoices
  // -------------------------------------------------------------------------

  console.log("Seeding payments...");

  const paymentMethods: ("check" | "ach" | "trust_transfer")[] = [
    "check",
    "check",
    "check",
    "ach",
    "ach",
    "trust_transfer",
    "trust_transfer",
    "trust_transfer",
  ];

  const paymentInserts: (typeof schema.payments.$inferInsert)[] = [];

  // Each paid invoice gets at least one payment
  for (let i = 0; i < paidInvoices.length; i++) {
    const inv = paidInvoices[i];
    paymentInserts.push({
      organizationId,
      invoiceId: inv.id,
      amountCents: inv.totalCents,
      paymentMethod: paymentMethods[i % paymentMethods.length],
      paymentDate: inv.paidDate ?? daysAgo(5),
      referenceNumber: `REF-${faker.string.alphanumeric(8).toUpperCase()}`,
      notes:
        faker.helpers.maybe(() => "Payment received from SSA direct deposit", {
          probability: 0.5,
        }) ?? null,
      createdBy: randomItem(userPool).id,
    });
  }

  // Add a few more partial payments on sent invoices to reach 8 total
  const remainingPayments = 8 - paymentInserts.length;
  for (let i = 0; i < remainingPayments && i < sentInvoices.length; i++) {
    const inv = sentInvoices[i];
    const partialAmount = Math.round(inv.totalCents * 0.5);

    paymentInserts.push({
      organizationId,
      invoiceId: inv.id,
      amountCents: partialAmount,
      paymentMethod:
        paymentMethods[(paidInvoices.length + i) % paymentMethods.length],
      paymentDate: daysAgo(faker.number.int({ min: 1, max: 20 })),
      referenceNumber: `REF-${faker.string.alphanumeric(8).toUpperCase()}`,
      notes: "Partial payment received",
      createdBy: randomItem(userPool).id,
    });

    // Update the invoice's amountPaidCents
    await db
      .update(schema.invoices)
      .set({ amountPaidCents: partialAmount })
      .where(eq(schema.invoices.id, inv.id));
  }

  const insertedPayments = await db
    .insert(schema.payments)
    .values(paymentInserts)
    .returning();

  console.log(`  Created ${insertedPayments.length} payments`);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  console.log("\n=== Billing Seed Summary ===");
  console.log(`  Invoices:           ${insertedInvoices.length}`);
  console.log(
    `    Draft:            ${insertedInvoices.filter((i) => i.status === "draft").length}`,
  );
  console.log(
    `    Sent:             ${insertedInvoices.filter((i) => i.status === "sent").length}`,
  );
  console.log(
    `    Paid:             ${insertedInvoices.filter((i) => i.status === "paid").length}`,
  );
  console.log(
    `    Overdue:          ${insertedInvoices.filter((i) => i.status === "overdue").length}`,
  );
  console.log(
    `    Void:             ${insertedInvoices.filter((i) => i.status === "void").length}`,
  );
  console.log(`  Time entries:       ${insertedTimeEntries.length}`);
  console.log(`  Expenses:           ${insertedExpenses.length}`);
  console.log(`  Invoice line items: ${lineItemInserts.length}`);
  console.log(`  Payments:           ${insertedPayments.length}`);

  const totalBilled = insertedInvoices.reduce(
    (sum, inv) => sum + inv.totalCents,
    0,
  );
  const totalPaid = insertedPayments.reduce((sum, p) => sum + p.amountCents, 0);
  console.log(`\n  Total billed:  ${centsToDollars(totalBilled)}`);
  console.log(`  Total paid:    ${centsToDollars(totalPaid)}`);
  console.log(`  Outstanding:   ${centsToDollars(totalBilled - totalPaid)}`);

  console.log("\nDone!");
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
