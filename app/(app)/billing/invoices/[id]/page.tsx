import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getInvoiceById } from "@/app/actions/billing";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  Mail01Icon,
  CheckmarkCircle01Icon,
  FileDownloadIcon,
} from "@hugeicons/core-free-icons";

export const metadata: Metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

const PRIMARY = "#263c94";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const invoice = await getInvoiceById(id).catch(() => null);
  if (!invoice) notFound();

  const clientName = invoice.clientFirstName
    ? `${invoice.clientFirstName} ${invoice.clientLastName}`
    : "No client";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs">
        <Link
          href="/billing/invoices"
          className="inline-flex items-center gap-1 text-[#666] hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
          Invoices
        </Link>
      </div>

      <PageHeader
        title={invoice.invoiceNumber}
        description={`${clientName}${invoice.caseNumber ? ` · Case ${invoice.caseNumber}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <HugeiconsIcon icon={FileDownloadIcon} size={14} />
              Download PDF
            </Button>
            <Button variant="outline" size="sm">
              <HugeiconsIcon icon={Mail01Icon} size={14} />
              Send
            </Button>
            <Button size="sm" style={{ backgroundColor: PRIMARY }}>
              <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} />
              Mark Paid
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Line Items</h2>
            </div>
            {invoice.lineItems.length === 0 ? (
              <p className="text-xs text-[#666] py-6 text-center">
                No line items yet. Coming soon — full invoice builder.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.lineItems.map((li) => (
                    <TableRow key={li.id}>
                      <TableCell className="text-xs">{li.type}</TableCell>
                      <TableCell className="text-xs">
                        {li.description}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {li.quantity}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {formatCurrency(li.unitPriceCents)}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {formatCurrency(li.totalCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div
              className="border-t pt-3 space-y-1 text-xs"
              style={{ borderColor: "#EAEAEA" }}
            >
              <div className="flex justify-between">
                <span className="text-[#666]">Subtotal</span>
                <span className="tabular-nums">
                  {formatCurrency(invoice.subtotalCents)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666]">Tax</span>
                <span className="tabular-nums">
                  {formatCurrency(invoice.taxCents)}
                </span>
              </div>
              <div className="flex justify-between font-semibold text-sm pt-2">
                <span>Total</span>
                <span className="tabular-nums">
                  {formatCurrency(invoice.totalCents)}
                </span>
              </div>
              <div
                className="flex justify-between text-[11px] pt-1"
                style={{ color: PRIMARY }}
              >
                <span>Amount paid</span>
                <span className="tabular-nums">
                  {formatCurrency(invoice.amountPaidCents)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-5 space-y-3 text-xs">
              <h3 className="text-sm font-semibold mb-2">Details</h3>
              <div>
                <p className="text-[#666]">Status</p>
                <p className="font-medium uppercase">{invoice.status}</p>
              </div>
              <div>
                <p className="text-[#666]">Issue Date</p>
                <p>{invoice.issueDate.toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-[#666]">Due Date</p>
                <p>{invoice.dueDate?.toLocaleDateString() ?? "—"}</p>
              </div>
              <div>
                <p className="text-[#666]">Paid Date</p>
                <p>{invoice.paidDate?.toLocaleDateString() ?? "—"}</p>
              </div>
              {invoice.sentToEmail && (
                <div>
                  <p className="text-[#666]">Sent to</p>
                  <p className="truncate">{invoice.sentToEmail}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3 text-xs">
              <h3 className="text-sm font-semibold mb-2">Payments</h3>
              {invoice.payments.length === 0 ? (
                <p className="text-[#666]">No payments recorded.</p>
              ) : (
                <ul className="divide-y divide-[#EAEAEA]">
                  {invoice.payments.map((p) => (
                    <li key={p.id} className="py-2">
                      <p className="font-medium tabular-nums">
                        {formatCurrency(p.amountCents)}
                      </p>
                      <p className="text-[#666]">
                        {p.paymentMethod} ·{" "}
                        {p.paymentDate.toLocaleDateString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
