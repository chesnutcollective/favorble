"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type {
  CompositeLeaderboardRow,
  MessagingFrequencyRow,
  ResponseTimeRow,
} from "@/app/actions/leaderboards";

const PERIOD_OPTIONS = [
  { value: "7", label: "Last 7d" },
  { value: "30", label: "Last 30d" },
  { value: "90", label: "Last 90d" },
  { value: "365", label: "Last 365d" },
];

const ROLE_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "attorney", label: "Attorney" },
  { value: "case_manager", label: "Case Manager" },
  { value: "intake_agent", label: "Intake" },
  { value: "filing_agent", label: "Filing" },
  { value: "mail_clerk", label: "Mail Clerk" },
  { value: "medical_records", label: "Medical Records" },
  { value: "phi_sheet_writer", label: "PHI Writer" },
  { value: "reviewer", label: "Reviewer" },
];

type Props = {
  period: string;
  role: string;
  view: string;
  composite: CompositeLeaderboardRow[];
  messaging: MessagingFrequencyRow[];
  responseTime: ResponseTimeRow[];
};

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const mins = Math.round(seconds / 60);
    return `${mins}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function LeaderboardsClient({
  period,
  role,
  view,
  composite,
  messaging,
  responseTime,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      next.set(key, value);
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`);
      });
    },
    [params, pathname, router],
  );

  return (
    <div className={cn("space-y-4", isPending && "opacity-70")}>
      {/* Filter bar — period + role */}
      <div className="bg-white border border-[#EAEAEA] rounded-[10px] p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <span className="text-[11px] uppercase tracking-[0.06em] text-[#999] font-medium">
            Time Period
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PERIOD_OPTIONS.map((opt) => {
              const active = period === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setParam("period", opt.value)}
                  className={cn(
                    "text-[12px] px-3 py-1.5 rounded-md border transition-colors duration-150 tabular-nums",
                    active
                      ? "bg-[#263c94] text-white border-[#263c94]"
                      : "bg-white text-[#263c94] border-[#EAEAEA] hover:border-[#263c94]",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <span className="text-[11px] uppercase tracking-[0.06em] text-[#999] font-medium">
            Role
          </span>
          <select
            value={role}
            onChange={(e) => setParam("role", e.target.value)}
            className="text-[12px] px-3 py-1.5 rounded-md border border-[#EAEAEA] bg-white text-[#1a1a1a] focus:outline-none focus:border-[#263c94]"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* View tabs */}
      <Tabs
        value={view}
        onValueChange={(v) => setParam("view", v)}
        className="w-full"
      >
        <TabsList>
          <TabsTrigger value="composite">Composite</TabsTrigger>
          <TabsTrigger value="messaging">Messaging frequency</TabsTrigger>
          <TabsTrigger value="response-time">Response time</TabsTrigger>
        </TabsList>

        <TabsContent value="composite" className="mt-4">
          <CompositeTable rows={composite} />
        </TabsContent>

        <TabsContent value="messaging" className="mt-4">
          <MessagingTable rows={messaging} />
        </TabsContent>

        <TabsContent value="response-time" className="mt-4">
          <ResponseTimeTable rows={responseTime} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-10 text-center text-sm text-[#666] bg-white border border-[#EAEAEA] rounded-[10px]">
      {message}
    </div>
  );
}

function CompositeTable({ rows }: { rows: CompositeLeaderboardRow[] }) {
  if (rows.length === 0) {
    return <EmptyState message="No data yet for the selected period." />;
  }
  return (
    <div className="bg-white border border-[#EAEAEA] rounded-[10px] overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rank</TableHead>
            <TableHead>Staff</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Messages</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.userId}>
              <TableCell className="font-mono text-[12px] text-[#666]">
                #{i + 1}
              </TableCell>
              <TableCell className="font-medium text-[#1a1a1a]">
                {r.name}
              </TableCell>
              <TableCell className="text-[#666] capitalize">
                {r.role?.replace(/_/g, " ") ?? "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.messages}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MessagingTable({ rows }: { rows: MessagingFrequencyRow[] }) {
  if (rows.length === 0 || rows.every((r) => r.totalMessages === 0)) {
    return (
      <EmptyState message="No messaging activity recorded in this period yet." />
    );
  }
  return (
    <div className="bg-white border border-[#EAEAEA] rounded-[10px] overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rank</TableHead>
            <TableHead>Staff</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Per day</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.userId}>
              <TableCell className="font-mono text-[12px] text-[#666]">
                #{i + 1}
              </TableCell>
              <TableCell className="font-medium text-[#1a1a1a]">
                {r.name}
              </TableCell>
              <TableCell className="text-[#666] capitalize">
                {r.role?.replace(/_/g, " ") ?? "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.totalMessages}
              </TableCell>
              <TableCell className="text-right tabular-nums text-[#263c94] font-semibold">
                {r.messagesPerDay}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ResponseTimeTable({ rows }: { rows: ResponseTimeRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState message="No response-time data yet. Populate communications.respondedAt / responseTimeSeconds to enable this leaderboard." />
    );
  }
  return (
    <div className="bg-white border border-[#EAEAEA] rounded-[10px] overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rank</TableHead>
            <TableHead>Staff</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Responses</TableHead>
            <TableHead className="text-right">Avg response</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.userId}>
              <TableCell className="font-mono text-[12px] text-[#666]">
                #{i + 1}
              </TableCell>
              <TableCell className="font-medium text-[#1a1a1a]">
                {r.name}
              </TableCell>
              <TableCell className="text-[#666] capitalize">
                {r.role?.replace(/_/g, " ") ?? "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.respondedCount}
              </TableCell>
              <TableCell className="text-right tabular-nums text-[#1d72b8] font-semibold">
                {formatDuration(r.avgResponseSeconds)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
