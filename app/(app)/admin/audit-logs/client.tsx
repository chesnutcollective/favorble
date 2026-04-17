"use client";

import { Fragment, useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  FilterIcon,
  Download01Icon,
  Search01Icon,
  ArrowDown01Icon,
  SecurityCheckIcon,
} from "@hugeicons/core-free-icons";
import {
  exportAuditLogsCsv,
  type AuditLogEntry,
  type AuditLogStats,
  type AuditLogUser,
  type AuditLogFilters,
} from "@/app/actions/audit-logs";

const BRAND = "#263c94";
const INFO = "#1d72b8";
const WARNING = "#cf8a00";
const ERROR_COLOR = "#d1453b";
const SURFACE = "#F8F9FC";
const TINT = "rgba(38,60,148,0.08)";

const ALL_USERS = "__all_users__";

const ENTITY_TYPES = [
  { value: "all", label: "All entities" },
  { value: "case", label: "Case" },
  { value: "contact", label: "Contact" },
  { value: "lead", label: "Lead" },
  { value: "task", label: "Task" },
  { value: "document", label: "Document" },
  { value: "user", label: "User" },
  { value: "settings", label: "Settings" },
  { value: "system", label: "System" },
] as const;

const DATE_RANGES = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
] as const;

const SEVERITIES = [
  { value: "all", label: "All severities" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
] as const;

type Severity = "info" | "warning" | "error" | "neutral";

function severityForAction(action: string): Severity {
  const lower = action.toLowerCase();
  if (/(delete|remove|destroy|revoke|purge)/.test(lower)) return "error";
  if (/(create|insert|add|invite|grant)/.test(lower)) return "info";
  if (/(update|change|modify|edit|patch|set|toggle)/.test(lower))
    return "warning";
  return "neutral";
}

function severityColor(sev: Severity): string {
  switch (sev) {
    case "error":
      return ERROR_COLOR;
    case "warning":
      return WARNING;
    case "info":
      return INFO;
    default:
      return "#666";
  }
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.floor(day / 7)}w ago`;
  if (day < 365) return `${Math.floor(day / 30)}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getSeverityFromMetadata(
  metadata: Record<string, unknown> | null,
): Severity | null {
  if (!metadata || typeof metadata !== "object") return null;
  const sev = metadata.severity;
  if (sev === "info" || sev === "warning" || sev === "error") return sev;
  return null;
}

function initialsFor(firstName: string, lastName: string): string {
  const f = firstName?.[0] ?? "";
  const l = lastName?.[0] ?? "";
  return (f + l).toUpperCase() || "?";
}

type Filters = {
  userId: string;
  entityType: string;
  action: string;
  range: string;
  startDate: string;
  endDate: string;
  severity: string;
};

type Props = {
  initialLogs: AuditLogEntry[];
  totalCount: number;
  hasMore: boolean;
  stats: AuditLogStats;
  users: AuditLogUser[];
  initialFilters: Filters;
  currentPage: number;
  pageSize: number;
};

export function AuditLogsClient({
  initialLogs,
  totalCount,
  hasMore,
  stats,
  users: usersList,
  initialFilters,
  currentPage,
  pageSize,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [filters, setFilters] = useState<Filters>(initialFilters);

  const visibleLogs = useMemo(() => {
    if (filters.severity === "all") return initialLogs;
    return initialLogs.filter((log) => {
      const metaSev = getSeverityFromMetadata(log.metadata);
      if (metaSev) return metaSev === filters.severity;
      const actionSev = severityForAction(log.action);
      if (actionSev === "neutral") return false;
      return actionSev === filters.severity;
    });
  }, [initialLogs, filters.severity]);

  const updateUrl = useCallback(
    (next: Filters, page = 1) => {
      const sp = new URLSearchParams();
      if (next.userId) sp.set("userId", next.userId);
      if (next.entityType && next.entityType !== "all")
        sp.set("entityType", next.entityType);
      if (next.action) sp.set("action", next.action);
      if (next.range && next.range !== "7d") sp.set("range", next.range);
      if (next.range === "custom") {
        if (next.startDate) sp.set("startDate", next.startDate);
        if (next.endDate) sp.set("endDate", next.endDate);
      }
      if (next.severity && next.severity !== "all")
        sp.set("severity", next.severity);
      if (page > 1) sp.set("page", String(page));
      const qs = sp.toString();
      startTransition(() => {
        router.push(qs ? `/admin/audit-logs?${qs}` : "/admin/audit-logs");
      });
    },
    [router],
  );

  const onFilterChange = useCallback(
    (patch: Partial<Filters>) => {
      const next = { ...filters, ...patch };
      setFilters(next);
      // Severity is filtered client-side; others go through URL.
      if (Object.keys(patch).length === 1 && "severity" in patch) {
        const sp = new URLSearchParams(searchParams.toString());
        if (next.severity && next.severity !== "all") {
          sp.set("severity", next.severity);
        } else {
          sp.delete("severity");
        }
        const qs = sp.toString();
        router.replace(qs ? `/admin/audit-logs?${qs}` : "/admin/audit-logs", {
          scroll: false,
        });
        return;
      }
      updateUrl(next, 1);
    },
    [filters, updateUrl, router, searchParams],
  );

  const resetFilters = useCallback(() => {
    const next: Filters = {
      userId: "",
      entityType: "all",
      action: "",
      range: "7d",
      startDate: "",
      endDate: "",
      severity: "all",
    };
    setFilters(next);
    updateUrl(next, 1);
  }, [updateUrl]);

  const goToPage = useCallback(
    (page: number) => {
      updateUrl(filters, page);
    },
    [filters, updateUrl],
  );

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const csv = await exportAuditLogsCsv(filtersToActionFilters(filters));
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.download = `audit-logs-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const peakHourLabel = `${String(stats.peakHour).padStart(2, "0")}:00`;

  return (
    <div
      className="space-y-6"
      style={{ backgroundColor: SURFACE, minHeight: "100%" }}
    >
      <PageHeader
        title="Audit Logs"
        description="Search and review PHI access and system activity across the organization."
        actions={
          <Button
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            style={{ backgroundColor: BRAND }}
            className="text-white hover:opacity-90"
          >
            <HugeiconsIcon icon={Download01Icon} size={16} className="mr-1.5" aria-hidden="true" />
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>
        }
      />

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total entries (30d)"
          value={stats.totalEntries.toLocaleString()}
          subtitle={`Peak hour: ${peakHourLabel}`}
        />
        <StatsCard
          title="Entries today"
          value={stats.entriesToday.toLocaleString()}
        />
        <StatsCard
          title="Most active user"
          value={stats.mostActiveUser?.name ?? "--"}
          subtitle={
            stats.mostActiveUser
              ? `${stats.mostActiveUser.count.toLocaleString()} actions`
              : undefined
          }
        />
        <StatsCard
          title="Most active entity"
          value={stats.mostActiveEntityType?.entityType ?? "--"}
          subtitle={
            stats.mostActiveEntityType
              ? `${stats.mostActiveEntityType.count.toLocaleString()} events`
              : undefined
          }
        />
      </div>

      {/* Filter bar */}
      <Card
        style={{ borderRadius: 10, backgroundColor: "#FFFFFF" }}
        className="overflow-hidden"
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={FilterIcon} size={16} color={BRAND} aria-hidden="true" />
            <span
              className="text-[13px] font-semibold"
              style={{ color: BRAND }}
            >
              Filters
            </span>
            <span className="text-[12px] text-[#666] ml-auto">
              {totalCount.toLocaleString()} matching entries
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            {/* User */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#666] uppercase tracking-wide">
                User
              </label>
              <Select
                value={filters.userId || ALL_USERS}
                onValueChange={(v) =>
                  onFilterChange({ userId: v === ALL_USERS ? "" : v })
                }
              >
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_USERS}>All users</SelectItem>
                  {usersList.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Entity type */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#666] uppercase tracking-wide">
                Entity type
              </label>
              <Select
                value={filters.entityType}
                onValueChange={(v) => onFilterChange({ entityType: v })}
              >
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#666] uppercase tracking-wide">
                Action
              </label>
              <div className="relative">
                <HugeiconsIcon
                  icon={Search01Icon}
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#999]"
                  aria-hidden="true"
                />
                <Input
                  value={filters.action}
                  placeholder="e.g. update"
                  className="h-9 pl-8 text-[13px]"
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, action: e.target.value }))
                  }
                  onBlur={() =>
                    filters.action !== initialFilters.action &&
                    updateUrl(filters, 1)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      updateUrl(filters, 1);
                    }
                  }}
                />
              </div>
            </div>

            {/* Date range */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#666] uppercase tracking-wide">
                Date range
              </label>
              <Select
                value={filters.range}
                onValueChange={(v) => onFilterChange({ range: v })}
              >
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_RANGES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Severity */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#666] uppercase tracking-wide">
                Severity
              </label>
              <Select
                value={filters.severity}
                onValueChange={(v) => onFilterChange({ severity: v })}
              >
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reset */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-transparent uppercase tracking-wide select-none">
                .
              </label>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full text-[13px]"
                onClick={resetFilters}
                disabled={isPending}
              >
                Reset filters
              </Button>
            </div>
          </div>

          {filters.range === "custom" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[#666] uppercase tracking-wide">
                  Start date
                </label>
                <Input
                  type="datetime-local"
                  value={filters.startDate.slice(0, 16)}
                  className="h-9 text-[13px]"
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      startDate: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : "",
                    }))
                  }
                  onBlur={() => updateUrl(filters, 1)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[#666] uppercase tracking-wide">
                  End date
                </label>
                <Input
                  type="datetime-local"
                  value={filters.endDate.slice(0, 16)}
                  className="h-9 text-[13px]"
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      endDate: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : "",
                    }))
                  }
                  onBlur={() => updateUrl(filters, 1)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 10, backgroundColor: "#FFFFFF" }}>
        <CardContent className="p-0">
          {visibleLogs.length === 0 ? (
            <div className="py-16 text-center">
              <div
                className="inline-flex items-center justify-center h-12 w-12 rounded-full mb-3"
                style={{ backgroundColor: TINT }}
              >
                <HugeiconsIcon
                  icon={SecurityCheckIcon}
                  size={22}
                  color={BRAND}
                  aria-hidden="true"
                />
              </div>
              <p className="text-[14px] font-medium">
                No audit entries match these filters
              </p>
              <p className="text-[12px] text-[#666] mt-1">
                Try widening the date range or clearing filters.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[170px]">Timestamp</TableHead>
                  <TableHead className="w-[200px]">User</TableHead>
                  <TableHead className="w-[180px]">Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead className="w-[140px]">IP Address</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleLogs.map((log) => {
                  const sev =
                    getSeverityFromMetadata(log.metadata) ??
                    severityForAction(log.action);
                  const sevColor = severityColor(sev);
                  const isExpanded = expandedId === log.id;
                  return (
                    <Fragment key={log.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-[#FAFAFA] transition-colors duration-200"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : log.id)
                        }
                      >
                        <TableCell className="align-top">
                          <span
                            title={formatAbsolute(log.createdAt)}
                            className="text-[13px]"
                          >
                            {formatRelative(log.createdAt)}
                          </span>
                          <div className="text-[11px] text-[#999] mt-0.5">
                            {new Date(log.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          {log.user ? (
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                {log.user.avatarUrl && (
                                  <AvatarImage
                                    src={log.user.avatarUrl}
                                    alt=""
                                  />
                                )}
                                <AvatarFallback className="text-[10px] font-semibold">
                                  {initialsFor(
                                    log.user.firstName,
                                    log.user.lastName,
                                  )}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="text-[13px] truncate">
                                  {log.user.firstName} {log.user.lastName}
                                </div>
                                <div className="text-[11px] text-[#999] truncate">
                                  {log.user.email}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[13px] text-[#999] italic">
                              System
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge
                            variant="outline"
                            style={{
                              borderColor: sevColor,
                              color: sevColor,
                              backgroundColor: `${sevColor}14`,
                            }}
                            className="font-mono text-[11px]"
                          >
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="text-[13px]">{log.entityType}</div>
                          <div className="text-[11px] text-[#999] font-mono truncate max-w-[240px]">
                            {log.entityId}
                          </div>
                        </TableCell>
                        <TableCell className="align-top font-mono text-[12px] text-[#666]">
                          {log.ipAddress ?? "--"}
                        </TableCell>
                        <TableCell className="align-top">
                          <HugeiconsIcon
                            icon={ArrowDown01Icon}
                            size={16}
                            className={`transition-transform text-[#999] ${isExpanded ? "rotate-180" : ""}`}
                            aria-hidden="true"
                          />
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="hover:bg-[#F0F0F0] transition-colors duration-200">
                          <TableCell
                            colSpan={6}
                            className="p-4"
                            style={{ backgroundColor: TINT }}
                          >
                            <ExpandedRow log={log} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-[12px] text-[#666]">
            Showing{" "}
            <span className="font-mono font-medium text-[#333]">
              {(currentPage - 1) * pageSize + 1}
            </span>
            {" - "}
            <span className="font-mono font-medium text-[#333]">
              {Math.min(currentPage * pageSize, totalCount)}
            </span>{" "}
            of{" "}
            <span className="font-mono font-medium text-[#333]">
              {totalCount.toLocaleString()}
            </span>{" "}
            entries
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-[13px]"
              disabled={currentPage <= 1 || isPending}
              onClick={() => goToPage(currentPage - 1)}
            >
              &larr; Previous
            </Button>
            <span className="text-[12px] text-[#666] font-mono">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="text-[13px]"
              disabled={!hasMore || isPending}
              onClick={() => goToPage(currentPage + 1)}
            >
              Next &rarr;
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function filtersToActionFilters(filters: Filters): AuditLogFilters {
  let startDate: string | undefined;
  let endDate: string | undefined;

  if (filters.range === "custom") {
    startDate = filters.startDate || undefined;
    endDate = filters.endDate || undefined;
  } else if (filters.range !== "all") {
    const now = new Date();
    endDate = now.toISOString();
    const ms: Record<string, number> = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };
    const delta = ms[filters.range] ?? ms["7d"];
    startDate = new Date(now.getTime() - delta).toISOString();
  }

  return {
    userId: filters.userId || undefined,
    entityType:
      filters.entityType && filters.entityType !== "all"
        ? filters.entityType
        : undefined,
    actionPattern: filters.action || undefined,
    startDate,
    endDate,
    pageSize: 10000,
    page: 1,
  };
}

function ExpandedRow({ log }: { log: AuditLogEntry }) {
  const changes = log.changes ?? {};
  const metadata = log.metadata ?? {};
  const hasBeforeAfter =
    changes &&
    typeof changes === "object" &&
    "before" in changes &&
    "after" in changes;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
        <Field label="Audit ID" mono value={log.id} />
        <Field label="Timestamp" value={formatAbsolute(log.createdAt)} />
        <Field label="Entity ID" mono value={log.entityId} />
        <Field label="IP Address" mono value={log.ipAddress ?? "--"} />
      </div>

      {hasBeforeAfter ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <JsonBlock
            title="Before"
            value={(changes as { before: unknown }).before}
            accent={ERROR_COLOR}
          />
          <JsonBlock
            title="After"
            value={(changes as { after: unknown }).after}
            accent={INFO}
          />
        </div>
      ) : (
        <JsonBlock title="Changes" value={changes} />
      )}

      <JsonBlock title="Metadata" value={metadata} />
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[#666] font-medium">
        {label}
      </div>
      <div
        className={`text-[12px] text-[#333] ${mono ? "font-mono" : ""} break-all`}
      >
        {value}
      </div>
    </div>
  );
}

function JsonBlock({
  title,
  value,
  accent,
}: {
  title: string;
  value: unknown;
  accent?: string;
}) {
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === "object" &&
      value !== null &&
      Object.keys(value as Record<string, unknown>).length === 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: accent ?? BRAND }}
        >
          {title}
        </span>
      </div>
      <pre
        className="text-[11px] font-mono bg-white border border-[#EAEAEA] rounded-md p-3 overflow-auto max-h-64 whitespace-pre-wrap break-words"
        style={{ borderRadius: 8 }}
      >
        {isEmpty ? (
          <span className="text-[#999] italic">empty</span>
        ) : (
          formatted
        )}
      </pre>
    </div>
  );
}
