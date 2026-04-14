"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  listSavedViews,
  type SavedView,
} from "@/app/actions/cases";
import { PageHeader } from "@/components/shared/page-header";
import {
  SavedViewsMenu,
  type ViewDescriptor,
} from "@/components/cases/saved-views-menu";

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

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
];

const URGENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const SEEDED_VIEWS = [
  { id: "my-cases", name: "My cases" },
  { id: "on-hold", name: "On hold" },
  { id: "closed-this-month", name: "Closed this month" },
];

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
  practiceAreas,
  savedViews: initialSavedViews,
  initialSearch,
  initialStageId,
  initialTeam,
  initialAssignedTo,
  initialPractice,
  initialLanguage,
  initialUnread,
  initialUrgency,
  initialView,
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
  practiceAreas: string[];
  savedViews: SavedView[];
  initialSearch: string;
  initialStageId: string;
  initialTeam: string;
  initialAssignedTo: string;
  initialPractice: string;
  initialLanguage: string;
  initialUnread: boolean;
  initialUrgency: string;
  initialView: string;
  initialSortBy: string;
  initialSortDir: "asc" | "desc";
  initialAction?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [stageFilter, setStageFilter] = useState(initialStageId);
  const [teamFilter, setTeamFilter] = useState(initialTeam);
  const [assignedToFilter, setAssignedToFilter] = useState(initialAssignedTo);
  const [practiceFilter, setPracticeFilter] = useState(initialPractice);
  const [languageFilter, setLanguageFilter] = useState(initialLanguage);
  const [unreadFilter, setUnreadFilter] = useState(initialUnread);
  const [urgencyFilter, setUrgencyFilter] = useState(initialUrgency);
  const [view, setView] = useState(initialView);
  const [sortBy, setSortBy] = useState(initialSortBy);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialSortDir);
  const [savedViews, setSavedViews] = useState<SavedView[]>(initialSavedViews);

  // Sync when URL searchParams change (e.g., sidebar panel navigation)
  useEffect(() => {
    setStageFilter(initialStageId);
  }, [initialStageId]);

  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    setTeamFilter(initialTeam);
  }, [initialTeam]);

  useEffect(() => {
    setAssignedToFilter(initialAssignedTo);
  }, [initialAssignedTo]);

  useEffect(() => {
    setPracticeFilter(initialPractice);
  }, [initialPractice]);

  useEffect(() => {
    setLanguageFilter(initialLanguage);
  }, [initialLanguage]);

  useEffect(() => {
    setUnreadFilter(initialUnread);
  }, [initialUnread]);

  useEffect(() => {
    setUrgencyFilter(initialUrgency);
  }, [initialUrgency]);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    setSavedViews(initialSavedViews);
  }, [initialSavedViews]);

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
  const [isPending, startTransition] = useTransition();

  // New case form state
  const [ncFirstName, setNcFirstName] = useState("");
  const [ncLastName, setNcLastName] = useState("");
  const [ncStageId, setNcStageId] = useState("");
  const [ncAttorneyId, setNcAttorneyId] = useState("");

  const totalPages = Math.ceil(total / pageSize);

  const initialStages = stages.filter((s) => s.isInitial);
  const attorneys = orgUsers.filter((u) => u.role === "attorney");

  type FilterOverrides = {
    search?: string;
    stage?: string;
    team?: string;
    assignedTo?: string;
    practice?: string;
    language?: string;
    unread?: boolean;
    urgency?: string;
    view?: string;
    sortBy?: string;
    sortDir?: string;
    page?: number;
  };

  const buildParams = useCallback(
    (overrides?: FilterOverrides) => {
      const params = new URLSearchParams();
      const s = overrides?.search ?? search;
      const st = overrides?.stage ?? stageFilter;
      const tm = overrides?.team ?? teamFilter;
      const at = overrides?.assignedTo ?? assignedToFilter;
      const pr = overrides?.practice ?? practiceFilter;
      const lg = overrides?.language ?? languageFilter;
      const un =
        overrides?.unread !== undefined ? overrides.unread : unreadFilter;
      const ur = overrides?.urgency ?? urgencyFilter;
      const vw = overrides?.view ?? view;
      const sb = overrides?.sortBy ?? sortBy;
      const sd = overrides?.sortDir ?? sortDir;
      const p = overrides?.page ?? 1;
      if (s) params.set("search", s);
      if (st) params.set("stage", st);
      if (tm) params.set("team", tm);
      if (at) params.set("assignedTo", at);
      if (pr) params.set("practice", pr);
      if (lg) params.set("language", lg);
      if (un) params.set("unread", "1");
      if (ur) params.set("urgency", ur);
      if (vw) params.set("view", vw);
      if (sb !== "updatedAt") params.set("sortBy", sb);
      if (sd !== "desc") params.set("sortDir", sd);
      if (p > 1) params.set("page", String(p));
      return params;
    },
    [
      search,
      stageFilter,
      teamFilter,
      assignedToFilter,
      practiceFilter,
      languageFilter,
      unreadFilter,
      urgencyFilter,
      view,
      sortBy,
      sortDir,
    ],
  );

  function applyFilters(overrides?: FilterOverrides) {
    const params = buildParams(overrides);
    router.push(`/cases?${params.toString()}`);
  }

  function clearFilters() {
    setSearch("");
    setStageFilter("");
    setTeamFilter("");
    setAssignedToFilter("");
    setPracticeFilter("");
    setLanguageFilter("");
    setUnreadFilter(false);
    setUrgencyFilter("");
    setView("");
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

  const hasFilters =
    search ||
    stageFilter ||
    teamFilter ||
    assignedToFilter ||
    practiceFilter ||
    languageFilter ||
    unreadFilter ||
    urgencyFilter ||
    view;

  // Snapshot of the current filter state for saved-views
  const currentFilters = {
    search,
    stage: stageFilter,
    team: teamFilter,
    assignedTo: assignedToFilter,
    practice: practiceFilter,
    language: languageFilter,
    unread: unreadFilter,
    urgency: urgencyFilter,
    page: 1,
  };
  const currentSort = { sortBy, sortDir };

  function handleViewSelect(descriptor: ViewDescriptor) {
    if (descriptor.kind === "seeded") {
      const params = new URLSearchParams();
      params.set("view", descriptor.id);
      router.replace(`/cases?${params.toString()}`);
      return;
    }
    const f = descriptor.view.filters as Record<string, unknown>;
    const s = descriptor.view.sort as {
      sortBy?: string;
      sortDir?: "asc" | "desc";
    };
    const params = new URLSearchParams();
    const asStr = (v: unknown) => (typeof v === "string" && v ? v : "");
    const asBool = (v: unknown) => v === true || v === "1" || v === "true";
    const setIf = (k: string, v: string) => {
      if (v) params.set(k, v);
    };
    setIf("search", asStr(f.search));
    setIf("stage", asStr(f.stage));
    setIf("team", asStr(f.team));
    setIf("assignedTo", asStr(f.assignedTo));
    setIf("practice", asStr(f.practice));
    setIf("language", asStr(f.language));
    if (asBool(f.unread)) params.set("unread", "1");
    setIf("urgency", asStr(f.urgency));
    if (s?.sortBy && s.sortBy !== "updatedAt") params.set("sortBy", s.sortBy);
    if (s?.sortDir && s.sortDir !== "desc") params.set("sortDir", s.sortDir);
    const p =
      typeof f.page === "number" && f.page > 1
        ? String(f.page)
        : typeof f.page === "string" && Number(f.page) > 1
          ? String(f.page)
          : "";
    if (p) params.set("page", p);
    router.replace(`/cases?${params.toString()}`);
  }

  async function refreshSavedViews() {
    try {
      const fresh = await listSavedViews();
      setSavedViews(fresh);
    } catch {
      // ignore
    }
  }

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
        <SavedViewsMenu
          seededViews={SEEDED_VIEWS}
          savedViews={savedViews}
          activeViewId={view || null}
          currentFilters={currentFilters}
          currentSort={currentSort}
          onSelect={handleViewSelect}
          onRefresh={refreshSavedViews}
        />
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-sm">
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            className="absolute left-2.5 top-2.5 text-muted-foreground"
          />
          <Input
            placeholder="Search name, phone, case #..."
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
        {practiceAreas.length > 0 && (
          <Select
            value={practiceFilter}
            onValueChange={(v) => {
              setPracticeFilter(v);
              applyFilters({ practice: v });
            }}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="All Practice Areas" />
            </SelectTrigger>
            <SelectContent>
              {practiceAreas.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select
          value={languageFilter}
          onValueChange={(v) => {
            setLanguageFilter(v);
            applyFilters({ language: v });
          }}
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="All Languages" />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={urgencyFilter}
          onValueChange={(v) => {
            setUrgencyFilter(v);
            applyFilters({ urgency: v });
          }}
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="All Urgencies" />
          </SelectTrigger>
          <SelectContent>
            {URGENCY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="inline-flex items-center gap-2 px-2 text-sm">
          <Checkbox
            checked={unreadFilter}
            onCheckedChange={(v) => {
              const next = v === true;
              setUnreadFilter(next);
              applyFilters({ unread: next });
            }}
          />
          Unread messages only
        </label>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <HugeiconsIcon icon={Cancel01Icon} size={12} className="mr-1" />
            Clear all filters
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
                  className="cursor-pointer hover:bg-[#FAFAFA] transition-colors duration-200"
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
                      <p className="text-[12px] text-[#999] font-mono">
                        {c.caseNumber}
                      </p>
                    </Link>
                  </TableCell>
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
                  <TableCell className="text-[12px] text-[#666] font-mono">
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
