"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon,
  CalendarCheckOut01Icon,
  UserIcon,
  Search01Icon,
  Alert01Icon,
  CheckmarkCircle01Icon,
  NoteEditIcon,
  Legal01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import {
  assignPhiSheetToWriter,
  updatePhiSheetStatus,
  type PhiSheetStatus,
  type PhiWriterMetrics,
} from "@/app/actions/phi-writer";

type SerializedRow = {
  caseId: string;
  caseNumber: string;
  claimantName: string;
  hearingDate: string | null;
  daysUntilHearing: number | null;
  alj: string | null;
  hearingOffice: string | null;
  ssaClaimNumber: string | null;
  phiSheetStatus: PhiSheetStatus;
  assignedTo: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
};

type Writer = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  team: string | null;
};

type StatusFilter = "all" | "mine" | PhiSheetStatus;

const STATUS_LABELS: Record<PhiSheetStatus, string> = {
  unassigned: "Unassigned",
  assigned: "Assigned",
  in_progress: "In Progress",
  in_review: "In Review",
  complete: "Complete",
};

const STATUS_ORDER: PhiSheetStatus[] = [
  "unassigned",
  "assigned",
  "in_progress",
  "in_review",
  "complete",
];

const ACCENT = "#263c94";
const STATUS_BLUE = "#1d72b8";
const ACCENT_SOFT = "rgba(38,60,148,0.08)";
const SURFACE = "#F8F9FC";

function countdownTone(days: number | null) {
  if (days === null) {
    return {
      label: "No date",
      color: "#6b7280",
      bg: "rgba(107,114,128,0.1)",
    };
  }
  if (days < 0) {
    return {
      label: `${Math.abs(days)}d overdue`,
      color: "#b91c1c",
      bg: "rgba(185,28,28,0.12)",
    };
  }
  if (days <= 14) {
    return {
      label: `${days}d`,
      color: "#b91c1c",
      bg: "rgba(185,28,28,0.12)",
    };
  }
  if (days <= 30) {
    return {
      label: `${days}d`,
      color: "#b45309",
      bg: "rgba(180,83,9,0.12)",
    };
  }
  return {
    label: `${days}d`,
    color: STATUS_BLUE,
    bg: "rgba(29,114,184,0.1)",
  };
}

function statusBadgeStyle(status: PhiSheetStatus): React.CSSProperties {
  switch (status) {
    case "unassigned":
      return { backgroundColor: "#F0F0F0", color: "#374151" };
    case "assigned":
      return { backgroundColor: ACCENT_SOFT, color: ACCENT };
    case "in_progress":
      return {
        backgroundColor: "rgba(29,114,184,0.12)",
        color: STATUS_BLUE,
      };
    case "in_review":
      return {
        backgroundColor: "rgba(180,83,9,0.12)",
        color: "#b45309",
      };
    case "complete":
      return {
        backgroundColor: "rgba(22,163,74,0.12)",
        color: "#15803d",
      };
  }
}

