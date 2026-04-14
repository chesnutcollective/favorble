"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  FeePetitionRow,
  FeePetitionWorkspace,
} from "@/app/actions/fee-collection";

function formatCurrency(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function FeePetitionTable({ rows }: { rows: FeePetitionRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-3xl text-muted-foreground mb-3">💰</div>
        <p className="text-sm font-medium text-foreground">No fee petitions in this bucket</p>
        <p className="text-xs text-muted-foreground mt-1">Fee petitions will appear here as they move through the pipeline.</p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-md bg-white overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Case / Claimant</th>
            <th className="text-left px-4 py-2 font-medium">Favorable</th>
            <th className="text-left px-4 py-2 font-medium">Age</th>
            <th className="text-left px-4 py-2 font-medium">Assigned</th>
            <th className="text-left px-4 py-2 font-medium">Status</th>
            <th className="text-right px-4 py-2 font-medium">Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/cases/${r.caseId}`}
              className="contents"
            >
              <tr className="border-t border-border hover:bg-[#FAFAFA] transition-colors duration-200 cursor-pointer">
                <td className="px-4 py-2">
                  <div className="font-medium">{r.caseNumber}</div>
                  <div className="text-[11px] text-muted-foreground">{r.claimantName}</div>
                </td>
                <td className="px-4 py-2 tabular-nums">
                  {formatDate(r.favorableDecisionDate)}
                </td>
                <td className="px-4 py-2 tabular-nums">{r.ageInDays}d</td>
                <td className="px-4 py-2">{r.assignedUserName ?? "—"}</td>
                <td className="px-4 py-2 capitalize">{r.status}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  <div className="font-medium">
                    {formatCurrency(r.approvedAmountCents)}
                  </div>
                  {r.outstandingCents > 0 && (
                    <div className="text-[11px] text-urgent">
                      {formatCurrency(r.outstandingCents)} outstanding
                    </div>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span className="text-[12px] underline text-brand-600">
                    View case
                  </span>
                </td>
              </tr>
            </Link>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FeeCollectionTabs({ data }: { data: FeePetitionWorkspace }) {
  return (
    <Tabs defaultValue="pending" className="w-full">
      <TabsList>
        <TabsTrigger value="pending">
          Pending ({data.counts.pending})
        </TabsTrigger>
        <TabsTrigger value="filed">Filed ({data.counts.filed})</TabsTrigger>
        <TabsTrigger value="approved">
          Approved ({data.counts.approved})
        </TabsTrigger>
        <TabsTrigger value="delinquent">
          Delinquent ({data.counts.delinquent})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="pending">
        <FeePetitionTable rows={data.pending} />
      </TabsContent>
      <TabsContent value="filed">
        <FeePetitionTable rows={data.filed} />
      </TabsContent>
      <TabsContent value="approved">
        <FeePetitionTable rows={data.approved} />
      </TabsContent>
      <TabsContent value="delinquent">
        <FeePetitionTable rows={data.delinquent} />
      </TabsContent>
    </Tabs>
  );
}
