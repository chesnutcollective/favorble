import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import {
  getBillingMetrics,
  getTimeEntries,
  getExpenses,
  getInvoices,
  getCasePicker,
} from "@/app/actions/billing";
import { NewExpenseDialog } from "@/components/billing/new-expense-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Invoice01Icon,
  Clock01Icon,
  PlusSignIcon,
  DollarCircleIcon,
} from "@hugeicons/core-free-icons";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const PRIMARY = "#263c94";

const EXPENSE_TYPE_LABELS: Record<string, string> = {
  filing_fee: "Filing Fee",
  medical_record_fee: "Medical Record",
  copy: "Copy",
  mileage: "Mileage",
  other: "Other",
};

const EXPENSE_TYPE_COLORS: Record<string, string> = {
  filing_fee: "#263c94",
  medical_record_fee: "#1d72b8",
  copy: "#6b7280",
  mileage: "#cf8a00",
  other: "#52525e",
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function BillingPage() {
  await requireSession();

  const [metrics, recentTime, recentExpenses, recentInvoices, casesForPicker] =
    await Promise.all([
      getBillingMetrics().catch(() => ({
        hoursThisWeek: 0,
        outstandingCents: 0,
        outstandingCount: 0,
        paidThisMonthCents: 0,
      })),
      getTimeEntries().catch(() => []),
      getExpenses().catch(() => []),
      getInvoices().catch(() => []),
      getCasePicker().catch(() => []),
    ]);

  const hasAnyData =
    recentTime.length > 0 ||
    recentExpenses.length > 0 ||
    recentInvoices.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Time tracking, expenses, and invoices."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/billing/time">
                <HugeiconsIcon icon={PlusSignIcon} size={14} aria-hidden="true" />
                New Time Entry
              </Link>
            </Button>
            <Button asChild size="sm" style={{ backgroundColor: PRIMARY }}>
              <Link href="/billing/invoices">
                <HugeiconsIcon icon={PlusSignIcon} size={14} aria-hidden="true" />
                New Invoice
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard
          title="This Week"
          value={`${metrics.hoursThisWeek}h`}
          subtitle="Hours logged"
        />
        <StatsCard
          title="Outstanding"
          value={formatCurrency(metrics.outstandingCents)}
          subtitle={`${metrics.outstandingCount} open invoices`}
        />
        <StatsCard
          title="Paid This Month"
          value={formatCurrency(metrics.paidThisMonthCents)}
          subtitle="Payments received"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <HugeiconsIcon icon={Clock01Icon} size={16} color={PRIMARY} aria-hidden="true" />
                Time Entries
              </h2>
              <Link
                href="/billing/time"
                className="text-xs font-medium"
                style={{ color: PRIMARY }}
              >
                View all
              </Link>
            </div>
            {recentTime.length === 0 ? (
              <p className="text-xs text-[#666] py-4">No time entries yet.</p>
            ) : (
              <ul className="divide-y divide-[#EAEAEA]">
                {recentTime.slice(0, 5).map((t) => (
                  <li key={t.id} className="py-2 text-xs">
                    <p className="font-medium truncate">{t.description}</p>
                    <p className="text-[#666] mt-0.5">
                      {(t.durationMinutes / 60).toFixed(1)}h ·{" "}
                      {t.caseNumber ?? "No case"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <HugeiconsIcon
                  icon={DollarCircleIcon}
                  size={16}
                  color={PRIMARY}
                  aria-hidden="true"
                />
                Expenses
              </h2>
              <NewExpenseDialog cases={casesForPicker} />
            </div>
            {recentExpenses.length === 0 ? (
              <p className="text-xs text-[#666] py-4">No expenses yet.</p>
            ) : (
              <ul className="divide-y divide-[#EAEAEA]">
                {recentExpenses.slice(0, 5).map((exp) => (
                  <li key={exp.id} className="py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium truncate">{exp.description}</p>
                      <span className="tabular-nums whitespace-nowrap font-medium">
                        {formatCurrency(exp.amountCents)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                        style={{
                          color:
                            EXPENSE_TYPE_COLORS[exp.expenseType] ?? "#52525e",
                          backgroundColor: `${EXPENSE_TYPE_COLORS[exp.expenseType] ?? "#52525e"}14`,
                        }}
                      >
                        {EXPENSE_TYPE_LABELS[exp.expenseType] ??
                          exp.expenseType}
                      </Badge>
                      {exp.reimbursable && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          Reimbursable
                        </Badge>
                      )}
                      <span className="text-[#666] ml-auto">
                        {exp.caseNumber ?? "No case"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <HugeiconsIcon icon={Invoice01Icon} size={16} color={PRIMARY} aria-hidden="true" />
                Invoices
              </h2>
              <Link
                href="/billing/invoices"
                className="text-xs font-medium"
                style={{ color: PRIMARY }}
              >
                View all
              </Link>
            </div>
            {recentInvoices.length === 0 ? (
              <p className="text-xs text-[#666] py-4">No invoices yet.</p>
            ) : (
              <ul className="divide-y divide-[#EAEAEA]">
                {recentInvoices.slice(0, 5).map((i) => (
                  <li key={i.id} className="py-2 text-xs">
                    <p className="font-medium truncate">{i.invoiceNumber}</p>
                    <p className="text-[#666] mt-0.5">
                      {formatCurrency(i.totalCents)} · {i.status}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {!hasAnyData && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Invoice01Icon}
              title="Billing scaffold ready"
              description="Time entries, expenses, and invoices will appear here. This is a Phase 4 scaffold — full implementation coming soon."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
