import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  cases,
  contacts,
  invoiceLineItems,
  invoices,
  organizations,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger/server";
import { logPhiAccess } from "@/lib/services/hipaa-audit";
import { renderInvoicePdf } from "@/lib/pdf/invoice";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await context.params;

    const [invoice] = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        subtotalCents: invoices.subtotalCents,
        taxCents: invoices.taxCents,
        totalCents: invoices.totalCents,
        amountPaidCents: invoices.amountPaidCents,
        notes: invoices.notes,
        organizationId: invoices.organizationId,
        caseId: invoices.caseId,
        caseNumber: cases.caseNumber,
        clientContactId: invoices.clientContactId,
        clientFirstName: contacts.firstName,
        clientLastName: contacts.lastName,
        clientEmail: contacts.email,
        clientAddress: contacts.address,
        clientCity: contacts.city,
        clientState: contacts.state,
        clientZip: contacts.zip,
      })
      .from(invoices)
      .leftJoin(cases, eq(invoices.caseId, cases.id))
      .leftJoin(contacts, eq(invoices.clientContactId, contacts.id))
      .where(eq(invoices.id, id))
      .limit(1);

    if (!invoice) {
      return new NextResponse("Invoice not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    if (invoice.organizationId !== session.organizationId) {
      return new NextResponse("Forbidden", {
        status: 403,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const lineItems = await db
      .select({
        description: invoiceLineItems.description,
        quantity: invoiceLineItems.quantity,
        unitPriceCents: invoiceLineItems.unitPriceCents,
        totalCents: invoiceLineItems.totalCents,
      })
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, id));

    const [org] = await db
      .select({
        name: organizations.name,
        settings: organizations.settings,
      })
      .from(organizations)
      .where(eq(organizations.id, session.organizationId))
      .limit(1);

    // Optional address fields live in settings JSONB.
    const settings =
      (org?.settings as Record<string, unknown> | null | undefined) ?? {};
    const addr = (settings.address ??
      settings.letterhead ??
      {}) as Record<string, unknown>;
    const pick = (key: string): string | null => {
      const v = addr[key];
      return typeof v === "string" && v.length > 0 ? v : null;
    };

    const pdfBuffer = await renderInvoicePdf(
      {
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        subtotalCents: invoice.subtotalCents,
        taxCents: invoice.taxCents,
        totalCents: invoice.totalCents,
        amountPaidCents: invoice.amountPaidCents,
        notes: invoice.notes,
        caseNumber: invoice.caseNumber,
        clientFirstName: invoice.clientFirstName,
        clientLastName: invoice.clientLastName,
        clientEmail: invoice.clientEmail,
        clientAddress: invoice.clientAddress,
        clientCity: invoice.clientCity,
        clientState: invoice.clientState,
        clientZip: invoice.clientZip,
      },
      lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
        totalCents: li.totalCents,
      })),
      {
        name: org?.name ?? "favorble",
        addressLine1: pick("line1") ?? pick("addressLine1"),
        addressLine2: pick("line2") ?? pick("addressLine2"),
        city: pick("city"),
        state: pick("state"),
        zip: pick("zip") ?? pick("postalCode"),
        phone: pick("phone"),
        email: pick("email"),
      },
    );

    // Best-effort HIPAA audit; never block the download if it fails.
    await logPhiAccess({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "invoice",
      entityId: invoice.id,
      caseId: invoice.caseId ?? null,
      fieldsAccessed: ["invoice_pdf"],
      reason: "invoice pdf download",
      severity: "info",
      action: "invoice_pdf_downloaded",
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
      },
    });

    const safeNumber = invoice.invoiceNumber.replace(/[^A-Za-z0-9_-]/g, "_");
    // `as unknown as BodyInit` keeps the route compatible with both Node
    // runtime (Buffer) and edge-style expectations.
    const body = new Uint8Array(pdfBuffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${safeNumber}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logger.error("Invoice PDF generation failed", { error });
    return new NextResponse("Failed to generate invoice PDF", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
