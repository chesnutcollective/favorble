"use server";

import { db } from "@/db/drizzle";
import { trustAccounts, trustTransactions, cases, contacts } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, eq, desc, gte, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

export type TrustTransactionFilter = {
  from?: Date;
  to?: Date;
  caseId?: string;
  reconciled?: boolean;
};

export async function getTrustAccounts() {
  const session = await requireSession();
  try {
    const accounts = await db
      .select({
        id: trustAccounts.id,
        name: trustAccounts.name,
        bankName: trustAccounts.bankName,
        balanceCents: trustAccounts.balanceCents,
        createdAt: trustAccounts.createdAt,
      })
      .from(trustAccounts)
      .where(eq(trustAccounts.organizationId, session.organizationId))
      .orderBy(trustAccounts.name);
    return accounts;
  } catch (err) {
    logger.error("getTrustAccounts failed", { error: err });
    return [];
  }
}

export async function getTrustTransactions(
  accountId: string,
  filter: TrustTransactionFilter = {},
) {
  await requireSession();
  const conditions = [eq(trustTransactions.trustAccountId, accountId)];

  if (filter.from)
    conditions.push(gte(trustTransactions.transactionDate, filter.from));
  if (filter.to)
    conditions.push(lte(trustTransactions.transactionDate, filter.to));
  if (filter.caseId)
    conditions.push(eq(trustTransactions.caseId, filter.caseId));
  if (filter.reconciled !== undefined)
    conditions.push(eq(trustTransactions.reconciled, filter.reconciled));

  try {
    return await db
      .select({
        id: trustTransactions.id,
        transactionType: trustTransactions.transactionType,
        amountCents: trustTransactions.amountCents,
        balanceAfterCents: trustTransactions.balanceAfterCents,
        description: trustTransactions.description,
        referenceNumber: trustTransactions.referenceNumber,
        transactionDate: trustTransactions.transactionDate,
        reconciled: trustTransactions.reconciled,
        caseId: trustTransactions.caseId,
        caseNumber: cases.caseNumber,
        clientContactId: trustTransactions.clientContactId,
        clientFirstName: contacts.firstName,
        clientLastName: contacts.lastName,
      })
      .from(trustTransactions)
      .leftJoin(cases, eq(trustTransactions.caseId, cases.id))
      .leftJoin(contacts, eq(trustTransactions.clientContactId, contacts.id))
      .where(and(...conditions))
      .orderBy(desc(trustTransactions.transactionDate))
      .limit(200);
  } catch (err) {
    logger.error("getTrustTransactions failed", { error: err });
    return [];
  }
}

async function recordTransaction(input: {
  trustAccountId: string;
  caseId?: string;
  clientContactId?: string;
  transactionType: "deposit" | "withdrawal" | "transfer_out" | "fee" | "refund";
  amountCents: number;
  description?: string;
  referenceNumber?: string;
  transactionDate?: Date;
}) {
  const session = await requireSession();

  // Fetch current account balance
  const [account] = await db
    .select({ balanceCents: trustAccounts.balanceCents })
    .from(trustAccounts)
    .where(eq(trustAccounts.id, input.trustAccountId))
    .limit(1);

  if (!account) throw new Error("Trust account not found");

  const signedAmount =
    input.transactionType === "deposit"
      ? input.amountCents
      : -input.amountCents;
  const newBalance = account.balanceCents + signedAmount;

  const [tx] = await db
    .insert(trustTransactions)
    .values({
      trustAccountId: input.trustAccountId,
      caseId: input.caseId,
      clientContactId: input.clientContactId,
      transactionType: input.transactionType,
      amountCents: input.amountCents,
      balanceAfterCents: newBalance,
      description: input.description,
      referenceNumber: input.referenceNumber,
      transactionDate: input.transactionDate ?? new Date(),
      createdBy: session.id,
    })
    .returning();

  await db
    .update(trustAccounts)
    .set({ balanceCents: newBalance })
    .where(eq(trustAccounts.id, input.trustAccountId));

  revalidatePath("/trust");
  return tx;
}

export async function recordDeposit(input: {
  trustAccountId: string;
  caseId?: string;
  clientContactId?: string;
  amountCents: number;
  description?: string;
  referenceNumber?: string;
  transactionDate?: Date;
}) {
  return recordTransaction({ ...input, transactionType: "deposit" });
}

export async function recordWithdrawal(input: {
  trustAccountId: string;
  caseId?: string;
  clientContactId?: string;
  amountCents: number;
  description?: string;
  referenceNumber?: string;
  transactionDate?: Date;
}) {
  return recordTransaction({ ...input, transactionType: "withdrawal" });
}
