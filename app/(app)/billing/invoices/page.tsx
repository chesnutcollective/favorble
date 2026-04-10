import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getInvoices } from "@/app/actions/billing";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HugeiconsIcon } from "@hugeicons/react";
import { Invoice01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

const PRIMARY = "#263c94";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

type Status = "draft" | "sent" | "paid" | "overdue" | "void";

const STATUS_COLORS: Record<Status, { bg: string; fg: string }> = {
  draft: { bg: "#F3F4F6", fg: "#374151" },
  sent: { bg: "rgba(29,114,184,0.10)", fg: "#1d72b8" },
  paid: { bg: "rgba(16,185,129,0.10)", fg: "#059669" },
  overdue: { bg: "rgba(209,69,59,0.10)", fg: "#d1453b" },
  void: { bg: "#F3F4F6", fg: "#9CA3AF" },
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  const statusFilter = (params.status ?? "") as "" | Status;

  const invoices = await getInvoices(
    statusFilter ? { status: statusFilter } : {},
  ).catch(() => []);

  const outstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((sum, i) => sum + i.totalCents, 0);
  const totalPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + i.totalCents, 0);

  const filters: Array<{ key: "" | Status; label: string }> = [
    { key: "", label: "All" },
    { key: "draft", label: "Draft" },
    { key: "sent", label: "Sent" },
    { key: "paid", label: "Paid" },
    { key: "overdue", label: "Overdue" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Billable invoices for clients and cases."
        actions={
          <Button size="sm" style={{ backgroundColor: PRIMARY }}>
            <HugeiconsIcon icon={PlusSignIcon} size={14} />
            New Invoice
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard
          title="Outstanding"
          value={formatCurrency(outstanding)}
          subtitle={`${invoices.filter((i) => i.status === "sent" || i.status === "overdue").length} open`}
        />
        <StatsCard
          title="Total Paid"
          value={formatCurrency(totalPaid)}
          subtitle="Across loaded invoices"
        />
        <StatsCard
          title="Total Invoices"
          value={invoices.length}
          subtitle={statusFilter ? `Filtered: ${statusFilter}` : "All statuses"}
        />
      </div>

      <div className="flex items-center gap-2">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={`/billing/invoices${f.key ? `?status=${f.key}` : ""}`}
            className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              borderColor: statusFilter === f.key ? PRIMARY : "#EAEAEA",
              backgroundColor:
                statusFilter === f.key ? "rgba(38,60,148,0.08)" : "#ffffff",
              color: statusFilter === f.key ? PRIMARY : "#666",
            }}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <EmptyState
              icon={Invoice01Icon}
              title="No invoices yet"
              description="Create your first invoice to start billing clients. Coming soon — full invoice builder."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Case</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => {
                  const color = STATUS_COLORS[i.status as Status];
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="text-xs font-medium">
                        <Link
                          href={`/billing/invoices/${i.id}`}
                          style={{ color: PRIMARY }}
                        >
                          {i.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">
                        {i.clientFirstName
                          ? `${i.clientFirstName} ${i.clientLastName}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {i.caseNumber ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {i.issueDate.toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        {i.dueDate?.toLocaleDateString() ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {formatCurrency(i.totalCents)}
                      </TableCell>
                      <TableCell>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                          style={{
                            color: color.fg,
                            backgroundColor: color.bg,
                          }}
                        >
                          {i.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
