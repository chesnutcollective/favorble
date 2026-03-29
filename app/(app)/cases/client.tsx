"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Search01Icon,
  Cancel01Icon,
  PlusSignIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import {
  createCase,
  bulkChangeCaseStage,
  assignStaffToCase,
} from "@/app/actions/cases";
import { PageHeader } from "@/components/shared/page-header";

type CaseRow = {
  id: string;
  caseNumber: string;
  status: string;
  currentStageId: string;
  stageName: string | null;
  stageCode: string | null;
  stageGroupId: string | null;
  stageGroupName: string | null;
  stageColor: string | null;
  stageGroupColor: string | null;
  ssaOffice: string | null;
  createdAt: string;
  updatedAt: string;
  claimant: { firstName: string; lastName: string } | null;
  assignedStaff: {
    userId: string;
    firstName: string;
    lastName: string;
    role: string;
  }[];
};

type Stage = {
  id: string;
  name: string;
  code: string;
  stageGroupId: string;
  owningTeam: string | null;
  isInitial: boolean;
  isTerminal: boolean;
};

type OrgUser = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  team: string | null;
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

const TEAMS = [
  "intake",
  "filing",
  "medical_records",
  "mail_sorting",
  "case_management",
  "hearings",
  "administration",
] as const;

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (hours < 1) return "< 1h";
  if (hours < 24) return `${hours}h`;
  if (days < 30) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

type SortableColumn = "claimant" | "stage" | "assignedTo" | "updatedAt";

