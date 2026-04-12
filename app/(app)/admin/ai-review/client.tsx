"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  FilterIcon,
  AiMagicIcon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  Edit02Icon,
  SparklesIcon,
  ArrowDown01Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import {
  approveExtraction,
  rejectExtraction,
  editExtraction,
  bulkApprove,
  bulkReject,
  type AiReviewEntry,
  type AiReviewStats,
} from "@/app/actions/ai-review";

const BRAND = "#263c94";
const INFO = "#1d72b8";
const SURFACE = "#F8F9FC";
const TINT = "rgba(38,60,148,0.08)";
const WARNING = "#cf8a00";
const DANGER = "#d1453b";
const SUCCESS = "#1d8a4b";

const CONFIDENCE_OPTIONS = [
  { value: "all", label: "All confidence" },
  { value: "high", label: "High (>80%)" },
  { value: "medium", label: "Medium (60-80%)" },
  { value: "low", label: "Low (<60%)" },
] as const;

const TABS: Array<{ value: string; label: string }> = [
  { value: "pending", label: "Pending Review" },
  { value: "verified", label: "Recently Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

type Filters = {
  tab: string;
  confidence: string;
  documentType: string;
};

type Props = {
  initialEntries: AiReviewEntry[];
  totalCount: number;
  hasMore: boolean;
  stats: AiReviewStats;
  documentTypes: string[];
  initialFilters: Filters;
  currentPage: number;
  pageSize: number;
};

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function confidenceBadge(confidence: number | null) {
  if (confidence == null) {
    return { label: "N/A", color: "#888" };
  }
  if (confidence >= 81) return { label: `${confidence}%`, color: SUCCESS };
  if (confidence >= 60) return { label: `${confidence}%`, color: WARNING };
  return { label: `${confidence}%`, color: DANGER };
}

export function AiReviewClient({
  initialEntries,
  totalCount,
  hasMore,
  stats,
  documentTypes,
  initialFilters,
  currentPage,
  pageSize,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    summary: string;
    details: string;
    providerName: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");

  const updateUrl = useCallback(
    (next: Filters, page = 1) => {
      const sp = new URLSearchParams();
      if (next.tab && next.tab !== "pending") sp.set("tab", next.tab);
      if (next.confidence && next.confidence !== "all")
        sp.set("confidence", next.confidence);
      if (next.documentType && next.documentType !== "all")
        sp.set("documentType", next.documentType);
      if (page > 1) sp.set("page", String(page));
      const qs = sp.toString();
      startTransition(() => {
        router.push(qs ? `/admin/ai-review?${qs}` : "/admin/ai-review");
      });
    },
    [router],
  );

  const onFilterChange = useCallback(
    (patch: Partial<Filters>) => {
      const next = { ...filters, ...patch };
      setFilters(next);
      setSelected(new Set());
      setExpandedId(null);
      updateUrl(next, 1);
    },
    [filters, updateUrl],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === initialEntries.length) return new Set();
      return new Set(initialEntries.map((e) => e.id));
    });
  }, [initialEntries]);

  const handleApprove = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await approveExtraction(id);
        startTransition(() => router.refresh());
      } finally {
        setBusyId(null);
      }
    },
    [router],
  );

  const handleReject = useCallback(
    async (id: string) => {
      const reason =
        window.prompt("Reason for rejection (optional):") ?? undefined;
      setBusyId(id);
      try {
        await rejectExtraction(id, reason);
        startTransition(() => router.refresh());
      } finally {
        setBusyId(null);
      }
    },
    [router],
  );

  const startEdit = useCallback((entry: AiReviewEntry) => {
    setEditingId(entry.id);
    setEditDraft({
      summary: entry.summary,
      details: entry.details ?? "",
      providerName: entry.providerName ?? "",
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId || !editDraft) return;
    setBusyId(editingId);
    try {
      await editExtraction(editingId, {
        summary: editDraft.summary,
        details: editDraft.details,
        providerName: editDraft.providerName,
      });
      setEditingId(null);
      setEditDraft(null);
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }, [editingId, editDraft, router]);

  const handleBulkApprove = useCallback(async () => {
    if (selected.size === 0) return;
    await bulkApprove(Array.from(selected));
    setSelected(new Set());
    startTransition(() => router.refresh());
  }, [selected, router]);

  const handleBulkReject = useCallback(async () => {
    if (selected.size === 0) return;
    const reason = rejectReason || undefined;
    await bulkReject(Array.from(selected), reason);
    setSelected(new Set());
    setRejectReason("");
    startTransition(() => router.refresh());
  }, [selected, rejectReason, router]);

  const goToPage = useCallback(
    (page: number) => {
      updateUrl(filters, page);
    },
    [filters, updateUrl],
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const allChecked =
    initialEntries.length > 0 && selected.size === initialEntries.length;
  const anyChecked = selected.size > 0;

  const pendingOverdue = stats.oldestPendingDays > 7;

  return (
    <div
      className="space-y-6"
      style={{ backgroundColor: SURFACE, minHeight: "100%" }}
    >
      <PageHeader
        title="AI Review Queue"
        description="Approve, reject, or edit extractions produced by LangExtract + Gemini. Every action is logged to the HIPAA audit trail."
        actions={
          <Badge
            variant="outline"
            className="text-[12px]"
            style={{ borderColor: BRAND, color: BRAND, backgroundColor: TINT }}
          >
            <HugeiconsIcon
              icon={SparklesIcon}
              size={14}
              className="mr-1"
              color={BRAND}
            />
            LangExtract · Gemini 2.5 Flash
          </Badge>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Pending review"
          value={stats.pendingReview.toLocaleString()}
          subtitle={
            stats.oldestPendingDays > 0
              ? `${stats.oldestPendingDays}d oldest pending`
              : "No backlog"
          }
          subtitleVariant={pendingOverdue ? "danger" : "default"}
        />
        <StatsCard
          title="Approved this week"
          value={stats.approvedThisWeek.toLocaleString()}
        />
        <StatsCard
          title="Rejected this week"
          value={stats.rejectedThisWeek.toLocaleString()}
        />
        <StatsCard
          title="Avg confidence"
          value={`${stats.avgConfidence}%`}
          trend={
            stats.confidenceTrend !== 0
              ? {
                  value: Math.round(stats.confidenceTrend),
                  label: "pts vs prior week",
                }
              : undefined
          }
        />
      </div>

      {/* Filters */}
      <Card
        style={{ borderRadius: 10, backgroundColor: "#FFFFFF" }}
        className="overflow-hidden"
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={FilterIcon} size={16} color={BRAND} />
            <span
              className="text-[13px] font-semibold"
              style={{ color: BRAND }}
            >
              Filters
            </span>
            <span className="text-[12px] text-[#666] ml-auto">
              {totalCount.toLocaleString()} matching extractions
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#666] uppercase tracking-wide">
                Status
              </label>
              <Select
                value={filters.tab}
                onValueChange={(v) => onFilterChange({ tab: v })}
              >
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="verified">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#666] uppercase tracking-wide">
                Confidence
              </label>
              <Select
                value={filters.confidence}
                onValueChange={(v) => onFilterChange({ confidence: v })}
              >
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFIDENCE_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#666] uppercase tracking-wide">
                Document type
              </label>
              <Select
                value={filters.documentType}
                onValueChange={(v) => onFilterChange({ documentType: v })}
              >
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All document types</SelectItem>
                  {documentTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs
        value={filters.tab}
        onValueChange={(v) => onFilterChange({ tab: v })}
      >
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-4">
            {filters.tab === t.value && (
              <QueueList
                entries={initialEntries}
                selected={selected}
                allChecked={allChecked}
                anyChecked={anyChecked}
                toggleSelect={toggleSelect}
                toggleSelectAll={toggleSelectAll}
                expandedId={expandedId}
                setExpandedId={setExpandedId}
                editingId={editingId}
                editDraft={editDraft}
                setEditDraft={setEditDraft}
                startEdit={startEdit}
                cancelEdit={cancelEdit}
                saveEdit={saveEdit}
                onApprove={handleApprove}
                onReject={handleReject}
                onBulkApprove={handleBulkApprove}
                onBulkReject={handleBulkReject}
                rejectReason={rejectReason}
                setRejectReason={setRejectReason}
                busyId={busyId}
                isPending={isPending}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>

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
            extractions
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

type QueueListProps = {
  entries: AiReviewEntry[];
  selected: Set<string>;
  allChecked: boolean;
  anyChecked: boolean;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  editingId: string | null;
  editDraft: { summary: string; details: string; providerName: string } | null;
  setEditDraft: (
    draft: { summary: string; details: string; providerName: string } | null,
  ) => void;
  startEdit: (entry: AiReviewEntry) => void;
  cancelEdit: () => void;
  saveEdit: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  rejectReason: string;
  setRejectReason: (v: string) => void;
  busyId: string | null;
  isPending: boolean;
};

function QueueList({
  entries,
  selected,
  allChecked,
  anyChecked,
  toggleSelect,
  toggleSelectAll,
  expandedId,
  setExpandedId,
  editingId,
  editDraft,
  setEditDraft,
  startEdit,
  cancelEdit,
  saveEdit,
  onApprove,
  onReject,
  onBulkApprove,
  onBulkReject,
  rejectReason,
  setRejectReason,
  busyId,
  isPending,
}: QueueListProps) {
  if (entries.length === 0) {
    return (
      <Card style={{ borderRadius: 10, backgroundColor: "#FFFFFF" }}>
        <CardContent className="py-16 text-center">
          <div
            className="inline-flex items-center justify-center h-12 w-12 rounded-full mb-3"
            style={{ backgroundColor: TINT }}
          >
            <HugeiconsIcon icon={AiMagicIcon} size={22} color={BRAND} />
          </div>
          <p className="text-[14px] font-medium">
            No extractions in this bucket
          </p>
          <p className="text-[12px] text-[#666] mt-1">
            New AI extractions will appear here once documents are processed.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Bulk action bar */}
      <Card style={{ borderRadius: 10, backgroundColor: "#FFFFFF" }}>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] text-[#333]">
            <Checkbox
              checked={allChecked}
              onCheckedChange={() => toggleSelectAll()}
            />
            Select all on this page
          </label>
          <span className="text-[12px] text-[#666]">
            {selected.size} selected
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Input
              value={rejectReason}
              placeholder="Bulk reject reason (optional)"
              className="h-9 text-[13px] w-[240px]"
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-[13px]"
              disabled={!anyChecked || isPending}
              onClick={onBulkReject}
              style={{ borderColor: DANGER, color: DANGER }}
            >
              <HugeiconsIcon
                icon={Cancel01Icon}
                size={14}
                className="mr-1"
                color={DANGER}
              />
              Reject selected
            </Button>
            <Button
              size="sm"
              className="h-9 text-[13px] text-white"
              disabled={!anyChecked || isPending}
              onClick={onBulkApprove}
              style={{ backgroundColor: BRAND }}
            >
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={14}
                className="mr-1"
              />
              Approve selected
            </Button>
          </div>
        </CardContent>
      </Card>

      {entries.map((entry) => {
        const conf = confidenceBadge(entry.confidence);
        const isExpanded = expandedId === entry.id;
        const isEditing = editingId === entry.id;
        const isBusy = busyId === entry.id;
        const isChecked = selected.has(entry.id);
        const overdue = entry.daysPending > 7 && !entry.isVerified;

        return (
          <Card
            key={entry.id}
            style={{ borderRadius: 10, backgroundColor: "#FFFFFF" }}
          >
            <CardContent className="p-0">
              <div
                className="p-4 flex items-start gap-3 cursor-pointer hover:bg-[#FAFAFA]"
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest("button,input,[role=checkbox]")) return;
                  setExpandedId(isExpanded ? null : entry.id);
                }}
              >
                <div className="pt-0.5">
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => toggleSelect(entry.id)}
                  />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-[11px]"
                      style={{
                        borderColor: INFO,
                        color: INFO,
                        backgroundColor: `${INFO}14`,
                      }}
                    >
                      {entry.entryType.replace(/_/g, " ")}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-[11px]"
                      style={{
                        borderColor: conf.color,
                        color: conf.color,
                        backgroundColor: `${conf.color}14`,
                      }}
                    >
                      {conf.label}
                    </Badge>
                    {entry.isVerified && (
                      <Badge
                        variant="outline"
                        className="text-[11px]"
                        style={{
                          borderColor: SUCCESS,
                          color: SUCCESS,
                          backgroundColor: `${SUCCESS}14`,
                        }}
                      >
                        Approved
                      </Badge>
                    )}
                    {entry.isExcluded && (
                      <Badge
                        variant="outline"
                        className="text-[11px]"
                        style={{
                          borderColor: DANGER,
                          color: DANGER,
                          backgroundColor: `${DANGER}14`,
                        }}
                      >
                        Rejected
                      </Badge>
                    )}
                    {overdue && (
                      <Badge
                        variant="outline"
                        className="text-[11px]"
                        style={{
                          borderColor: DANGER,
                          color: DANGER,
                          backgroundColor: `${DANGER}14`,
                        }}
                      >
                        <HugeiconsIcon
                          icon={AlertCircleIcon}
                          size={12}
                          className="mr-1"
                          color={DANGER}
                        />
                        {entry.daysPending}d pending
                      </Badge>
                    )}
                  </div>

                  <p className="text-[14px] font-medium text-[#111] truncate">
                    {entry.summary}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#666]">
                    {entry.providerName && <span>{entry.providerName}</span>}
                    {entry.eventDate && (
                      <span>· {formatDate(entry.eventDate)}</span>
                    )}
                    {entry.caseNumber && <span>· Case {entry.caseNumber}</span>}
                    {entry.claimantName && <span>· {entry.claimantName}</span>}
                    {entry.sourceDocumentName && (
                      <span className="truncate max-w-[260px]">
                        · {entry.sourceDocumentName}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {!entry.isVerified && !entry.isExcluded && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-[12px]"
                        disabled={isBusy || isPending}
                        onClick={() => startEdit(entry)}
                      >
                        <HugeiconsIcon
                          icon={Edit02Icon}
                          size={13}
                          className="mr-1"
                        />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-[12px]"
                        disabled={isBusy || isPending}
                        onClick={() => onReject(entry.id)}
                        style={{ borderColor: DANGER, color: DANGER }}
                      >
                        <HugeiconsIcon
                          icon={Cancel01Icon}
                          size={13}
                          className="mr-1"
                          color={DANGER}
                        />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 text-[12px] text-white"
                        disabled={isBusy || isPending}
                        onClick={() => onApprove(entry.id)}
                        style={{ backgroundColor: BRAND }}
                      >
                        <HugeiconsIcon
                          icon={CheckmarkCircle02Icon}
                          size={13}
                          className="mr-1"
                        />
                        Approve
                      </Button>
                    </>
                  )}
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    size={16}
                    className={`transition-transform text-[#999] ${isExpanded ? "rotate-180" : ""}`}
                  />
                </div>
              </div>

              {isExpanded && (
                <div
                  className="border-t border-[#EAEAEA] p-4 space-y-4"
                  style={{ backgroundColor: SURFACE }}
                >
                  {isEditing && editDraft ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[11px] uppercase tracking-wide text-[#666] font-medium">
                          Summary
                        </label>
                        <Input
                          value={editDraft.summary}
                          className="mt-1 text-[13px]"
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              summary: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-[11px] uppercase tracking-wide text-[#666] font-medium">
                          Provider
                        </label>
                        <Input
                          value={editDraft.providerName}
                          className="mt-1 text-[13px]"
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              providerName: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-[11px] uppercase tracking-wide text-[#666] font-medium">
                          Details
                        </label>
                        <Textarea
                          value={editDraft.details}
                          rows={4}
                          className="mt-1 text-[13px]"
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              details: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[12px]"
                          onClick={cancelEdit}
                          disabled={isBusy}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="text-[12px] text-white"
                          onClick={saveEdit}
                          disabled={isBusy}
                          style={{ backgroundColor: BRAND }}
                        >
                          Save &amp; approve
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
                        <Field
                          label="Entry type"
                          value={entry.entryType.replace(/_/g, " ")}
                        />
                        <Field
                          label="Event date"
                          value={formatDate(entry.eventDate)}
                        />
                        <Field
                          label="Provider"
                          value={entry.providerName ?? "--"}
                        />
                        <Field
                          label="Facility"
                          value={entry.facilityName ?? "--"}
                        />
                        <Field
                          label="Source document"
                          value={entry.sourceDocumentName ?? "--"}
                        />
                        <Field
                          label="Document category"
                          value={entry.sourceDocumentCategory ?? "--"}
                        />
                      </div>

                      {entry.details && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-[#666] font-medium">
                            Details
                          </div>
                          <p className="mt-1 text-[13px] text-[#333] whitespace-pre-wrap">
                            {entry.details}
                          </p>
                        </div>
                      )}

                      {(entry.diagnoses.length > 0 ||
                        entry.treatments.length > 0 ||
                        entry.medications.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <ListBlock
                            title="Diagnoses"
                            items={entry.diagnoses}
                          />
                          <ListBlock
                            title="Treatments"
                            items={entry.treatments}
                          />
                          <ListBlock
                            title="Medications"
                            items={entry.medications}
                          />
                        </div>
                      )}

                      {entry.sourceHighlights.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-[#666] font-medium mb-1">
                            Source highlights (char-intervals)
                          </div>
                          <div className="space-y-2">
                            {entry.sourceHighlights.map((h, i) => (
                              <div
                                key={`${entry.id}-h-${i}`}
                                className="rounded-md border border-[#EAEAEA] bg-white p-2"
                                style={{ borderRadius: 8 }}
                              >
                                <div className="flex items-center justify-between">
                                  <span
                                    className="text-[10px] font-semibold uppercase tracking-wide"
                                    style={{ color: BRAND }}
                                  >
                                    {h.field}
                                  </span>
                                  {h.startChar != null && h.endChar != null && (
                                    <span className="text-[10px] font-mono text-[#999]">
                                      [{h.startChar}-{h.endChar}]
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 text-[12px] text-[#333] font-mono">
                                  {h.text}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {entry.isVerified && entry.verifiedByName && (
                        <p className="text-[11px] text-[#666]">
                          Approved by{" "}
                          <span className="font-medium text-[#333]">
                            {entry.verifiedByName}
                          </span>{" "}
                          {entry.verifiedAt &&
                            `on ${formatDate(entry.verifiedAt)}`}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[#666] font-medium">
        {label}
      </div>
      <div className="text-[12px] text-[#333] break-words">{value}</div>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[#666] font-medium mb-1">
        {title}
      </div>
      <ul className="text-[12px] text-[#333] list-disc pl-4 space-y-0.5">
        {items.map((item, i) => (
          <li key={`${title}-${i}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
