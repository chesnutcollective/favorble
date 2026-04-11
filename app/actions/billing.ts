"use server";

import { db } from "@/db/drizzle";
import {
  timeEntries,
  expenses,
  invoices,
  invoiceLineItems,
  payments,
  users,
  cases,
  contacts,
  leads,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import {
  and,
  eq,
  desc,
  gte,
  lte,
  sql,
  count,
  sum,
  isNull,
  isNotNull,
  inArray,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

// ---------- Types ----------

export type TimeEntryFilter = {
  userId?: string;
  caseId?: string;
  from?: Date;
  to?: Date;
  billable?: boolean;
};

export type InvoiceFilter = {
  status?: "draft" | "sent" | "paid" | "overdue" | "void";
  caseId?: string;
  clientContactId?: string;
};

// ---------- Time Entries ----------

export async function getTimeEntries(filter: TimeEntryFilter = {}) {
  const session = await requireSession();
  const conditions = [eq(timeEntries.organizationId, session.organizationId)];

  if (filter.userId) conditions.push(eq(timeEntries.userId, filter.userId));
  if (filter.caseId) conditions.push(eq(timeEntries.caseId, filter.caseId));
  if (filter.from) conditions.push(gte(timeEntries.entryDate, filter.from));
  if (filter.to) conditions.push(lte(timeEntries.entryDate, filter.to));
  if (filter.billable !== undefined)
    conditions.push(eq(timeEntries.billable, filter.billable));

  try {
    const rows = await db
      .select({
        id: timeEntries.id,
        description: timeEntries.description,
        durationMinutes: timeEntries.durationMinutes,
        billable: timeEntries.billable,
        hourlyRate: timeEntries.hourlyRate,
        entryDate: timeEntries.entryDate,
        billedAt: timeEntries.billedAt,
        invoiceId: timeEntries.invoiceId,
        userId: timeEntries.userId,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        caseId: timeEntries.caseId,
        caseNumber: cases.caseNumber,
      })
      .from(timeEntries)
      .leftJoin(users, eq(timeEntries.userId, users.id))
      .leftJoin(cases, eq(timeEntries.caseId, cases.id))
      .where(and(...conditions))
      .orderBy(desc(timeEntries.entryDate))
      .limit(200);
    return rows;
  } catch (err) {
    logger.error("getTimeEntries failed", { error: err });
    return [];
  }
}

export async function createTimeEntry(input: {
  caseId?: string;
  description: string;
  durationMinutes: number;
  billable?: boolean;
  hourlyRate?: string;
  entryDate?: Date;
}) {
  const session = await requireSession();
  const [row] = await db
    .insert(timeEntries)
    .values({
      organizationId: session.organizationId,
      userId: session.id,
      caseId: input.caseId,
      description: input.description,
      durationMinutes: input.durationMinutes,
      billable: input.billable ?? true,
      hourlyRate: input.hourlyRate,
      entryDate: input.entryDate ?? new Date(),
    })
    .returning();
  revalidatePath("/billing");
  revalidatePath("/billing/time");
  return row;
}

// ---------- Invoices ----------

export async function getInvoices(filter: InvoiceFilter = {}) {
  const session = await requireSession();
  const conditions = [eq(invoices.organizationId, session.organizationId)];

  if (filter.status) conditions.push(eq(invoices.status, filter.status));
  if (filter.caseId) conditions.push(eq(invoices.caseId, filter.caseId));
  if (filter.clientContactId)
    conditions.push(eq(invoices.clientContactId, filter.clientContactId));

  try {
    const rows = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        paidDate: invoices.paidDate,
        subtotalCents: invoices.subtotalCents,
        taxCents: invoices.taxCents,
        totalCents: invoices.totalCents,
        amountPaidCents: invoices.amountPaidCents,
        caseId: invoices.caseId,
        caseNumber: cases.caseNumber,
        clientContactId: invoices.clientContactId,
        clientFirstName: contacts.firstName,
        clientLastName: contacts.lastName,
      })
      .from(invoices)
      .leftJoin(cases, eq(invoices.caseId, cases.id))
      .leftJoin(contacts, eq(invoices.clientContactId, contacts.id))
      .where(and(...conditions))
      .orderBy(desc(invoices.issueDate))
      .limit(200);
    return rows;
  } catch (err) {
    logger.error("getInvoices failed", { error: err });
    return [];
  }
}