export function CasesListClient({
  cases,
  total,
  page,
  pageSize,
  stages,
  orgUsers,
  initialSearch,
  initialStageId,
  initialTeam,
  initialAssignedTo,
  initialSortBy,
  initialSortDir,
}: {
  cases: CaseRow[];
  total: number;
  page: number;
  pageSize: number;
  stages: Stage[];
  orgUsers: OrgUser[];
  initialSearch: string;
  initialStageId: string;
  initialTeam: string;
  initialAssignedTo: string;
  initialSortBy: string;
  initialSortDir: "asc" | "desc";
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [stageFilter, setStageFilter] = useState(initialStageId);
  const [teamFilter, setTeamFilter] = useState(initialTeam);
  const [assignedToFilter, setAssignedToFilter] = useState(initialAssignedTo);
  const [sortBy, setSortBy] = useState(initialSortBy);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialSortDir);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [bulkStageOpen, setBulkStageOpen] = useState(false);
  const [bulkStageId, setBulkStageId] = useState("");
  const [isPending, startTransition] = useTransition();

  // New case form state
  const [ncFirstName, setNcFirstName] = useState("");
  const [ncLastName, setNcLastName] = useState("");
  const [ncStageId, setNcStageId] = useState("");
  const [ncAttorneyId, setNcAttorneyId] = useState("");

  const totalPages = Math.ceil(total / pageSize);

  const initialStages = stages.filter((s) => s.isInitial);
  const attorneys = orgUsers.filter((u) => u.role === "attorney");

  function applyFilters(overrides?: {
    search?: string;
    stage?: string;
    team?: string;
    assignedTo?: string;
    sortBy?: string;
    sortDir?: string;
    page?: number;
  }) {
    const params = new URLSearchParams();
    const s = overrides?.search ?? search;
    const st = overrides?.stage ?? stageFilter;
    const tm = overrides?.team ?? teamFilter;
    const at = overrides?.assignedTo ?? assignedToFilter;
    const sb = overrides?.sortBy ?? sortBy;
    const sd = overrides?.sortDir ?? sortDir;
    const p = overrides?.page ?? 1;
    if (s) params.set("search", s);
    if (st) params.set("stage", st);
    if (tm) params.set("team", tm);
    if (at) params.set("assignedTo", at);
    if (sb !== "updatedAt") params.set("sortBy", sb);
    if (sd !== "desc") params.set("sortDir", sd);
    if (p > 1) params.set("page", String(p));
    router.push(`/cases?${params.toString()}`);
  }

  function clearFilters() {
    setSearch("");
    setStageFilter("");
    setTeamFilter("");
    setAssignedToFilter("");
    router.push("/cases");
  }

  function handleSort(column: SortableColumn) {
    const newDir = sortBy === column && sortDir === "asc" ? "desc" : "asc";
    setSortBy(column);
    setSortDir(newDir);
    applyFilters({ sortBy: column, sortDir: newDir });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === cases.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(cases.map((c) => c.id)));
    }
  }

  function handleExportCsv() {
    const rows = cases.filter((c) => selectedIds.has(c.id));
    const headers = [
      "Case Number",
      "Claimant",
      "Stage",
      "Assigned To",
      "Last Updated",
    ];
    const csvRows = rows.map((c) => [
      c.caseNumber,
      c.claimant
        ? `${c.claimant.lastName}, ${c.claimant.firstName}`
        : "Unknown",
      c.stageName ?? "",
      c.assignedStaff.map((a) => `${a.firstName} ${a.lastName}`).join("; "),
      c.updatedAt,
    ]);

    const csvContent = [headers, ...csvRows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cases-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleBulkChangeStage() {
    if (!bulkStageId) return;
    const ids = Array.from(selectedIds);
    startTransition(async () => {
      await bulkChangeCaseStage(ids, bulkStageId);
      setSelectedIds(new Set());
      setBulkStageOpen(false);
      setBulkStageId("");
    });
  }

  async function handleCreateCase() {
    if (!ncFirstName || !ncLastName || !ncStageId) return;
    startTransition(async () => {
      const newCase = await createCase({
        firstName: ncFirstName,
        lastName: ncLastName,
        initialStageId: ncStageId,
      });
      if (ncAttorneyId) {
        await assignStaffToCase(newCase.id, ncAttorneyId, "attorney", true);
      }
      setNewCaseOpen(false);
      setNcFirstName("");
      setNcLastName("");
      setNcStageId("");
      setNcAttorneyId("");
    });
  }

  const hasFilters = search || stageFilter || teamFilter || assignedToFilter;

  // Summary stats: count cases per stage group
  const stageGroupCounts = cases.reduce(
    (acc, c) => {
      const group = c.stageGroupName ?? "Unknown";
      acc[group] = (acc[group] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Status counts for closed cases
  const statusCounts = cases.reduce(
    (acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  function SortIcon({ column }: { column: string }) {
    if (sortBy !== column) return null;
    return (
      <HugeiconsIcon
        icon={sortDir === "asc" ? ArrowUp01Icon : ArrowDown01Icon}
        size={12}
        className="ml-1 inline"
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cases"
        description="Browse and manage all cases."
        actions={
          <Dialog open={newCaseOpen} onOpenChange={setNewCaseOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-1" />
                New Case
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Case</DialogTitle>
                <DialogDescription>
                  Enter the claimant details and initial case settings.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="nc-first">First Name</Label>
                    <Input
                      id="nc-first"
                      value={ncFirstName}
                      onChange={(e) => setNcFirstName(e.target.value)}
                      placeholder="First name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nc-last">Last Name</Label>
                    <Input
                      id="nc-last"
                      value={ncLastName}
                      onChange={(e) => setNcLastName(e.target.value)}
                      placeholder="Last name"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Initial Stage</Label>
                  <Select value={ncStageId} onValueChange={setNcStageId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {(initialStages.length > 0 ? initialStages : stages).map(
                        (s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.code} - {s.name}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Assigned Attorney</Label>
                  <Select value={ncAttorneyId} onValueChange={setNcAttorneyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select attorney (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {attorneys.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.firstName} {u.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNewCaseOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateCase}
                  disabled={
                    !ncFirstName || !ncLastName || !ncStageId || isPending
                  }
                >
                  {isPending ? "Creating..." : "Create Case"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Summary Stats */}
      {cases.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-medium text-foreground">
            {total} case{total !== 1 ? "s" : ""}
          </span>
          <span className="text-muted-foreground">·</span>
          {Object.entries(stageGroupCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([group, count]) => {
              const sample = cases.find((c) => c.stageGroupName === group);
              const color = sample?.stageGroupColor ?? undefined;
              return (
                <span key={group} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: color ?? "rgb(156 163 175)" }}
                  />
                  <span
                    style={{ color: color ?? undefined }}
                    className={color ? "font-medium" : "text-muted-foreground"}
                  >
                    {count}
                  </span>
                  <span className="text-muted-foreground">{group}</span>
                </span>
              );
            })}
          {(statusCounts.closed_won ?? 0) > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-emerald-600 font-medium">
                {statusCounts.closed_won} won
              </span>
            </>
          )}
          {(statusCounts.closed_lost ?? 0) > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-red-600 font-medium">
                {statusCounts.closed_lost} lost
              </span>
            </>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            className="absolute left-2.5 top-2.5 text-muted-foreground"
          />
          <Input
            placeholder="Search cases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilters();
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={stageFilter}
          onValueChange={(v) => {
            setStageFilter(v);
            applyFilters({ stage: v });
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Stages" />
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.code} - {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={teamFilter}
          onValueChange={(v) => {
            setTeamFilter(v);
            applyFilters({ team: v });
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Teams" />
          </SelectTrigger>
          <SelectContent>
            {TEAMS.map((t) => (
              <SelectItem key={t} value={t}>
                {TEAM_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={assignedToFilter}
          onValueChange={(v) => {
            setAssignedToFilter(v);
            applyFilters({ assignedTo: v });
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Assigned" />
          </SelectTrigger>
          <SelectContent>
            {orgUsers.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <HugeiconsIcon icon={Cancel01Icon} size={12} className="mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-accent px-4 py-2">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Separator orientation="vertical" className="h-5" />
          <Dialog open={bulkStageOpen} onOpenChange={setBulkStageOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="default">
                Change Stage
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change Stage</DialogTitle>
                <DialogDescription>
                  Move {selectedIds.size} case{selectedIds.size > 1 ? "s" : ""}{" "}
                  to a new stage.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Select value={bulkStageId} onValueChange={setBulkStageId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select new stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.code} - {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setBulkStageOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBulkChangeStage}
                  disabled={!bulkStageId || isPending}
                >
                  {isPending ? "Changing..." : "Change Stage"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button size="sm" variant="outline" onClick={handleExportCsv}>
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    selectedIds.size === cases.length && cases.length > 0
                  }
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("claimant")}
              >
                Claimant
                <SortIcon column="claimant" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("stage")}
              >
                Stage
                <SortIcon column="stage" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("assignedTo")}
              >
                Assigned To
                <SortIcon column="assignedTo" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("updatedAt")}
              >
                Last Activity
                <SortIcon column="updatedAt" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  No cases found.
                </TableCell>
              </TableRow>
            ) : (
              cases.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={() => toggleSelect(c.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Link href={`/cases/${c.id}`} className="block">
                      <p className="font-medium text-foreground">
                        {c.claimant
                          ? `${c.claimant.lastName}, ${c.claimant.firstName}`
                          : "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.caseNumber}
                      </p>
                    </Link>
                  </TableCell>
                  <TableCell>
                    {c.stageName && (
                      <Badge
                        variant="outline"
                        style={{
                          borderColor:
                            c.stageColor ?? c.stageGroupColor ?? undefined,
                          color: c.stageColor ?? c.stageGroupColor ?? undefined,
                        }}
                      >
                        {c.stageName}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.assignedStaff.length > 0 ? (
                      <span className="text-sm text-foreground">
                        {c.assignedStaff
                          .map((a) => `${a.firstName} ${a.lastName[0]}.`)
                          .join(", ")}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Unassigned
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatRelativeTime(c.updatedAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} total case{total !== 1 ? "s" : ""}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => applyFilters({ page: page - 1 })}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => applyFilters({ page: page + 1 })}
            >
              <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
