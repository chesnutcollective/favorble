"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { COLORS } from "@/lib/design-tokens";
import type {
  HearingOutcomeRow,
  HearingOutcomeWorkspace,
} from "@/app/actions/post-hearing";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ProgressDots({ row }: { row: HearingOutcomeRow }) {
  const steps: Array<{ done: boolean; label: string }> = [
    { done: row.progress.clientNotified, label: "Client notified" },
    { done: row.progress.stageAdvanced, label: "Stage advanced" },
    { done: row.progress.tasksCreated, label: "Tasks created" },
    { done: row.progress.completed, label: "Complete" },
  ];
  return (
    <div className="flex items-center gap-1">
      {steps.map((step) => (
        <span
          key={step.label}
          title={step.label}
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{
            backgroundColor: step.done ? COLORS.ok : COLORS.borderDefault,
          }}
        />
      ))}
    </div>
  );
}

function HearingOutcomeTable({ rows }: { rows: HearingOutcomeRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="text-sm text-[#666]">
            No hearing outcomes in this bucket.
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
            <th className="text-left px-4 py-2 font-medium">Hearing</th>
            <th className="text-left px-4 py-2 font-medium">Outcome</th>
            <th className="text-left px-4 py-2 font-medium">Age</th>
            <th className="text-left px-4 py-2 font-medium">Processed by</th>
            <th className="text-left px-4 py-2 font-medium">Progress</th>
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
                {formatDate(r.hearingDate)}
              </td>
              <td className="px-4 py-2 capitalize">
                {r.outcome ? r.outcome.replace(/_/g, " ") : "—"}
              </td>
              <td className="px-4 py-2 tabular-nums">{r.ageInDays}d</td>
              <td className="px-4 py-2">{r.processedByName ?? "—"}</td>
              <td className="px-4 py-2">
                <ProgressDots row={r} />
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

export function PostHearingTabs({ data }: { data: HearingOutcomeWorkspace }) {
  return (
    <Tabs defaultValue="awaiting" className="w-full">
      <TabsList>
        <TabsTrigger value="awaiting">
          Awaiting processing ({data.counts.awaiting})
        </TabsTrigger>
        <TabsTrigger value="client_notified">
          Client notified ({data.counts.clientNotified})
        </TabsTrigger>
        <TabsTrigger value="stage_advanced">
          Stage advanced ({data.counts.stageAdvanced})
        </TabsTrigger>
        <TabsTrigger value="completed">
          Completed ({data.counts.completed})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="awaiting">
        <HearingOutcomeTable rows={data.awaiting} />
      </TabsContent>
      <TabsContent value="client_notified">
        <HearingOutcomeTable rows={data.clientNotified} />
      </TabsContent>
      <TabsContent value="stage_advanced">
        <HearingOutcomeTable rows={data.stageAdvanced} />
      </TabsContent>
      <TabsContent value="completed">
        <HearingOutcomeTable rows={data.completed} />
      </TabsContent>
    </Tabs>
  );
}