export async function getInvoiceById(id: string) {
  const session = await requireSession();
  try {
    const [invoice] = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        paidDate: invoices.paidDate,
        subtotalCents: invoices.subtotalCents,
        taxCents: invoices.taxCents,
        totalCents: invoices.totalCents,
        amountPaidCents: invoices.amountPaidCents,
        notes: invoices.notes,
        sentToEmail: invoices.sentToEmail,
        sentAt: invoices.sentAt,
        caseId: invoices.caseId,
        caseNumber: cases.caseNumber,
        clientContactId: invoices.clientContactId,
        clientFirstName: contacts.firstName,
        clientLastName: contacts.lastName,
      })
      .from(invoices)
      .leftJoin(cases, eq(invoices.caseId, cases.id))
      .leftJoin(contacts, eq(invoices.clientContactId, contacts.id))
      .where(
        and(
          eq(invoices.id, id),
          eq(invoices.organizationId, session.organizationId),
        ),
      )
      .limit(1);

    if (!invoice) return null;

    const lineItems = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, id));

    const paymentRows = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, id))
      .orderBy(desc(payments.paymentDate));

    return { ...invoice, lineItems, payments: paymentRows };
  } catch (err) {
    logger.error("getInvoiceById failed", { error: err });
    return null;
  }
}

export async function createInvoice(input: {
  caseId?: string;
  clientContactId?: string;
  dueDate?: Date;
  notes?: string;
}) {
  const session = await requireSession();

  // Generate invoice number: INV-<year>-<seq>
  const year = new Date().getFullYear();
  const [last] = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(eq(invoices.organizationId, session.organizationId))
    .orderBy(desc(invoices.createdAt))
    .limit(1);
  const lastSeq = last?.invoiceNumber
    ? Number.parseInt(last.invoiceNumber.split("-").pop() ?? "0", 10)
    : 0;
  const invoiceNumber = `INV-${year}-${String(lastSeq + 1).padStart(4, "0")}`;

  const [row] = await db
    .insert(invoices)
    .values({
      organizationId: session.organizationId,
      caseId: input.caseId,
      clientContactId: input.clientContactId,
      invoiceNumber,
      status: "draft",
      dueDate: input.dueDate,
      notes: input.notes,
      createdBy: session.id,
    })
    .returning();

  revalidatePath("/billing");
  revalidatePath("/billing/invoices");
  return row;
}

export async function markInvoicePaid(
  id: string,
  paymentInfo: {
    amountCents: number;
    paymentMethod?:
      | "check"
      | "ach"
      | "credit_card"
      | "trust_transfer"
      | "other";
    paymentDate?: Date;
    referenceNumber?: string;
    notes?: string;
  },
) {
  const session = await requireSession();

  await db.insert(payments).values({
    organizationId: session.organizationId,
    invoiceId: id,
    amountCents: paymentInfo.amountCents,
    paymentMethod: paymentInfo.paymentMethod ?? "check",
    paymentDate: paymentInfo.paymentDate ?? new Date(),
    referenceNumber: paymentInfo.referenceNumber,
    notes: paymentInfo.notes,
    createdBy: session.id,
  });

  await db
    .update(invoices)
    .set({
      status: "paid",
      paidDate: new Date(),
      amountPaidCents: sql`${invoices.amountPaidCents} + ${paymentInfo.amountCents}`,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, id));

  revalidatePath("/billing");
  revalidatePath("/billing/invoices");
  revalidatePath(`/billing/invoices/${id}`);
}

// ---------- Invoice Line Items ----------

async function recomputeInvoiceTotals(invoiceId: string) {
  const items = await db
    .select({
      total: sum(invoiceLineItems.totalCents),
    })
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId));

  const subtotal = Number(items[0]?.total ?? 0);
  // For now: tax is 0; future enhancement could pull from org settings
  const tax = 0;
  const total = subtotal + tax;

  await db
    .update(invoices)
    .set({
      subtotalCents: subtotal,
      taxCents: tax,
      totalCents: total,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId));
}

export async function addInvoiceLineItem(input: {
  invoiceId: string;
  type?: "time" | "expense" | "fee" | "other";
  description: string;
  quantity?: number;
  unitPriceCents: number;
}) {
  const session = await requireSession();

  // Verify invoice belongs to org
  const [inv] = await db
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(
      and(
        eq(invoices.id, input.invoiceId),
        eq(invoices.organizationId, session.organizationId),
      ),
    )
    .limit(1);
  if (!inv) throw new Error("Invoice not found");
  if (inv.status === "paid" || inv.status === "void") {
    throw new Error("Cannot add line items to a paid or voided invoice");
  }

  const quantity = input.quantity ?? 1;
  const totalCents = Math.round(quantity * input.unitPriceCents);

  await db.insert(invoiceLineItems).values({
    invoiceId: input.invoiceId,
    type: input.type ?? "other",
    description: input.description,
    quantity: quantity.toString(),
    unitPriceCents: input.unitPriceCents,
    totalCents,
  });

  await recomputeInvoiceTotals(input.invoiceId);
  revalidatePath(`/billing/invoices/${input.invoiceId}`);
  revalidatePath("/billing/invoices");
}

