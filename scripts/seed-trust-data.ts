/**
 * Seed realistic trust accounting data for the /trust page.
 *
 * Creates:
 *   - 2 trust accounts (IOLTA + operating trust)
 *   - 30 trust transactions (deposits, withdrawals, fees, transfers, refunds)
 *
 * Idempotent — skips if trust accounts already exist for the org.
 *
 * Run:
 *   pnpm tsx scripts/seed-trust-data.ts --yes-staging
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../db/schema";

// ---------- Guardrails ----------

const argv = new Set(process.argv.slice(2));
if (!argv.has("--yes-staging")) {
  console.error(
    "Refusing to run without --yes-staging flag (prevents accidental execution).",
  );
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL?.replace(/\\n$/, "").trim();
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

// ---------- Helpers ----------

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function centsBetween(minDollars: number, maxDollars: number): number {
  return (
    Math.round(
      (minDollars + Math.random() * (maxDollars - minDollars)) * 100,
    ) || 100
  );
}

function refNumber(prefix: string): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${num}`;
}

// ---------- Main ----------

async function main() {
  const client = postgres(DATABASE_URL!);
  const db = drizzle(client, { schema });

  console.log("=== Trust Accounting Data Seed ===\n");

  // Fetch org
  const org = await db.query.organizations.findFirst();
  if (!org) {
    throw new Error("No organization found. Run the base seed first.");
  }
  const organizationId = org.id;
  console.log(`Organization: ${org.name} (${organizationId})`);

  // Fetch a user for createdBy
  const existingUsers = await db.query.users.findMany({
    where: eq(schema.users.organizationId, organizationId),
  });
  if (existingUsers.length === 0) {
    throw new Error("No users found. Run the base seed first.");
  }
  console.log(`Found ${existingUsers.length} users`);

  // Fetch cases and contacts to link transactions
  const existingCases = await db.query.cases.findMany({
    where: eq(schema.cases.organizationId, organizationId),
  });
  console.log(`Found ${existingCases.length} cases`);

  const existingContacts = await db.query.contacts.findMany({
    where: eq(schema.contacts.organizationId, organizationId),
  });
  console.log(`Found ${existingContacts.length} contacts`);

  // Idempotency check — look for existing trust accounts in this org
  const existingTrustAccounts = await db.query.trustAccounts.findMany({
    where: eq(schema.trustAccounts.organizationId, organizationId),
  });
  if (existingTrustAccounts.length > 0) {
    console.log(
      `\nFound ${existingTrustAccounts.length} existing trust accounts. Trust data already seeded — skipping.`,
    );
    console.log(
      "To re-seed, delete existing trust accounts first or reset the database.",
    );
    await client.end();
    return;
  }

  // -----------------------------------------------------------------------
  // 1. Create trust accounts
  // -----------------------------------------------------------------------

  const [ioltaAccount] = await db
    .insert(schema.trustAccounts)
    .values({
      organizationId,
      name: "Hogan Smith IOLTA Account",
      bankName: "First National Bank",
      accountNumberEncrypted: "enc:****7832",
      balanceCents: 0, // will be updated after transactions
      createdAt: daysAgo(365),
    })
    .returning();

  const [operatingTrust] = await db
    .insert(schema.trustAccounts)
    .values({
      organizationId,
      name: "Hogan Smith Operating Trust",
      bankName: "First National Bank",
      accountNumberEncrypted: "enc:****4190",
      balanceCents: 0,
      createdAt: daysAgo(300),
    })
    .returning();

  console.log(`\nCreated trust accounts:`);
  console.log(`  - ${ioltaAccount.name} (${ioltaAccount.id})`);
  console.log(`  - ${operatingTrust.name} (${operatingTrust.id})`);

  // -----------------------------------------------------------------------
  // 2. Build 30 transactions with a running balance
  // -----------------------------------------------------------------------

  type TxSeed = {
    trustAccountId: string;
    transactionType:
      | "deposit"
      | "withdrawal"
      | "transfer_out"
      | "fee"
      | "refund";
    amountCents: number;
    description: string;
    referenceNumber: string;
    transactionDate: Date;
    reconciled: boolean;
    caseId: string | null;
    clientContactId: string | null;
    createdBy: string;
  };

  const defaultUser = existingUsers[0];

  // Helpers to optionally link a case and/or contact
  function maybeCase(): string | null {
    if (existingCases.length === 0) return null;
    return Math.random() > 0.3 ? randomItem(existingCases).id : null;
  }
  function maybeContact(): string | null {
    if (existingContacts.length === 0) return null;
    return Math.random() > 0.4 ? randomItem(existingContacts).id : null;
  }

  // Build transaction definitions (sorted newest → oldest, we'll reverse for insertion)
  const txDefs: TxSeed[] = [];

  // -- 10 deposits --
  const depositDescriptions = [
    "SSA back pay settlement — claimant disability award",
    "Retainer deposit — new SSDI claim",
    "SSA past-due benefits — favorable decision",
    "Client retainer — SSI application",
    "Settlement proceeds — ALJ hearing favorable",
    "SSA back pay — concurrent Title II/XVI",
    "Client advance retainer deposit",
    "Supplemental award — remand decision",
    "SSA lump-sum past-due benefits",
    "Retainer top-up — appeals council review",
  ];
  for (let i = 0; i < 10; i++) {
    const isRecent = i >= 7; // last 3 are recent
    txDefs.push({
      trustAccountId: i < 7 ? ioltaAccount.id : operatingTrust.id,
      transactionType: "deposit",
      amountCents: centsBetween(500, 50000),
      description: depositDescriptions[i],
      referenceNumber: refNumber("DEP"),
      transactionDate: isRecent
        ? daysAgo(Math.floor(Math.random() * 25))
        : daysAgo(35 + Math.floor(Math.random() * 300)),
      reconciled: !isRecent,
      caseId: maybeCase(),
      clientContactId: maybeContact(),
      createdBy: randomItem(existingUsers).id,
    });
  }

  // -- 8 withdrawals --
  const withdrawalDescriptions = [
    "Attorney fee disbursement — 25% of past-due benefits",
    "Client refund — overpayment correction",
    "Fee disbursement — representative payee case",
    "Attorney fee — ALJ hearing contingency",
    "Disbursement to client — net settlement proceeds",
    "Attorney fee — federal court appeal",
    "Client disbursement — remaining trust balance",
    "Fee disbursement — concurrent claim award",
  ];
  for (let i = 0; i < 8; i++) {
    const isRecent = i >= 6;
    txDefs.push({
      trustAccountId: i < 6 ? ioltaAccount.id : operatingTrust.id,
      transactionType: "withdrawal",
      amountCents: centsBetween(500, 10000),
      description: withdrawalDescriptions[i],
      referenceNumber: refNumber("WDR"),
      transactionDate: isRecent
        ? daysAgo(Math.floor(Math.random() * 28))
        : daysAgo(30 + Math.floor(Math.random() * 250)),
      reconciled: !isRecent,
      caseId: maybeCase(),
      clientContactId: maybeContact(),
      createdBy: randomItem(existingUsers).id,
    });
  }

  // -- 5 fee transactions --
  const feeDescriptions = [
    "Filing fee — federal court appeal",
    "Medical records request fee — Dr. Martinez",
    "CE exam fee — psychological evaluation",
    "Medical records fee — Regional Medical Center",
    "Filing fee — Appeals Council submission",
  ];
  for (let i = 0; i < 5; i++) {
    const isRecent = i >= 3;
    txDefs.push({
      trustAccountId: i < 4 ? ioltaAccount.id : operatingTrust.id,
      transactionType: "fee",
      amountCents: centsBetween(25, 500),
      description: feeDescriptions[i],
      referenceNumber: refNumber("FEE"),
      transactionDate: isRecent
        ? daysAgo(Math.floor(Math.random() * 20))
        : daysAgo(40 + Math.floor(Math.random() * 200)),
      reconciled: !isRecent,
      caseId: maybeCase(),
      clientContactId: maybeContact(),
      createdBy: randomItem(existingUsers).id,
    });
  }

  // -- 4 transfer_out --
  const transferDescriptions = [
    "Trust → operating account — earned fees Q4",
    "Trust → operating account — earned fees Q1",
    "Trust → operating account — monthly earned fees",
    "Trust → operating account — quarterly reconciliation",
  ];
  for (let i = 0; i < 4; i++) {
    const isRecent = i >= 3;
    txDefs.push({
      trustAccountId: ioltaAccount.id, // transfers always from IOLTA
      transactionType: "transfer_out",
      amountCents: centsBetween(2000, 15000),
      description: transferDescriptions[i],
      referenceNumber: refNumber("TRF"),
      transactionDate: isRecent
        ? daysAgo(Math.floor(Math.random() * 14))
        : daysAgo(45 + Math.floor(Math.random() * 200)),
      reconciled: !isRecent,
      caseId: null,
      clientContactId: null,
      createdBy: defaultUser.id,
    });
  }

  // -- 3 refunds --
  const refundDescriptions = [
    "Overpayment refund — duplicate SSA deposit corrected",
    "Refund to client — case dismissed, unused retainer",
    "Overpayment return — SSA recalculation",
  ];
  for (let i = 0; i < 3; i++) {
    const isRecent = i >= 2;
    txDefs.push({
      trustAccountId: i < 2 ? ioltaAccount.id : operatingTrust.id,
      transactionType: "refund",
      amountCents: centsBetween(200, 5000),
      description: refundDescriptions[i],
      referenceNumber: refNumber("RFD"),
      transactionDate: isRecent
        ? daysAgo(Math.floor(Math.random() * 10))
        : daysAgo(50 + Math.floor(Math.random() * 150)),
      reconciled: !isRecent,
      caseId: maybeCase(),
      clientContactId: maybeContact(),
      createdBy: randomItem(existingUsers).id,
    });
  }

  // Sort by transaction date ascending (oldest first) so running balance is correct
  txDefs.sort(
    (a, b) => a.transactionDate.getTime() - b.transactionDate.getTime(),
  );

  // -----------------------------------------------------------------------
  // 3. Insert transactions with running balances per account
  // -----------------------------------------------------------------------

  const runningBalance: Record<string, number> = {
    [ioltaAccount.id]: 0,
    [operatingTrust.id]: 0,
  };

  console.log(`\nInserting ${txDefs.length} trust transactions...`);

  for (const tx of txDefs) {
    const acctId = tx.trustAccountId;

    // Deposits add to balance; everything else subtracts
    if (tx.transactionType === "deposit") {
      runningBalance[acctId] += tx.amountCents;
    } else {
      // Make sure we don't go negative — cap the withdrawal at current balance
      if (tx.amountCents > runningBalance[acctId]) {
        tx.amountCents = Math.max(
          Math.floor(runningBalance[acctId] * 0.3),
          100,
        );
      }
      runningBalance[acctId] -= tx.amountCents;
    }

    const balanceAfterCents = runningBalance[acctId];

    await db.insert(schema.trustTransactions).values({
      trustAccountId: tx.trustAccountId,
      caseId: tx.caseId,
      clientContactId: tx.clientContactId,
      transactionType: tx.transactionType,
      amountCents: tx.amountCents,
      balanceAfterCents,
      description: tx.description,
      referenceNumber: tx.referenceNumber,
      transactionDate: tx.transactionDate,
      reconciled: tx.reconciled,
      createdBy: tx.createdBy,
    });
  }

  // -----------------------------------------------------------------------
  // 4. Update trust account balances to final running totals
  // -----------------------------------------------------------------------

  for (const [accountId, balance] of Object.entries(runningBalance)) {
    await db
      .update(schema.trustAccounts)
      .set({ balanceCents: balance })
      .where(eq(schema.trustAccounts.id, accountId));
  }

  const ioltaFinal = (runningBalance[ioltaAccount.id] / 100).toLocaleString(
    "en-US",
    { style: "currency", currency: "USD" },
  );
  const opFinal = (runningBalance[operatingTrust.id] / 100).toLocaleString(
    "en-US",
    { style: "currency", currency: "USD" },
  );

  console.log(`\nFinal balances:`);
  console.log(`  - ${ioltaAccount.name}: ${ioltaFinal}`);
  console.log(`  - ${operatingTrust.name}: ${opFinal}`);
  console.log(
    `\nDone! Seeded 2 trust accounts and ${txDefs.length} transactions.`,
  );

  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
