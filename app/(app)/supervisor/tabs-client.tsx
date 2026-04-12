"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { COLORS } from "@/lib/design-tokens";
import type {
  WorkloadRow,
  EscalationRow,
  SupervisorEventRow,
  SupervisorEventWorkspace,
} from "@/app/actions/supervisor";

// ─── Helpers ───────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function EscalationBadge({ state }: { state: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    reminder_sent: { bg: COLORS.warnSubtle, color: COLORS.warn },
    supervisor_notified: { bg: COLORS.badSubtle, color: COLORS.bad },
    management_flagged: { bg: "#3a0000", color: "#ffffff" },
  };
  const s = styles[state] ?? { bg: COLORS.okSubtle, color: COLORS.ok };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {state.replace(/_/g, " ")}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    urgent: { bg: COLORS.badSubtle, color: COLORS.bad },
    high: { bg: COLORS.warnSubtle, color: COLORS.warn },
    medium: { bg: COLORS.okSubtle, color: COLORS.ok },
    low: { bg: COLORS.brandSubtle, color: COLORS.text3 },
  };
  const s = styles[priority] ?? styles.medium;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {priority}
    </span>
  );
}

function EventTypeBadge({ type }: { type: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{
        backgroundColor: COLORS.brandSubtle,
        color: COLORS.brand,
      }}
    >
      {type.replace(/_/g, " ")}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    detected: COLORS.warn,
    file_updated: COLORS.ok,
    draft_created: COLORS.ok,
    task_assigned: COLORS.ok,
    awaiting_review: COLORS.warn,
    resolved: COLORS.text3,
    dismissed: COLORS.text3,
  };
  return (
    <span className="flex items-center gap-1.5 text-[11px] capitalize">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: colorMap[status] ?? COLORS.text3 }}
      />
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── Workload Table ────────────────────────────────────────