export async function addUnbilledTimeToInvoice(input: {
  invoiceId: string;
  caseId?: string;
}) {
  const session = await requireSession();

  // Verify invoice + grab caseId fallback
  const [inv] = await db
    .select({
      id: invoices.id,
      caseId: invoices.caseId,
      status: invoices.status,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.id, input.invoiceId),
        eq(invoices.organizationId, session.organizationId),
      ),
    )
    .limit(1);
  if (!inv) throw new Error("Invoice not found");
  if (inv.status === "paid" || inv.status === "void") {
    throw new Error("Cannot add time to a paid or voided invoice");
  }

  const targetCaseId = input.caseId ?? inv.caseId;
  if (!targetCaseId) {
    throw new Error("No case selected — cannot import time entries");
  }

  const unbilled = await db
    .select({
      id: timeEntries.id,
      description: timeEntries.description,
      durationMinutes: timeEntries.durationMinutes,
      hourlyRate: timeEntries.hourlyRate,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.organizationId, session.organizationId),
        eq(timeEntries.caseId, targetCaseId),
        eq(timeEntries.billable, true),
        isNull(timeEntries.invoiceId),
      ),
    );

  if (unbilled.length === 0) {
    return { imported: 0, totalCents: 0 };
  }

  let imported = 0;
  let totalCents = 0;

  for (const t of unbilled) {
    const hours = t.durationMinutes / 60;
    const rate = Number(t.hourlyRate ?? "0");
    const lineTotal = Math.round(hours * rate * 100); // cents
    const unitPrice = Math.round(rate * 100);

    await db.insert(invoiceLineItems).values({
      invoiceId: input.invoiceId,
      type: "time",
      description: t.description,
      quantity: hours.toFixed(3),
      unitPriceCents: unitPrice,
      totalCents: lineTotal,
      sourceTimeEntryId: t.id,
    });

    await db
      .update(timeEntries)
      .set({ billedAt: new Date(), invoiceId: input.invoiceId })
      .where(eq(timeEntries.id, t.id));

    imported++;
    totalCents += lineTotal;
  }

  await recomputeInvoiceTotals(input.invoiceId);
  revalidatePath(`/billing/invoices/${input.invoiceId}`);
  revalidatePath("/billing/invoices");
  revalidatePath("/billing/time");
  return { imported, totalCents };
}

export async function sendInvoice(input: {
  id: string;
  email: string;
}) {
  const session = await requireSession();

  await db
    .update(invoices)
    .set({
      status: "sent",
      sentAt: new Date(),
      sentToEmail: input.email,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(invoices.id, input.id),
        eq(invoices.organizationId, session.organizationId),
      ),
    );

  revalidatePath("/billing/invoices");
  revalidatePath(`/billing/invoices/${input.id}`);
}

// ---------- Pickers ----------

export async function getCasePicker() {
  const session = await requireSession();
  try {
    const rows = await db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        clientFirstName: leads.firstName,
        clientLastName: leads.lastName,
      })
      .from(cases)
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .where(eq(cases.organizationId, session.organizationId))
      .orderBy(desc(cases.createdAt))
      .limit(200);
    return rows;
  } catch (err) {
    logger.error("getCasePicker failed", { error: err });
    return [];
  }
}

export async function getClientPicker() {
  const session = await requireSession();
  try {
    const rows = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, session.organizationId),
          eq(contacts.contactType, "client"),
        ),
      )
      .orderBy(contacts.lastName, contacts.firstName)
      .limit(200);
    return rows;
  } catch (err) {
    logger.error("getClientPicker failed", { error: err });
    return [];
  }
}

// ---------- Metrics ----------

export async function getBillingMetrics() {
  const session = await requireSession();

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const [thisWeekRow] = await db
      .select({
        totalMinutes: sum(timeEntries.durationMinutes),
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.organizationId, session.organizationId),
          gte(timeEntries.entryDate, startOfWeek),
        ),
      );

    const [outstandingRow] = await db
      .select({
        total: sum(invoices.totalCents),
        invoiceCount: count(),
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, session.organizationId),
          sql`${invoices.status} in ('sent', 'overdue')`,
        ),
      );

    const [paidThisMonthRow] = await db
      .select({
        total: sum(payments.amountCents),
      })
      .from(payments)
      .where(
        and(
          eq(payments.organizationId, session.organizationId),
          gte(payments.paymentDate, startOfMonth),
        ),
      );

    const minutes = Number(thisWeekRow?.totalMinutes ?? 0);

    return {
      hoursThisWeek: Math.round((minutes / 60) * 10) / 10,
      outstandingCents: Number(outstandingRow?.total ?? 0),
      outstandingCount: Number(outstandingRow?.invoiceCount ?? 0),
      paidThisMonthCents: Number(paidThisMonthRow?.total ?? 0),
    };
  } catch (err) {
    logger.error("getBillingMetrics failed", { error: err });
    return {
      hoursThisWeek: 0,
      outstandingCents: 0,
      outstandingCount: 0,
      paidThisMonthCents: 0,
    };
  }
}
