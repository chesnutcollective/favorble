"use client";

import Link from "next/link";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { COLORS } from "@/lib/design-tokens";
import type {
  AcBriefRow,
  AcBriefWorkspace,
} from "@/app/actions/appeals-council";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DaysPill({ days }: { days: number | null }) {
  if (days === null) return <span className="text-[#666]">—</span>;
  const urgent = days <= 7;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums"
      style={{
        backgroundColor: urgent ? COLORS.badSubtle : COLORS.okSubtle,
        color: urgent ? COLORS.bad : COLORS.ok,
      }}
    >
      {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
    </span>
  );
}

function AcBriefTable({ rows }: { rows: AcBriefRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="text-sm text-[#666]">
            No briefs in this bucket.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      className="border rounded-md bg-white overflow-hidden"
      style={{ borderColor: COLORS.borderDefault }}
    >
      <table className="w-full text-[13px]">
        <thead
          style={{
            backgroundColor: COLORS.surface,
            borderBottom: `1px solid ${COLORS.borderDefault}`,
          }}
        >
          <tr>
            <th className="text-left px-4 py-2 font-medium">Case / Claimant</th>
            <th className="text-left px-4 py-2 font-medium">Unfavorable</th>
            <th className="text-left px-4 py-2 font-medium">Deadline</th>
            <th className="text-left px-4 py-2 font-medium">Remaining</th>
            <th className="text-left px-4 py-2 font-medium">Assigned</th>
            <th className="text-left px-4 py-2 font-medium">Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              style={{ borderTop: `1px solid ${COLORS.borderSubtle}` }}
            >
              <td className="px-4 py-2">
                <div className="font-medium">{r.caseNumber}</div>
                <div className="text-[11px] text-[#666]">{r.claimantName}</div>
              </td>
              <td className="px-4 py-2 tabular-nums">
                {formatDate(r.unfavorableDecisionDate)}
              </td>
              <td className="px-4 py-2 tabular-nums">
                {formatDate(r.deadlineDate)}
              </td>
              <td className="px-4 py-2">
                <DaysPill days={r.daysRemaining} />
              </td>
              <td className="px-4 py-2">{r.assignedUserName ?? "—"}</td>
              <td className="px-4 py-2 capitalize">
                {r.status.replace(/_/g, " ")}
                {r.outcome && (
                  <div className="text-[11px] text-[#666] capitalize">
                    {r.outcome}
                  </div>
                )}
              </td>
              <td className="px-4 py-2">
                <Link
                  href={`/cases/${r.caseId}`}
                  className="text-[12px] underline"
                  style={{ color: COLORS.brand }}
                >
                  View case
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AppealsCouncilTabs({ data }: { data: AcBriefWorkspace }) {
  return (
    <Tabs defaultValue="pending" className="w-full">
      <TabsList>
        <TabsTrigger value="pending">
          Pending ({data.counts.pending})
        </TabsTrigger>
        <TabsTrigger value="drafting">
          Drafting ({data.counts.drafting})
        </TabsTrigger>
        <TabsTrigger value="in_review">
          In Review ({data.counts.inReview})
        </TabsTrigger>
        <TabsTrigger value="filed">
          Filed ({data.counts.filed})
        </TabsTrigger>
        <TabsTrigger value="decided">
          Decided ({data.counts.decided})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="pending">
        <AcBriefTable rows={data.pending} />
      </TabsContent>
      <TabsContent value="drafting">
        <AcBriefTable rows={data.drafting} />
      </TabsContent>
      <TabsContent value="in_review">
        <AcBriefTable rows={data.inReview} />
      </TabsContent>
      <TabsContent value="filed">
        <AcBriefTable rows={data.filed} />
      </TabsContent>
      <TabsContent value="decided">
        <AcBriefTable rows={data.decided} />
      </TabsContent>
    </Tabs>
  );
}