function WorkloadBar({
  pending,
  inProgress,
  max,
}: {
  pending: number;
  inProgress: number;
  max: number;
}) {
  const total = pending + inProgress;
  const pct = max > 0 ? Math.min(100, (total / max) * 100) : 0;
  const inProgressPct = max > 0 ? Math.min(100, (inProgress / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-[#f0f0f0] rounded-full overflow-hidden">
        <div className="h-full flex">
          <div
            className="h-full rounded-l-full"
            style={{
              width: `${inProgressPct}%`,
              backgroundColor: COLORS.ok,
            }}
          />
          <div
            className="h-full"
            style={{
              width: `${pct - inProgressPct}%`,
              backgroundColor: COLORS.brandMuted,
              borderTopRightRadius: "9999px",
              borderBottomRightRadius: "9999px",
            }}
          />
        </div>
      </div>
      <span className="text-[11px] tabular-nums text-[#666] w-6 text-right">
        {total}
      </span>
    </div>
  );
}

function WorkloadTable({ rows }: { rows: WorkloadRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="text-sm text-[#666]">
            No team members with open tasks.
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxTasks = Math.max(...rows.map((r) => r.totalOpen), 1);

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
            <th className="text-left px-4 py-2 font-medium">Team Member</th>
            <th className="text-left px-4 py-2 font-medium">Role</th>
            <th className="text-left px-4 py-2 font-medium">Workload</th>
            <th className="text-right px-4 py-2 font-medium">Pending</th>
            <th className="text-right px-4 py-2 font-medium">In Progress</th>
            <th className="text-right px-4 py-2 font-medium">Overdue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.userId}
              style={{ borderTop: `1px solid ${COLORS.borderSubtle}` }}
            >
              <td className="px-4 py-2">
                <div className="font-medium">{r.userName}</div>
                {r.team && (
                  <div className="text-[11px] text-[#666] capitalize">
                    {r.team.replace(/_/g, " ")}
                  </div>
                )}
              </td>
              <td className="px-4 py-2 capitalize text-[#666]">
                {r.role.replace(/_/g, " ")}
              </td>
              <td className="px-4 py-2 w-40">
                <WorkloadBar
                  pending={r.pendingTasks}
                  inProgress={r.inProgressTasks}
                  max={maxTasks}
                />
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {r.pendingTasks}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {r.inProgressTasks}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {r.overdueTasks > 0 ? (
                  <span style={{ color: COLORS.bad, fontWeight: 600 }}>
                    {r.overdueTasks}
                  </span>
                ) : (
                  <span className="text-[#999]">0</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Escalation Table ──────────────────────────────────────

function EscalationTable({ rows }: { rows: EscalationRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="text-sm text-[#666]">No escalated tasks.</p>
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
            <th className="text-left px-4 py-2 font-medium">Task</th>
            <th className="text-left px-4 py-2 font-medium">Case</th>
            <th className="text-left px-4 py-2 font-medium">Assigned to</th>
            <th className="text-left px-4 py-2 font-medium">Priority</th>
            <th className="text-left px-4 py-2 font-medium">Escalation</th>
            <th className="text-left px-4 py-2 font-medium">Due</th>
            <th className="text-right px-4 py-2 font-medium">Overdue</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.taskId}
              style={{ borderTop: `1px solid ${COLORS.borderSubtle}` }}
            >
              <td className="px-4 py-2 font-medium max-w-[200px] truncate">
                {r.taskTitle}
              </td>
              <td className="px-4 py-2">{r.caseNumber}</td>
              <td className="px-4 py-2">{r.assignedUserName ?? "\u2014"}</td>
              <td className="px-4 py-2">
                <PriorityBadge priority={r.priority} />
              </td>
              <td className="px-4 py-2">
                <EscalationBadge state={r.escalationState} />
              </td>
              <td className="px-4 py-2 tabular-nums">
                {formatDate(r.dueDate)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {r.daysOverdue > 0 ? (
                  <span style={{ color: COLORS.bad, fontWeight: 600 }}>
                    {r.daysOverdue}d
                  </span>
                ) : (
                  <span className="text-[#999]">\u2014</span>
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

// ─── Events Table ──────────────────────────────────────────

function EventsTable({ rows }: { rows: SupervisorEventRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="text-sm text-[#666]">No supervisor events.</p>
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
            <th className="text-left px-4 py-2 font-medium">Event</th>
            <th className="text-left px-4 py-2 font-medium">Status</th>
            <th className="text-left px-4 py-2 font-medium">Case</th>
            <th className="text-left px-4 py-2 font-medium">Assigned</th>
            <th className="text-left px-4 py-2 font-medium">Detected</th>
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
                <div className="flex flex-col gap-1">
                  <EventTypeBadge type={r.eventType} />
                  <p className="text-[12px] text-[#444] max-w-xs truncate">
                    {r.summary}
                  </p>
                </div>
              </td>
              <td className="px-4 py-2">
                <StatusDot status={r.status} />
              </td>
              <td className="px-4 py-2">{r.caseNumber ?? "\u2014"}</td>
              <td className="px-4 py-2">{r.assignedUserName ?? "\u2014"}</td>
              <td className="px-4 py-2 tabular-nums">
                {formatDate(r.detectedAt)}
              </td>
              <td className="px-4 py-2">
                {r.caseId && (
                  <Link
                    href={`/cases/${r.caseId}`}
                    className="text-[12px] underline"
                    style={{ color: COLORS.brand }}
                  >
                    View case
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Tabs Component ───────────────────────────────────

export function SupervisorTabs({
  workload,
  escalations,
  events,
}: {
  workload: WorkloadRow[];
  escalations: EscalationRow[];
  events: SupervisorEventWorkspace;
}) {
  return (
    <Tabs defaultValue="workload" className="w-full">
      <TabsList>
        <TabsTrigger value="workload">Workload ({workload.length})</TabsTrigger>
        <TabsTrigger value="escalations">
          Escalations ({escalations.length})
        </TabsTrigger>
        <TabsTrigger value="active_events">
          Active Events ({events.active.length})
        </TabsTrigger>
        <TabsTrigger value="resolved_events">
          Resolved ({events.resolved.length})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="workload">
        <WorkloadTable rows={workload} />
      </TabsContent>
      <TabsContent value="escalations">
        <EscalationTable rows={escalations} />
      </TabsContent>
      <TabsContent value="active_events">
        <EventsTable rows={events.active} />
      </TabsContent>
      <TabsContent value="resolved_events">
        <EventsTable rows={events.resolved} />
      </TabsContent>
    </Tabs>
  );
}