function formatHearingDate(iso: string | null): string {
  if (!iso) return "No hearing scheduled";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PhiWriterWorkspace({
  rows,
  metrics,
  writers,
  currentUserId,
}: {
  rows: SerializedRow[];
  metrics: PhiWriterMetrics;
  writers: Writer[];
  currentUserId: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    rows[0]?.caseId ?? null,
  );
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "mine") {
        if (r.assignedTo?.id !== currentUserId) return false;
      } else if (filter !== "all") {
        if (r.phiSheetStatus !== filter) return false;
      }
      if (!q) return true;
      return (
        r.claimantName.toLowerCase().includes(q) ||
        r.caseNumber.toLowerCase().includes(q) ||
        (r.alj ?? "").toLowerCase().includes(q) ||
        (r.ssaClaimNumber ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter, search, currentUserId]);

  const selected = useMemo(
    () => filtered.find((r) => r.caseId === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );

  function handleStatusChange(caseId: string, status: PhiSheetStatus) {
    startTransition(async () => {
      await updatePhiSheetStatus(caseId, status);
    });
  }

  function handleAssign(caseId: string, userId: string) {
    startTransition(async () => {
      await assignPhiSheetToWriter(caseId, userId);
    });
  }

  return (
    <div className="space-y-4">
      {/* Workload metrics */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label="My Assigned"
          value={metrics.myAssigned}
          icon={UserIcon}
          tone="accent"
        />
        <MetricCard
          label="In Progress"
          value={metrics.inProgress}
          icon={NoteEditIcon}
          tone="status"
        />
        <MetricCard
          label="In Review"
          value={metrics.inReview}
          icon={Clock01Icon}
          tone="amber"
        />
        <MetricCard
          label="Completed This Week"
          value={metrics.completedThisWeek}
          icon={CheckmarkCircle01Icon}
          tone="green"
        />
        <MetricCard
          label="Unassigned"
          value={metrics.unassigned}
          icon={Alert01Icon}
          tone="neutral"
        />
        <MetricCard
          label="Due ≤14 days"
          value={metrics.dueWithin14Days}
          icon={CalendarCheckOut01Icon}
          tone="red"
        />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Left: Queue */}
        <Card
          className="overflow-hidden"
          style={{ borderRadius: 10, backgroundColor: "white" }}
        >
          <CardHeader
            className="pb-3"
            style={{
              backgroundColor: SURFACE,
              borderBottom: "1px solid #eef0f5",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">
                Assignment Queue ({filtered.length})
              </CardTitle>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 relative">
                <HugeiconsIcon
                  icon={Search01Icon}
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder="Search claimant, case #, ALJ..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 text-xs border rounded-md bg-white focus:outline-none focus:ring-2"
                  style={
                    {
                      borderColor: "#e5e7eb",
                      "--tw-ring-color": ACCENT,
                    } as React.CSSProperties
                  }
                />
              </div>
              <Select
                value={filter}
                onValueChange={(v) => setFilter(v as StatusFilter)}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="mine">Mine</SelectItem>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[640px]">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No cases match the current filters.
              </div>
            ) : (
              <ul className="divide-y">
                {filtered.map((row) => {
                  const tone = countdownTone(row.daysUntilHearing);
                  const isSelected = selected?.caseId === row.caseId;
                  return (
                    <li key={row.caseId}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.caseId)}
                        className={cn(
                          "w-full text-left px-4 py-3 transition-colors duration-200",
                          isSelected ? "" : "hover:bg-muted/40",
                        )}
                        style={{
                          backgroundColor: isSelected ? ACCENT_SOFT : undefined,
                          borderLeft: isSelected
                            ? `3px solid ${ACCENT}`
                            : "3px solid transparent",
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground truncate">
                                {row.claimantName}
                              </p>
                              <span className="text-[11px] text-muted-foreground shrink-0">
                                {row.caseNumber}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                              {formatHearingDate(row.hearingDate)}
                              {row.alj ? ` · ALJ ${row.alj}` : ""}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <Badge
                                variant="outline"
                                className="text-[10px] border-0"
                                style={statusBadgeStyle(row.phiSheetStatus)}
                              >
                                {STATUS_LABELS[row.phiSheetStatus]}
                              </Badge>
                              {row.assignedTo && (
                                <span className="text-[10px] text-muted-foreground">
                                  {row.assignedTo.firstName}{" "}
                                  {row.assignedTo.lastName[0]}.
                                </span>
                              )}
                            </div>
                          </div>
                          <div
                            className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold"
                            style={{
                              backgroundColor: tone.bg,
                              color: tone.color,
                            }}
                          >
                            {tone.label}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right: Selected case preview */}
        <div className="space-y-4">
          {selected ? (
            <SelectedCasePreview
              row={selected}
              writers={writers}
              isPending={isPending}
              onStatusChange={(s) => handleStatusChange(selected.caseId, s)}
              onAssign={(uid) => handleAssign(selected.caseId, uid)}
            />
          ) : (
            <Card style={{ borderRadius: 10 }}>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Select a case from the queue to preview.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  // biome-ignore lint/suspicious/noExplicitAny: Hugeicons icon type
  icon: any;
  tone: "accent" | "status" | "amber" | "green" | "neutral" | "red";
}) {
  const styles: Record<
    typeof tone,
    { color: string; bg: string; border?: string }
  > = {
    accent: { color: ACCENT, bg: ACCENT_SOFT },
    status: { color: STATUS_BLUE, bg: "rgba(29,114,184,0.1)" },
    amber: { color: "#b45309", bg: "rgba(180,83,9,0.1)" },
    green: { color: "#15803d", bg: "rgba(22,163,74,0.1)" },
    neutral: { color: "#374151", bg: "rgba(55,65,81,0.08)" },
    red: { color: "#b91c1c", bg: "rgba(185,28,28,0.1)" },
  };
  const s = styles[tone];
  return (
    <Card
      className="border-0 shadow-none"
      style={{
        backgroundColor: SURFACE,
        borderRadius: 10,
      }}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <div
            className="rounded-md p-1.5"
            style={{ backgroundColor: s.bg, color: s.color }}
          >
            <HugeiconsIcon icon={icon} size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
              {label}
            </p>
            <p
              className="text-lg font-semibold leading-none mt-0.5"
              style={{ color: s.color }}
            >
              {value}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SelectedCasePreview({
  row,
  writers,
  isPending,
  onStatusChange,
  onAssign,
}: {
  row: SerializedRow;
  writers: Writer[];
  isPending: boolean;
  onStatusChange: (s: PhiSheetStatus) => void;
  onAssign: (userId: string) => void;
}) {
  const tone = countdownTone(row.daysUntilHearing);
  return (
    <Card style={{ borderRadius: 10 }}>
      <CardHeader
        className="pb-3"
        style={{
          backgroundColor: SURFACE,
          borderBottom: "1px solid #eef0f5",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {row.caseNumber}
            </p>
            <h2 className="text-lg font-semibold text-foreground truncate mt-0.5">
              {row.claimantName}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {formatHearingDate(row.hearingDate)}
            </p>
          </div>
          <div
            className="shrink-0 rounded-lg px-3 py-2 text-center"
            style={{ backgroundColor: tone.bg, color: tone.color }}
          >
            <div className="text-[10px] uppercase tracking-wide font-medium opacity-80">
              Hearing
            </div>
            <div className="text-base font-bold leading-none mt-1">
              {tone.label}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoRow label="ALJ" value={row.alj} icon={Legal01Icon} />
          <InfoRow label="Hearing Office" value={row.hearingOffice} />
          <InfoRow label="SSA Claim #" value={row.ssaClaimNumber} />
          <InfoRow
            label="Assigned To"
            value={
              row.assignedTo
                ? `${row.assignedTo.firstName} ${row.assignedTo.lastName}`
                : "Unassigned"
            }
          />
        </div>

        <div
          className="rounded-md p-3 space-y-3"
          style={{ backgroundColor: ACCENT_SOFT }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-medium" style={{ color: ACCENT }}>
              PHI Sheet Status
            </div>
            <Badge
              variant="outline"
              className="border-0 text-[11px]"
              style={statusBadgeStyle(row.phiSheetStatus)}
            >
              {STATUS_LABELS[row.phiSheetStatus]}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={row.phiSheetStatus}
              onValueChange={(v) => onStatusChange(v as PhiSheetStatus)}
              disabled={isPending}
            >
              <SelectTrigger className="h-8 text-xs bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={row.assignedTo?.id ?? "unassigned"}
              onValueChange={(v) => {
                if (v && v !== "unassigned") onAssign(v);
              }}
              disabled={isPending}
            >
              <SelectTrigger className="h-8 text-xs bg-white">
                <SelectValue placeholder="Assign writer…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned" disabled>
                  Unassigned
                </SelectItem>
                {writers.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.firstName} {w.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button asChild variant="outline" size="sm">
            <Link href={`/cases/${row.caseId}/overview`}>Open Case</Link>
          </Button>
          <Button
            asChild
            size="sm"
            style={{ backgroundColor: ACCENT, color: "white" }}
          >
            <Link href={`/phi-writer/${row.caseId}`}>Author PHI Sheet</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | null;
  // biome-ignore lint/suspicious/noExplicitAny: Hugeicons icon type
  icon?: any;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon ? <HugeiconsIcon icon={icon} size={11} /> : null}
        {label}
      </p>
      <p className="text-sm text-foreground mt-0.5 truncate">{value ?? "—"}</p>
    </div>
  );
}
