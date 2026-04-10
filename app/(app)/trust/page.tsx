import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import {
  getTrustAccounts,
  getTrustTransactions,
} from "@/app/actions/trust";
import { getCasePicker } from "@/app/actions/billing";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RecordTransactionDialog } from "@/components/trust/record-transaction-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import { SafeIcon, BankIcon } from "@hugeicons/core-free-icons";

export const metadata: Metadata = { title: "Trust Accounting" };
export const dynamic = "force-dynamic";

const PRIMARY = "#263c94";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default async function TrustPage() {
  await requireSession();

  const [accounts, cases] = await Promise.all([
    getTrustAccounts().catch(() => []),
    getCasePicker().catch(() => []),
  ]);
  const totalBalance = accounts.reduce((sum, a) => sum + a.balanceCents, 0);

  // Fetch recent transactions from all accounts
  const allTx = accounts.length
    ? (
        await Promise.all(
          accounts.map((a) => getTrustTransactions(a.id).catch(() => [])),
        )
      )
        .flat()
        .sort(
          (a, b) =>
            b.transactionDate.getTime() - a.transactionDate.getTime(),
        )
        .slice(0, 20)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trust Accounting"
        description="IOLTA trust accounts, deposits, withdrawals, and reconciliation."
        actions={
          <RecordTransactionDialog accounts={accounts} cases={cases} />
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard
          title="Total Balance"
          value={formatCurrency(totalBalance)}
          subtitle={`Across ${accounts.length} accounts`}
        />
        <StatsCard
          title="Accounts"
          value={accounts.length}
          subtitle="Active trust accounts"
        />
        <StatsCard
          title="Recent Transactions"
          value={allTx.length}
          subtitle="Last 20 activity items"
        />
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={SafeIcon}
              title="No trust accounts yet"
              description="Set up your first IOLTA account to start tracking client funds. Coming soon — full trust accounting workflow."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {accounts.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <HugeiconsIcon
                          icon={BankIcon}
                          size={16}
                          color={PRIMARY}
                        />
                        {a.name}
                      </h3>
                      {a.bankName && (
                        <p className="text-xs text-[#666] mt-0.5">
                          {a.bankName}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-2xl font-bold tabular-nums">
                    {formatCurrency(a.balanceCents)}
                  </p>
                  <p className="text-[11px] text-[#666] mt-1">
                    Last reconciled: —
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold mb-3">Recent Transactions</h2>
              {allTx.length === 0 ? (
                <p className="text-xs text-[#666] py-4">
                  No transactions yet.
                </p>
              ) : (
                <ul className="divide-y divide-[#EAEAEA]">
                  {allTx.map((t) => {
                    const isDeposit = t.transactionType === "deposit";
                    return (
                      <li
                        key={t.id}
                        className="py-3 flex items-center justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">
                            {t.description ?? t.transactionType}
                          </p>
                          <p className="text-[11px] text-[#666] mt-0.5">
                            {t.transactionDate.toLocaleDateString()}{" "}
                            {t.caseNumber ? `· ${t.caseNumber}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className="text-xs font-semibold tabular-nums"
                            style={{
                              color: isDeposit ? "#059669" : "#d1453b",
                            }}
                          >
                            {isDeposit ? "+" : "-"}
                            {formatCurrency(t.amountCents)}
                          </p>
                          <Badge variant="outline" className="text-[9px] mt-1">
                            {t.reconciled ? "Reconciled" : "Pending"}
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
