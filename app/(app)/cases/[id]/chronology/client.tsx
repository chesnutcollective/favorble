"use client";

import { useState, useTransition, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatsCard } from "@/components/shared/stats-card";
import { ChronologyTimeline } from "@/components/chronology/chronology-timeline";
import { ProcessingStatus } from "@/components/chronology/processing-status";
import { ExhibitBuilder } from "@/components/exhibits/exhibit-builder";
import { ExhibitList } from "@/components/exhibits/exhibit-list";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  PlusSignIcon,
  Download01Icon,
  MoreHorizontalIcon,
  Search01Icon,
  NoteIcon,
  LeftToRightListBulletIcon,
  CheckmarkCircle02Icon,
  Stethoscope02Icon,
  Calendar03Icon,
} from "@hugeicons/core-free-icons";

import {
  generateCaseChronology,
  verifyChronologyEntry,
  excludeChronologyEntry,
  deleteChronologyEntry,
  addManualChronologyEntry,
  updateChronologyEntry,
  exportChronology,
} from "@/app/actions/chronology";

// ── Types ────────────────────────────────────────────────────────

export type ChronologyEntryItem = {
  id: string;
  caseId: string;
  sourceDocumentId: string | null;
  entryType: string;
  eventDate: string | null;
  eventDateEnd: string | null;
  providerName: string | null;
  providerType: string | null;
  facilityName: string | null;
  summary: string;
  details: string | null;
  diagnoses: string[] | null;
  treatments: string[] | null;
  medications: string[] | null;
  pageReference: string | null;
  aiGenerated: boolean;
  isVerified: boolean;
  isExcluded: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExhibitPacketItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  packetStoragePath: string | null;
  packetSizeBytes: number | null;
  builtAt: string | null;
  submittedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type DocumentItem = {
  id: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number | null;
  category: string | null;
  source: string;
  createdAt: string;
};

// ── Constants ────────────────────────────────────────────────────

const ENTRY_TYPES = [
  { value: "office_visit", label: "Office Visit" },
  { value: "hospitalization", label: "Hospitalization" },
  { value: "emergency", label: "Emergency" },
  { value: "lab_result", label: "Lab Result" },
  { value: "imaging", label: "Imaging" },
  { value: "mental_health", label: "Mental Health" },
  { value: "physical_therapy", label: "Physical Therapy" },
  { value: "surgery", label: "Surgery" },
  { value: "prescription", label: "Prescription" },
  { value: "diagnosis", label: "Diagnosis" },
  { value: "functional_assessment", label: "Functional Assessment" },
  { value: "other", label: "Other" },
] as const;

const ENTRY_TYPE_COLORS: Record<string, string> = {
  office_visit: "bg-blue-100 text-blue-800",
  hospitalization: "bg-red-100 text-red-800",
  emergency: "bg-orange-100 text-orange-800",
  lab_result: "bg-green-100 text-green-800",
  imaging: "bg-purple-100 text-purple-800",
  mental_health: "bg-indigo-100 text-indigo-800",
  physical_therapy: "bg-cyan-100 text-cyan-800",
  surgery: "bg-red-100 text-red-800",
  prescription: "bg-teal-100 text-teal-800",
  diagnosis: "bg-yellow-100 text-yellow-800",
  functional_assessment: "bg-amber-100 text-amber-800",
  other: "bg-gray-100 text-gray-800",
};

type ViewMode = "table" | "timeline";

// ── Component ────────────────────────────────────────────────────

type ChronologyClientProps = {
  caseId: string;
  userId: string;
  organizationId: string;
  initialEntries: ChronologyEntryItem[];
  initialPackets: ExhibitPacketItem[];
  initialDocuments: DocumentItem[];
};

export function ChronologyClient({
  caseId,
  userId,
  organizationId,
  initialEntries,
  initialPackets,
  initialDocuments,
}: ChronologyClientProps) {
  const [entries, setEntries] = useState<ChronologyEntryItem[]>(initialEntries);
  const [packets, setPackets] = useState<ExhibitPacketItem[]>(initialPackets);
  const [isPending, startTransition] = useTransition();

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [providerSearch, setProviderSearch] = useState("");
  const [verifiedFilter, setVerifiedFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  // Dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ChronologyEntryItem | null>(
    null,
  );

  // ── Computed ────────────────────────────────────────────────

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (typeFilter !== "all" && e.entryType !== typeFilter) return false;
      if (
        providerSearch &&
        !(e.providerName ?? "")
          .toLowerCase()
          .includes(providerSearch.toLowerCase())
      )
        return false;
      if (verifiedFilter === "verified" && !e.isVerified) return false;
      if (verifiedFilter === "unverified" && e.isVerified) return false;
      return true;
    });
  }, [entries, typeFilter, providerSearch, verifiedFilter]);

  const stats = useMemo(() => {
    const total = entries.length;
    const verified = entries.filter((e) => e.isVerified).length;
    const providers = new Set(
      entries.map((e) => e.providerName).filter(Boolean),
    ).size;

    const dates = entries
      .map((e) => e.eventDate)
      .filter(Boolean)
      .sort();
    const dateRange =
      dates.length >= 2
        ? `${new Date(dates[0]!).toLocaleDateString()} - ${new Date(dates[dates.length - 1]!).toLocaleDateString()}`
        : dates.length === 1
          ? new Date(dates[0]!).toLocaleDateString()
          : "N/A";

    return { total, verified, providers, dateRange };
  }, [entries]);

  // ── Handlers ───────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    startTransition(async () => {
      try {
        await generateCaseChronology(caseId);
      } catch {
        // Generation service may not be available
      }
    });
  }, [caseId]);

  const handleExport = useCallback(
    (format: "csv" | "json") => {
      startTransition(async () => {
        try {
          const result = await exportChronology(caseId, format);
          const blob = new Blob([result.data], {
            type: format === "json" ? "application/json" : "text/csv",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = result.filename;
          a.click();
          URL.revokeObjectURL(url);
        } catch {
          // Export failed
        }
      });
    },
    [caseId],
  );

  const handleVerify = useCallback((entryId: string, verified: boolean) => {
    startTransition(async () => {
      try {
        if (verified) {
          await verifyChronologyEntry(entryId);
        }
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entryId ? { ...e, isVerified: verified } : e,
          ),
        );
      } catch {
        // Failed
      }
    });
  }, []);

  const handleExclude = useCallback(
    (entryId: string) => {
      startTransition(async () => {
        try {
          const entry = entries.find((e) => e.id === entryId);
          if (!entry) return;
          await excludeChronologyEntry(entryId, !entry.isExcluded);
          setEntries((prev) =>
            prev.map((e) =>
              e.id === entryId ? { ...e, isExcluded: !e.isExcluded } : e,
            ),
          );
        } catch {
          // Failed
        }
      });
    },
    [entries],
  );

  const handleDelete = useCallback((entryId: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this entry?",
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        await deleteChronologyEntry(entryId);
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
      } catch {
        // Failed
      }
    });
  }, []);

  const handleAddEntry = useCallback(
    (data: EntryFormData) => {
      startTransition(async () => {
        try {
          const entry = await addManualChronologyEntry({
            caseId,
            entryType: data.entryType,
            eventDate: data.eventDate,
            providerName: data.providerName,
            summary: data.summary,
            details: data.details || undefined,
            diagnoses: data.diagnoses.length ? data.diagnoses : undefined,
            treatments: data.treatments.length ? data.treatments : undefined,
            medications: data.medications.length ? data.medications : undefined,
          });
          setEntries((prev) => [
            ...prev,
            {
              id: entry.id,
              caseId: entry.caseId,
              sourceDocumentId: entry.sourceDocumentId,
              entryType: entry.entryType,
              eventDate: entry.eventDate?.toISOString() ?? null,
              eventDateEnd: entry.eventDateEnd?.toISOString() ?? null,
              providerName: entry.providerName,
              providerType: entry.providerType,
              facilityName: entry.facilityName,
              summary: entry.summary,
              details: entry.details,
              diagnoses: entry.diagnoses,
              treatments: entry.treatments,
              medications: entry.medications,
              pageReference: entry.pageReference,
              aiGenerated: entry.aiGenerated,
              isVerified: entry.isVerified,
              isExcluded: entry.isExcluded,
              createdAt: entry.createdAt.toISOString(),
              updatedAt: entry.updatedAt.toISOString(),
            },
          ]);
          setShowAddDialog(false);
        } catch {
          // Failed
        }
      });
    },
    [caseId],
  );

  const handleEditEntry = useCallback(
    (data: EntryFormData) => {
      if (!editingEntry) return;
      startTransition(async () => {
        try {
          await updateChronologyEntry(editingEntry.id, {
            entryType: data.entryType,
            eventDate: data.eventDate,
            providerName: data.providerName,
            summary: data.summary,
            details: data.details || undefined,
            diagnoses: data.diagnoses.length ? data.diagnoses : undefined,
            treatments: data.treatments.length ? data.treatments : undefined,
            medications: data.medications.length ? data.medications : undefined,
          });
          setEntries((prev) =>
            prev.map((e) =>
              e.id === editingEntry.id
                ? {
                    ...e,
                    entryType: data.entryType,
                    eventDate: data.eventDate
                      ? new Date(data.eventDate).toISOString()
                      : null,
                    providerName: data.providerName || null,
                    facilityName: data.facilityName || null,
                    summary: data.summary,
                    details: data.details || null,
                    diagnoses: data.diagnoses.length ? data.diagnoses : null,
                    treatments: data.treatments.length ? data.treatments : null,
                    medications: data.medications.length
                      ? data.medications
                      : null,
                  }
                : e,
            ),
          );
          setEditingEntry(null);
        } catch {
          // Failed
        }
      });
    },
    [editingEntry],
  );

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Medical Chronology"
        description="Timeline of medical events extracted from case documents."
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={handleGenerate}
              disabled={isPending}
              size="sm"
              variant="outline"
            >
              Generate Chronology
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <HugeiconsIcon
                    icon={Download01Icon}
                    size={16}
                    className="mr-1"
                  />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("csv")}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("json")}>
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button onClick={() => setShowAddDialog(true)} size="sm">
              <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-1" />
              Add Entry
            </Button>
          </div>
        }
      />

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Entries"
          value={stats.total}
          icon={LeftToRightListBulletIcon}
          iconBgClass="bg-blue-100 dark:bg-blue-950/40"
          iconColor="rgb(59 130 246)"
          accentClass="border-l-blue-500"
        />
        <StatsCard
          title="Verified"
          value={stats.verified}
          icon={CheckmarkCircle02Icon}
          iconBgClass="bg-green-100 dark:bg-green-950/40"
          iconColor="rgb(34 197 94)"
          accentClass="border-l-green-500"
        />
        <StatsCard
          title="Providers"
          value={stats.providers}
          icon={Stethoscope02Icon}
          iconBgClass="bg-purple-100 dark:bg-purple-950/40"
          iconColor="rgb(147 51 234)"
          accentClass="border-l-purple-500"
        />
        <StatsCard
          title="Date Range"
          value={stats.dateRange}
          icon={Calendar03Icon}
          iconBgClass="bg-amber-100 dark:bg-amber-950/40"
          iconColor="rgb(245 158 11)"
          accentClass="border-l-amber-500"
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Entry type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {ENTRY_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search providers..."
            value={providerSearch}
            onChange={(e) => setProviderSearch(e.target.value)}
            className="pl-9 w-[200px]"
          />
        </div>

        <Select value={verifiedFilter} onValueChange={setVerifiedFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Verified status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="unverified">Unverified</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center rounded-lg border bg-muted/50 p-0.5">
          <Button
            size="sm"
            variant={viewMode === "table" ? "default" : "ghost"}
            className={
              viewMode === "table"
                ? "h-7 rounded-md text-xs font-medium shadow-sm"
                : "h-7 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground"
            }
            onClick={() => setViewMode("table")}
          >
            Table
          </Button>
          <Button
            size="sm"
            variant={viewMode === "timeline" ? "default" : "ghost"}
            className={
              viewMode === "timeline"
                ? "h-7 rounded-md text-xs font-medium shadow-sm"
                : "h-7 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground"
            }
            onClick={() => setViewMode("timeline")}
          >
            Timeline
          </Button>
        </div>
      </div>

      {/* Content */}
      {filteredEntries.length === 0 ? (
        <EmptyState
          icon={NoteIcon}
          title="No chronology entries yet"
          description="Generate a chronology from your case documents or add entries manually."
          accent="blue"
          bordered
        />
      ) : viewMode === "table" ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="max-w-[300px]">Summary</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((entry) => (
                <TableRow
                  key={entry.id}
                  className={entry.isExcluded ? "opacity-50" : ""}
                >
                  <TableCell className="whitespace-nowrap">
                    {entry.eventDate
                      ? new Date(entry.eventDate).toLocaleDateString()
                      : "--"}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">
                        {entry.providerName ?? "--"}
                      </p>
                      {entry.providerType && (
                        <p className="text-xs text-muted-foreground">
                          {entry.providerType}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        ENTRY_TYPE_COLORS[entry.entryType] ??
                        "bg-gray-100 text-gray-800"
                      }
                    >
                      {ENTRY_TYPES.find((t) => t.value === entry.entryType)
                        ?.label ?? entry.entryType}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[300px]">
                    <p className="text-sm line-clamp-2">{entry.summary}</p>
                  </TableCell>
                  <TableCell>
                    {entry.sourceDocumentId ? (
                      <span className="text-xs text-primary">Linked</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Manual
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={entry.isVerified}
                      onCheckedChange={(checked) =>
                        handleVerify(entry.id, !!checked)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditingEntry(entry)}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleVerify(entry.id, !entry.isVerified)
                          }
                        >
                          {entry.isVerified ? "Unverify" : "Verify"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleExclude(entry.id)}
                        >
                          {entry.isExcluded ? "Include" : "Exclude"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(entry.id)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <ChronologyTimeline
          entries={filteredEntries}
          onEdit={(entry) => setEditingEntry(entry)}
        />
      )}

      {/* Exhibit Packets Section */}
      <div className="mt-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Exhibit Packets
            </h2>
            <p className="text-sm text-muted-foreground">
              Compiled document packets for submission.
            </p>
          </div>
          <ExhibitBuilder
            caseId={caseId}
            organizationId={organizationId}
            userId={userId}
            documents={initialDocuments}
            onPacketCreated={(packet) =>
              setPackets((prev) => [packet, ...prev])
            }
          />
        </div>

        <ExhibitList caseId={caseId} packets={packets} />
      </div>

      {/* Add Entry Dialog */}
      <EntryDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSubmit={handleAddEntry}
        isPending={isPending}
        title="Add Chronology Entry"
        description="Manually add a medical chronology entry."
      />

      {/* Edit Entry Dialog */}
      <EntryDialog
        open={!!editingEntry}
        onOpenChange={(open) => {
          if (!open) setEditingEntry(null);
        }}
        onSubmit={handleEditEntry}
        isPending={isPending}
        title="Edit Chronology Entry"
        description="Update this medical chronology entry."
        initialData={
          editingEntry
            ? {
                entryType: editingEntry.entryType,
                eventDate: editingEntry.eventDate
                  ? editingEntry.eventDate.split("T")[0]
                  : "",
                providerName: editingEntry.providerName ?? "",
                facilityName: editingEntry.facilityName ?? "",
                summary: editingEntry.summary,
                details: editingEntry.details ?? "",
                diagnoses: editingEntry.diagnoses ?? [],
                treatments: editingEntry.treatments ?? [],
                medications: editingEntry.medications ?? [],
              }
            : undefined
        }
      />
    </div>
  );
}

// ── Entry Form Dialog ────────────────────────────────────────────

type EntryFormData = {
  entryType: string;
  eventDate: string;
  providerName: string;
  facilityName: string;
  summary: string;
  details: string;
  diagnoses: string[];
  treatments: string[];
  medications: string[];
};

function EntryDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  title,
  description,
  initialData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: EntryFormData) => void;
  isPending: boolean;
  title: string;
  description: string;
  initialData?: EntryFormData;
}) {
  const [formData, setFormData] = useState<EntryFormData>(
    initialData ?? {
      entryType: "office_visit",
      eventDate: "",
      providerName: "",
      facilityName: "",
      summary: "",
      details: "",
      diagnoses: [],
      treatments: [],
      medications: [],
    },
  );

  // Reset form when dialog opens with new data
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && initialData) {
      setFormData(initialData);
    } else if (nextOpen && !initialData) {
      setFormData({
        entryType: "office_visit",
        eventDate: "",
        providerName: "",
        facilityName: "",
        summary: "",
        details: "",
        diagnoses: [],
        treatments: [],
        medications: [],
      });
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = () => {
    if (!formData.summary.trim()) return;
    onSubmit(formData);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Entry Type */}
          <div className="space-y-1.5">
            <Label>Entry Type</Label>
            <Select
              value={formData.entryType}
              onValueChange={(v) =>
                setFormData((prev) => ({
                  ...prev,
                  entryType: v,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTRY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Event Date */}
          <div className="space-y-1.5">
            <Label>Event Date</Label>
            <Input
              type="date"
              value={formData.eventDate}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  eventDate: e.target.value,
                }))
              }
            />
          </div>

          {/* Provider Name */}
          <div className="space-y-1.5">
            <Label>Provider Name</Label>
            <Input
              value={formData.providerName}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  providerName: e.target.value,
                }))
              }
              placeholder="Dr. Smith"
            />
          </div>

          {/* Facility */}
          <div className="space-y-1.5">
            <Label>Facility</Label>
            <Input
              value={formData.facilityName}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  facilityName: e.target.value,
                }))
              }
              placeholder="General Hospital"
            />
          </div>

          {/* Summary */}
          <div className="space-y-1.5">
            <Label>Summary</Label>
            <Textarea
              value={formData.summary}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  summary: e.target.value,
                }))
              }
              placeholder="Brief description of the event..."
              rows={2}
            />
          </div>

          {/* Details */}
          <div className="space-y-1.5">
            <Label>Details</Label>
            <Textarea
              value={formData.details}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  details: e.target.value,
                }))
              }
              placeholder="Additional details..."
              rows={3}
            />
          </div>

          {/* Diagnoses */}
          <div className="space-y-1.5">
            <Label>Diagnoses (comma-separated)</Label>
            <Input
              value={formData.diagnoses.join(", ")}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  diagnoses: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                }))
              }
              placeholder="Diagnosis 1, Diagnosis 2"
            />
          </div>

          {/* Treatments */}
          <div className="space-y-1.5">
            <Label>Treatments (comma-separated)</Label>
            <Input
              value={formData.treatments.join(", ")}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  treatments: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                }))
              }
              placeholder="Treatment 1, Treatment 2"
            />
          </div>

          {/* Medications */}
          <div className="space-y-1.5">
            <Label>Medications (comma-separated)</Label>
            <Input
              value={formData.medications.join(", ")}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  medications: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                }))
              }
              placeholder="Medication 1, Medication 2"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !formData.summary.trim()}
          >
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
