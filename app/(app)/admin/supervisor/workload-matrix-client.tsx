"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLORS } from "@/lib/design-tokens";
import type { WorkloadRow } from "@/app/actions/workload-matrix";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  attorney: "Attorney",
  case_manager: "Case Manager",
  filing_agent: "Filing",
  intake_agent: "Intake",
  mail_clerk: "Mail",
  medical_records: "Med Records",
  phi_sheet_writer: "PHI Writer",
  reviewer: "Reviewer",
  fee_collection: "Fee Collection",
  hearing_advocate: "Hearing Advocate",
  appeals_council: "Appeals Council",
  post_hearing: "Post-Hearing",
  pre_hearing_prep: "Pre-Hearing Prep",
  viewer: "Viewer",
};

const TEAM_LABELS: Record<string, string> = {
  intake: "Intake",
  filing: "Filing",
  medical_records: "Medical Records",
  mail_sorting: "Mail Sorting",
  case_management: "Case Mgmt",
  hearings: "Hearings",
  administration: "Admin",
};

const ALL = "__all__";

type SortKey = "name" | "role" | "team" | "open" | "overdue" | "cases" | "activity";

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function WorkloadMatrixClient({ rows }: { rows: WorkloadRow[] }) {
  const [roleFilter, setRoleFilter] = useState<string>(ALL);
  const [teamFilter, setTeamFilter] = useState<string>(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("overdue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.role);
    return Array.from(set).sort();
  }, [rows]);

  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.team) set.add(r.team);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (roleFilter !== ALL && r.role !== roleFilter) return false;
      if (teamFilter !== ALL && (r.team ?? "") !== teamFilter) return false;
      return true;
    });
  }, [rows, roleFilter, teamFilter]);

  // Team average of overdue count, used to flag bottleneck people.
  const teamAverageOverdue = useMemo(() => {
    if (filtered.length === 0) return 0;
    const sum = filtered.reduce((acc, r) => acc + r.overdueTaskCount, 0);
    return sum / filtered.length;
  }, [filtered]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "role":
          return a.role.localeCompare(b.role) * dir;
        case "team":
          return (a.team ?? "").localeCompare(b.team ?? "") * dir;
        case "open":
          return (a.openTaskCount - b.openTaskCount) * dir;
        case "overdue":
          return (a.overdueTaskCount - b.overdueTaskCount) * dir;
        case "cases":
          return (a.activeCaseCount - b.activeCaseCount) * dir;
        case "activity": {
          const at = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
          const bt = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
          return (at - bt) * dir;
        }
        default:
          return 0;
      }
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "role" || key === "team" ? "asc" : "desc");
    }
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p
            className="text-[13px]"
            style={{ color: COLORS.text2 }}
          >
            No workload data available. This can happen when the org has no
            active team members, or when you aren&apos;t signed in with a
            supervisor role.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label
            className="text-[11px] font-medium uppercase tracking-[0.04em]"
            style={{ color: COLORS.text3 }}
          >
            Role
          </label>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-8 w-40 text-[12px]">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All roles</SelectItem>
              {roleOptions.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r] ?? r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <label
            className="text-[11px] font-medium uppercase tracking-[0.04em]"
            style={{ color: COLORS.text3 }}
          >
            Team
          </label>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="h-8 w-40 text-[12px]">
              <SelectValue placeholder="All teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All teams</SelectItem>
              {teamOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {TEAM_LABELS[t] ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div
          className="ml-auto text-[11px]"
          style={{ color: COLORS.text3 }}
        >
          Bottleneck threshold:{" "}
          <span style={{ color: COLORS.text2 }}>
            &gt; {(teamAverageOverdue * 2).toFixed(1)} overdue
          </span>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  active={sortKey === "name"}
                  dir={sortDir}
                  onClick={() => toggleSort("name")}
                >
                  Name
                </SortableHead>
                <SortableHead
                  active={sortKey === "role"}
                  dir={sortDir}
                  onClick={() => toggleSort("role")}
                >
                  Role
                </SortableHead>
                <SortableHead
                  active={sortKey === "team"}
                  dir={sortDir}
                  onClick={() => toggleSort("team")}
                >
                  Team
                </SortableHead>
                <SortableHead
                  active={sortKey === "open"}
                  dir={sortDir}
                  onClick={() => toggleSort("open")}
                  align="right"
                >
                  Open
                </SortableHead>
                <SortableHead
                  active={sortKey === "overdue"}
                  dir={sortDir}
                  onClick={() => toggleSort("overdue")}
                  align="right"
                >
                  Overdue
                </SortableHead>
                <SortableHead
                  active={sortKey === "cases"}
                  dir={sortDir}
                  onClick={() => toggleSort("cases")}
                  align="right"
                >
                  Active Cases
                </SortableHead>
                <SortableHead
                  active={sortKey === "activity"}
                  dir={sortDir}
                  onClick={() => toggleSort("activity")}
                >
                  Last Activity
                </SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => {
                const isBottleneck =
                  row.overdueTaskCount > 2 * teamAverageOverdue &&
                  row.overdueTaskCount > 0 &&
                  teamAverageOverdue > 0;
                return (
                  <TableRow key={row.userId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {ROLE_LABELS[row.role] ?? row.role}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="text-[12px]"
                      style={{ color: COLORS.text2 }}
                    >
                      {row.team ? TEAM_LABELS[row.team] ?? row.team : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.openTaskCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {isBottleneck ? (
                        <span
                          className="inline-flex items-center rounded-[4px] px-1.5 py-0.5 font-semibold"
                          style={{
                            backgroundColor: COLORS.badSubtle,
                            color: COLORS.bad,
                          }}
                        >
                          {row.overdueTaskCount}
                        </span>
                      ) : (
                        <span style={{ color: COLORS.text1 }}>
                          {row.overdueTaskCount}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.activeCaseCount}
                    </TableCell>
                    <TableCell
                      className="text-[12px]"
                      style={{ color: COLORS.text2 }}
                    >
                      {formatRelative(row.lastActivity)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-[12px] py-6"
                    style={{ color: COLORS.text3 }}
                  >
                    No users match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SortableHead({
  active,
  dir,
  onClick,
  children,
  align,
}: {
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.04em]"
        style={{ color: active ? COLORS.brand : COLORS.text2 }}
      >
        {children}
        {active && <span className="text-[10px]">{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </TableHead>
  );
}
