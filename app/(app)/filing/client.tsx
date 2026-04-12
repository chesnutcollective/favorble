"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  File01Icon,
  Sent02Icon,
  Clock01Icon,
  Alert01Icon,
  CheckmarkCircle01Icon,
  RocketIcon,
  Copy01Icon,
} from "@hugeicons/core-free-icons";
import {
  oneClickFile,
  applyFilingTemplate,
  type FilingFilter,
  type FilingQueueRow,
} from "@/app/actions/filing";

type Metrics = {
  readyToFile: number;
  inProgress: number;
  submittedToday: number;
  dueThisWeek: number;
};

type FilingTemplate = {
  id: string;
  name: string;
  description: string | null;
  type: "SSDI" | "SSI" | "Both" | "Reconsideration" | "Hearing";
  requiresSignature: boolean;
  documentCount: number;
};

type SortField = "dueDateAsc" | "priorityDesc" | "createdAsc";

const FILTER_CHIPS: Array<{ value: FilingFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "ssdi", label: "SSDI" },
  { value: "ssi", label: "SSI" },
  { value: "both", label: "Both" },
  { value: "reconsideration", label: "Reconsideration" },
  { value: "hearing_request", label: "Hearing Request" },
];

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const ACCENT = "#263c94";
const STATUS_READY = "#1d72b8";
const STATUS_IN_PROGRESS = "#cf8a00";
const STATUS_OVERDUE = "#d1453b";
const SUBTLE_BG = "rgba(38,60,148,0.08)";

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDueBadge(dueDate: string | null): {
  label: string;
  color: string;
} {
  if (!dueDate) return { label: "No date", color: "#8a8f99" };
  const due = new Date(dueDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (due < now) return { label: "Overdue", color: STATUS_OVERDUE };
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return { label: "Today", color: STATUS_IN_PROGRESS };
  if (diffDays === 1) return { label: "Tomorrow", color: STATUS_IN_PROGRESS };
  if (diffDays <= 7) return { label: `${diffDays}d`, color: STATUS_READY };
  return { label: formatDateShort(dueDate), color: "#4b5563" };
}

export function FilingClient({
  initialQueue,
  metrics,
  templates,
}: {
  initialQueue: FilingQueueRow[];
  metrics: Metrics;
  templates: FilingTemplate[];
}) {
  const [filter, setFilter] = useState<FilingFilter>("all");
  const [sortField, setSortField] = useState<SortField>("dueDateAsc");
  const [rowsState, setRowsState] = useState<FilingQueueRow[]>(initialQueue);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [dialogTarget, setDialogTarget] = useState<FilingQueueRow | null>(null);
  const [caseIdForTemplate, setCaseIdForTemplate] = useState<string>("");
  const [templateStatus, setTemplateStatus] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(100);
  const [, startTransition] = useTransition();

  const filteredSorted = useMemo(() => {
    const filtered = rowsState.filter((row) => {
      if (pendingIds.has(row.taskId)) return false;
      if (filter === "all") return true;
      const primary = (row.applicationTypePrimary ?? "").toLowerCase();
      const secondary = (row.applicationTypeSecondary ?? "").toLowerCase();
      const title = row.taskTitle.toLowerCase();
      const combined = `${primary} ${secondary} ${title}`;
      if (filter === "hearing_request") return combined.includes("hearing");
      if (filter === "reconsideration") return combined.includes("reconsid");
      if (filter === "both")
        return (
          (!!primary && !!secondary) ||
          combined.includes("both") ||
          combined.includes("ssdi+ssi")
        );
      if (filter === "ssdi")
        return combined.includes("ssdi") && !combined.includes("ssi");
      if (filter === "ssi")
        return combined.includes("ssi") && !combined.includes("ssdi");
      return true;
    });

    return filtered.sort((a, b) => {
      if (sortField === "dueDateAsc") {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (sortField === "priorityDesc") {
        return (
          (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2)
        );
      }
      // createdAsc (oldest daysWaiting highest -> pushed to top)
      return b.daysWaiting - a.daysWaiting;
    });
  }, [rowsState, filter, sortField, pendingIds]);

  const visibleRows = filteredSorted.slice(0, visibleCount);
  const hasMore = filteredSorted.length > visibleCount;

  function handleConfirmFile() {
    if (!dialogTarget) return;
    const target = dialogTarget;
    setDialogTarget(null);
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.add(target.taskId);
      return next;
    });
    startTransition(async () => {
      try {
        await oneClickFile(
          target.caseId,
          target.taskId,
          target.applicationType,
        );
        // Remove the row from local state — already hidden via pendingIds.
        setRowsState((prev) => prev.filter((r) => r.taskId !== target.taskId));
      } catch (err) {
        // Rollback optimistic hide on failure
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(target.taskId);
          return next;
        });
        console.error("Filing failed", err);
      }
    });
  }

  function handleApplyTemplate(templateId: string) {
    if (!caseIdForTemplate) {
      setTemplateStatus("Pick a case first");
      return;
    }
    startTransition(async () => {
      try {
        const result = await applyFilingTemplate(caseIdForTemplate, templateId);
        setTemplateStatus(`Applied "${result.templateName}"`);
      } catch {
        setTemplateStatus("Template apply failed");
      }
    });
  }

  const caseOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: Array<{ id: string; label: string }> = [];
    for (const row of rowsState) {
      if (seen.has(row.caseId)) continue;
      seen.add(row.caseId);
      opts.push({
        id: row.caseId,
        label: `${row.caseNumber} — ${row.claimantName}`,
      });
    }
    return opts;
  }, [rowsState]);

  return (
    <div className="space-y-4">
      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Ready to File"
          value={metrics.readyToFile}
          color={STATUS_READY}
          icon={File01Icon}
        />
        <MetricCard
          label="In Progress"
          value={metrics.inProgress}
          color={STATUS_IN_PROGRESS}
          icon={Clock01Icon}
        />
        <MetricCard
          label="Submitted Today"
          value={metrics.submittedToday}
          color="#2c9a62"
          icon={CheckmarkCircle01Icon}
        />
        <MetricCard
          label="Due This Week"
          value={metrics.dueThisWeek}
          color={ACCENT}
          icon={Alert01Icon}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
        {/* Queue */}
        <div className="rounded-md border bg-white overflow-hidden">
          {/* Filter + sort bar */}
          <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
              {FILTER_CHIPS.map((chip) => {
                const isActive = filter === chip.value;
                return (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => setFilter(chip.value)}
                    className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: isActive ? ACCENT : "transparent",
                      borderColor: isActive ? ACCENT : "#e5e7eb",
                      color: isActive ? "#ffffff" : "#374151",
                    }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <Select
              value={sortField}
              onValueChange={(v) => setSortField(v as SortField)}
            >
              <SelectTrigger className="w-full lg:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dueDateAsc">
                  Sort: Due Date (soonest)
                </SelectItem>
                <SelectItem value="priorityDesc">
                  Sort: Priority (highest)
                </SelectItem>
                <SelectItem value="createdAsc">
                  Sort: Created (oldest)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Queue table */}
          {visibleRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: SUBTLE_BG }}
              >
                <HugeiconsIcon
                  icon={CheckmarkCircle01Icon}
                  size={28}
                  color={ACCENT}
                />
              </div>
              <h3 className="mt-4 text-sm font-semibold">Filing queue clear</h3>
              <p className="mt-1 text-xs text-[#666]">
                Nothing to file for this filter.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">Case #</TableHead>
                    <TableHead>Claimant</TableHead>
                    <TableHead className="w-[130px]">Type</TableHead>
                    <TableHead className="w-[110px]">Onset</TableHead>
                    <TableHead className="w-[110px]">DLI</TableHead>
                    <TableHead className="w-[90px]">Days</TableHead>
                    <TableHead className="w-[100px]">Due</TableHead>
                    <TableHead className="w-[90px]">Priority</TableHead>
                    <TableHead className="w-[120px] text-right">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => {
                    const due = getDueBadge(row.dueDate);
                    const isOverdue = due.label === "Overdue";
                    const isUrgent =
                      row.priority === "urgent" || row.priority === "high";
                    return (
                      <TableRow
                        key={row.taskId}
                        className="hover:bg-[rgba(38,60,148,0.04)]"
                      >
                        <TableCell className="font-mono text-xs">
                          <Link
                            href={`/cases/${row.caseId}`}
                            className="hover:underline"
                            style={{ color: ACCENT }}
                          >
                            {row.caseNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="font-medium">{row.claimantName}</div>
                          {row.stageName && (
                            <div className="text-[11px] text-[#6b7280]">
                              {row.stageName}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="text-[11px]"
                            style={{
                              borderColor: ACCENT,
                              color: ACCENT,
                              backgroundColor: SUBTLE_BG,
                            }}
                          >
                            {row.applicationType}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-[#4b5563]">
                          {formatDateShort(row.allegedOnsetDate)}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-[#4b5563]">
                          {formatDateShort(row.dateLastInsured)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span
                            className={
                              row.daysWaiting > 30 ? "font-semibold" : ""
                            }
                            style={{
                              color:
                                row.daysWaiting > 30
                                  ? STATUS_OVERDUE
                                  : "#4b5563",
                            }}
                          >
                            {row.daysWaiting}d
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-[11px]">
                          <span
                            className="inline-flex items-center gap-1"
                            style={{ color: due.color }}
                          >
                            <HugeiconsIcon icon={Clock01Icon} size={11} />
                            {due.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          {isUrgent ? (
                            <Badge
                              variant="outline"
                              className="text-[10px]"
                              style={{
                                borderColor: STATUS_OVERDUE,
                                color: STATUS_OVERDUE,
                              }}
                            >
                              {row.priority}
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-[#6b7280] capitalize">
                              {row.priority}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => setDialogTarget(row)}
                            className="h-8 text-xs"
                            style={{
                              backgroundColor: isOverdue
                                ? STATUS_OVERDUE
                                : ACCENT,
                              color: "#ffffff",
                            }}
                          >
                            <HugeiconsIcon
                              icon={Sent02Icon}
                              size={12}
                              className="mr-1"
                            />
                            File Now
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {hasMore && (
                <div className="flex items-center justify-center border-t p-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleCount((v) => v + 100)}
                  >
                    Load more ({filteredSorted.length - visibleCount} remaining)
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Template sidebar */}
        <aside className="space-y-4">
          <div className="rounded-md border bg-white p-4">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={RocketIcon} size={16} color={ACCENT} />
              <h2 className="text-sm font-semibold" style={{ color: ACCENT }}>
                Quick Actions
              </h2>
            </div>
            <p className="mt-1 text-[11px] text-[#6b7280]">
              Apply a template to a case in the queue.
            </p>
            <div className="mt-3 space-y-2">
              <label className="text-[11px] font-medium text-[#4b5563]">
                Target case
              </label>
              <Select
                value={caseIdForTemplate}
                onValueChange={setCaseIdForTemplate}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose case..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {caseOptions.length === 0 ? (
                    <div className="p-2 text-xs text-[#6b7280]">
                      No cases in queue
                    </div>
                  ) : (
                    caseOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {templateStatus && (
                <p
                  className="text-[11px] font-medium"
                  style={{ color: ACCENT }}
                >
                  {templateStatus}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-md border bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={File01Icon} size={16} color={ACCENT} />
                <h2 className="text-sm font-semibold" style={{ color: ACCENT }}>
                  Application Templates
                </h2>
              </div>
              <span className="text-[11px] text-[#6b7280]">
                {templates.length}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {templates.length === 0 ? (
                <div
                  className="rounded-md border border-dashed p-4 text-center text-[11px] text-[#6b7280]"
                  style={{ borderColor: "#e5e7eb" }}
                >
                  No templates available.
                </div>
              ) : (
                templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="rounded-md border p-3"
                    style={{
                      borderColor: "#e5e7eb",
                      backgroundColor: SUBTLE_BG,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[#1f2937] truncate">
                          {tpl.name}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] py-0"
                            style={{
                              borderColor: ACCENT,
                              color: ACCENT,
                            }}
                          >
                            {tpl.type}
                          </Badge>
                          <span className="text-[10px] text-[#6b7280]">
                            {tpl.documentCount} doc
                            {tpl.documentCount === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 w-full text-[11px]"
                      onClick={() => handleApplyTemplate(tpl.id)}
                      disabled={!caseIdForTemplate}
                    >
                      <HugeiconsIcon
                        icon={Copy01Icon}
                        size={12}
                        className="mr-1"
                      />
                      Use Template
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Confirm file dialog */}
      <Dialog
        open={!!dialogTarget}
        onOpenChange={(open) => !open && setDialogTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>File application</DialogTitle>
            <DialogDescription>
              Mark this filing task complete and advance the case to the next
              stage. This action is logged.
            </DialogDescription>
          </DialogHeader>
          {dialogTarget && (
            <div
              className="rounded-md border p-4 space-y-2"
              style={{
                borderColor: "#e5e7eb",
                backgroundColor: SUBTLE_BG,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs" style={{ color: ACCENT }}>
                  {dialogTarget.caseNumber}
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px]"
                  style={{ borderColor: ACCENT, color: ACCENT }}
                >
                  {dialogTarget.applicationType}
                </Badge>
              </div>
              <p className="text-sm font-semibold text-[#1f2937]">
                {dialogTarget.claimantName}
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-[#4b5563]">
                <div>
                  <span className="text-[#6b7280]">Onset: </span>
                  <span className="font-mono">
                    {formatDateShort(dialogTarget.allegedOnsetDate)}
                  </span>
                </div>
                <div>
                  <span className="text-[#6b7280]">DLI: </span>
                  <span className="font-mono">
                    {formatDateShort(dialogTarget.dateLastInsured)}
                  </span>
                </div>
                <div>
                  <span className="text-[#6b7280]">Waiting: </span>
                  <span className="font-mono">{dialogTarget.daysWaiting}d</span>
                </div>
                <div>
                  <span className="text-[#6b7280]">Stage: </span>
                  <span>{dialogTarget.stageName ?? "—"}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmFile}
              style={{ backgroundColor: ACCENT, color: "#ffffff" }}
            >
              <HugeiconsIcon icon={Sent02Icon} size={12} className="mr-1" />
              Confirm & File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  // Hugeicons icon definition (passed through to HugeiconsIcon)
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
}) {
  return (
    <div
      className="rounded-md border bg-white p-4"
      style={{ borderColor: "#e5e7eb" }}
    >
      <div className="flex items-center justify-between">
        <p
          className="text-[11px] font-medium uppercase tracking-wide"
          style={{ color: "#6b7280" }}
        >
          {label}
        </p>
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}1A` }}
        >
          <HugeiconsIcon icon={icon} size={12} color={color} />
        </div>
      </div>
      <p
        className="mt-2 text-[28px] font-semibold leading-none"
        style={{ color }}
      >
        {value}
      </p>
    </div>
  );
}
