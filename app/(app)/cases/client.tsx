"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Search01Icon,
  Cancel01Icon,
  PlusSignIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowDown02Icon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import {
  createCase,
  bulkChangeCaseStage,
  bulkAssignCases,
  assignStaffToCase,
} from "@/app/actions/cases";
import { PageHeader } from "@/components/shared/page-header";
import {
  ColumnVisibilityMenu,
  type ColumnDef,
} from "@/components/ui/column-visibility-menu";

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
  atRisk?: boolean;
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
  initialAction,
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
  initialAction?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [stageFilter, setStageFilter] = useState(initialStageId);
  const [teamFilter, setTeamFilter] = useState(initialTeam);
  const [assignedToFilter, setAssignedToFilter] = useState(initialAssignedTo);
  const [sortBy, setSortBy] = useState(initialSortBy);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialSortDir);

  // Sync when URL searchParams change (e.g., sidebar panel navigation)
  useEffect(() => {
    setStageFilter(initialStageId);
  }, [initialStageId]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newCaseOpen, setNewCaseOpen] = useState(false);

  // Auto-open create dialog when navigating with ?action=new
  useEffect(() => {
    if (initialAction === "new") {
      setNewCaseOpen(true);
    }
  }, [initialAction]);

  const [bulkStageOpen, setBulkStageOpen] = useState(false);
  const [bulkStageId, setBulkStageId] = useState("");
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAssignUserId, setBulkAssignUserId] = useState("");
  const [bulkHoldOpen, setBulkHoldOpen] = useState(false);
  const [bulkHoldReason, setBulkHoldReason] = useState("");
  const [isPending, startTransition] = useTransition();

  // Column visibility — the menu persists its own selection to localStorage.
  // Keys mirror the table's TableHead/Cell pairs below. `select` is always
  // visible (row checkbox column).
  const columnDefs: ColumnDef[] = useMemo(
    () => [
      { key: "select", label: "Select", alwaysVisible: true },
      { key: "claimant", label: "Claimant", defaultVisible: true },
      { key: "stage", label: "Stage", defaultVisible: true },
      { key: "assignedTo", label: "Assigned To", defaultVisible: true },
      { key: "updatedAt", label: "Last Activity", defaultVisible: true },
    ],
    [],
  );
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => new Set(columnDefs.map((c) => c.key)),
  );
  const isCol = (key: string) => visibleColumns.has(key);

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

  function handleBulkAssign() {
    if (!bulkAssignUserId) return;
    const ids = Array.from(selectedIds);
    startTransition(async () => {
      try {
        await bulkAssignCases(ids, bulkAssignUserId);
        toast.success(
          `Assigned ${ids.length} case${ids.length > 1 ? "s" : ""}`,
        );
        setSelectedIds(new Set());
        setBulkAssignOpen(false);
        setBulkAssignUserId("");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to assign cases",
        );
      }
    });
  }

  async function handleBulkPlaceOnHold() {
    // Server action for bulk-place-on-hold isn't wired yet. Per spec, fall
    // back to copying the selected IDs to the clipboard and surfacing a toast
    // so the user can follow up manually.
    const ids = Array.from(selectedIds);
    try {
      await navigator.clipboard.writeText(ids.join("\n"));
      toast.info(
        "Action coming — selected case IDs copied to clipboard",
        bulkHoldReason
          ? { description: `Reason noted: ${bulkHoldReason}` }
          : undefined,
      );
    } catch {
      toast.info("Action coming — bulk hold is not yet wired up");
    }
    setBulkHoldOpen(false);
    setBulkHoldReason("");
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-sm">
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
          <SelectTrigger className="w-full sm:w-[200px]">
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
          <SelectTrigger className="w-full sm:w-[180px]">
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
          <SelectTrigger className="w-full sm:w-[200px]">
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
        <div className="sm:ml-auto">
          <ColumnVisibilityMenu
            storageKey="favorble.cases.visibleColumns.v1"
            columns={columnDefs}
            onChange={setVisibleColumns}
          />
        </div>
      </div>

      {/* Bulk Actions Bar — consolidated dropdown */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-accent px-4 py-2">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Separator orientation="vertical" className="h-5" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="default">
                Bulk actions ({selectedIds.size})
                <HugeiconsIcon
                  icon={ArrowDown02Icon}
                  size={12}
                  className="ml-1.5"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuItem onSelect={() => setBulkStageOpen(true)}>
                Change stage…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setBulkAssignOpen(true)}>
                Assign to…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExportCsv()}>
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setBulkHoldOpen(true)}>
                Place on hold…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </Button>

          {/* Change Stage dialog */}
          <Dialog open={bulkStageOpen} onOpenChange={setBulkStageOpen}>
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

          {/* Assign To dialog */}
          <Dialog open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign Cases</DialogTitle>
                <DialogDescription>
                  Assign {selectedIds.size} case
                  {selectedIds.size > 1 ? "s" : ""} to a team member. They will
                  become the primary attorney.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Select
                  value={bulkAssignUserId}
                  onValueChange={setBulkAssignUserId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                        {u.role ? ` (${u.role})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setBulkAssignOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBulkAssign}
                  disabled={!bulkAssignUserId || isPending}
                >
                  {isPending ? "Assigning..." : "Assign"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Place on Hold dialog */}
          <Dialog open={bulkHoldOpen} onOpenChange={setBulkHoldOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Place on Hold</DialogTitle>
                <DialogDescription>
                  Optionally record a reason. Hold wiring is still in progress —
                  we&apos;ll copy the selected case IDs to your clipboard so you
                  can follow up manually.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-1.5">
                <Label htmlFor="hold-reason">Hold reason (optional)</Label>
                <Textarea
                  id="hold-reason"
                  value={bulkHoldReason}
                  onChange={(e) => setBulkHoldReason(e.target.value)}
                  placeholder="e.g. Awaiting medical records"
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setBulkHoldOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleBulkPlaceOnHold} disabled={isPending}>
                  Place on Hold
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
              {isCol("claimant") && (
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort("claimant")}
                >
                  Claimant
                  <SortIcon column="claimant" />
                </TableHead>
              )}
              {isCol("stage") && (
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort("stage")}
                >
                  Stage
                  <SortIcon column="stage" />
                </TableHead>
              )}
              {isCol("assignedTo") && (
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort("assignedTo")}
                >
                  Assigned To
                  <SortIcon column="assignedTo" />
                </TableHead>
              )}
              {isCol("updatedAt") && (
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort("updatedAt")}
                >
                  Last Activity
                  <SortIcon column="updatedAt" />
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={Math.max(visibleColumns.size, 1)}
                  className="h-24 text-center text-muted-foreground"
                >
                  No cases found.
                </TableCell>
              </TableRow>
            ) : (
              cases.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-[#FAFAFA] transition-colors duration-200"
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={() => toggleSelect(c.id)}
                    />
                  </TableCell>
                  {isCol("claimant") && (
                    <TableCell>
                      <Link href={`/cases/${c.id}`} className="block">
                        <p className="font-medium text-foreground">
                          {c.claimant
                            ? `${c.claimant.lastName}, ${c.claimant.firstName}`
                            : "Unknown"}
                        </p>
                        <p className="text-[12px] text-[#999] font-mono flex items-center gap-2">
                          {c.caseNumber}
                          {c.atRisk && (
                            <span className="inline-flex items-center rounded-full bg-[rgba(209,69,59,0.10)] px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-[#d1453b]">
                              At risk
                            </span>
                          )}
                        </p>
                      </Link>
                    </TableCell>
                  )}
                  {isCol("stage") && (
                    <TableCell>
                      {c.stageName && (
                        <span className="inline-flex items-center gap-[6px] text-[13px]">
                          <span
                            className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                c.stageColor ?? c.stageGroupColor ?? "#888",
                            }}
                          />
                          {c.stageName}
                        </span>
                      )}
                    </TableCell>
                  )}
                  {isCol("assignedTo") && (
                    <TableCell>
                      {c.assignedStaff.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#EAEAEA] text-[9px] font-semibold text-[#171717]">
                            {c.assignedStaff[0].firstName.charAt(0)}
                            {c.assignedStaff[0].lastName.charAt(0)}
                          </span>
                          <span className="text-[13px] text-foreground">
                            {c.assignedStaff[0].firstName.charAt(0)}.{" "}
                            {c.assignedStaff[0].lastName}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[13px] text-muted-foreground">
                          Unassigned
                        </span>
                      )}
                    </TableCell>
                  )}
                  {isCol("updatedAt") && (
                    <TableCell className="text-[12px] text-[#666] font-mono">
                      {formatRelativeTime(c.updatedAt)}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[#666]">
          {total} total case{total !== 1 ? "s" : ""}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => applyFilters({ page: page - 1 })}
              className="text-[13px]"
            >
              &larr; Previous
            </Button>
            <span className="text-[13px] text-[#666]">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => applyFilters({ page: page + 1 })}
              className="text-[13px]"
            >
              Next &rarr;
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
