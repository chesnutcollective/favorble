"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CalendarCheckOut01Icon,
  Legal01Icon,
  UserIcon,
  File01Icon,
  StethoscopeIcon,
  Clock01Icon,
  CheckmarkCircle01Icon,
} from "@hugeicons/core-free-icons";
import {
  assignPhiSheetToWriter,
  updatePhiSheetStatus,
  type PhiSheetStatus,
} from "@/app/actions/phi-writer";

const ACCENT = "#263c94";
const STATUS_BLUE = "#1d72b8";
const ACCENT_SOFT = "rgba(38,60,148,0.08)";
const SURFACE = "#F8F9FC";

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

type SerializedBundle = {
  currentUserId: string;
  caseId: string;
  caseNumber: string;
  status: string;
  ssaClaimNumber: string | null;
  ssaOffice: string | null;
  applicationTypePrimary: string | null;
  applicationTypeSecondary: string | null;
  allegedOnsetDate: string | null;
  dateLastInsured: string | null;
  hearingDate: string | null;
  hearingOffice: string | null;
  adminLawJudge: string | null;
  daysUntilHearing: number | null;
  phiSheetStatus: PhiSheetStatus;
  phiSheetStartedAt: string | null;
  phiSheetCompletedAt: string | null;
  stageName: string | null;
  stageGroupName: string | null;
  stageGroupColor: string | null;
  assignedWriter: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  claimant: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null;
  chronology: Array<{
    id: string;
    eventDate: string | null;
    entryType: string;
    providerName: string | null;
    facilityName: string | null;
    summary: string;
    diagnoses: string[] | null;
    treatments: string[] | null;
    medications: string[] | null;
    isVerified: boolean;
  }>;
  documents: Array<{
    id: string;
    fileName: string;
    category: string | null;
    source: string;
    createdAt: string;
  }>;
  activity: Array<{
    id: string;
    fromStageId: string | null;
    toStageId: string;
    transitionedAt: string;
    notes: string | null;
    isAutomatic: boolean;
    userName: string | null;
  }>;
};

type Writer = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  team: string | null;
};

function countdownTone(days: number | null) {
  if (days === null) {
    return { label: "No date", color: "#6b7280", bg: "rgba(107,114,128,0.1)" };
  }
  if (days < 0) {
    return {
      label: `${Math.abs(days)} days overdue`,
      color: "#b91c1c",
      bg: "rgba(185,28,28,0.12)",
    };
  }
  if (days <= 14) {
    return {
      label: `${days} days`,
      color: "#b91c1c",
      bg: "rgba(185,28,28,0.12)",
    };
  }
  if (days <= 30) {
    return {
      label: `${days} days`,
      color: "#b45309",
      bg: "rgba(180,83,9,0.12)",
    };
  }
  return {
    label: `${days} days`,
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

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PhiAuthoringView({
  bundle,
  writers,
}: {
  bundle: SerializedBundle;
  writers: Writer[];
}) {
  const tone = countdownTone(bundle.daysUntilHearing);
  const [isPending, startTransition] = useTransition();

  // Draft state for the PHI sheet form. This is a local-only working draft;
  // persistence is not wired to a backing table yet — the form fields give
  // writers a structured scratch pad backed by the shared case data.
  const [draft, setDraft] = useState(() => ({
    caseOverview: "",
    medicalSummary: "",
    impairments: "",
    vocationalFactors: "",
    issues: "",
    questionsForAlj: "",
  }));

  const sortedChronology = useMemo(
    () =>
      [...bundle.chronology].sort((a, b) => {
        const at = a.eventDate ? new Date(a.eventDate).getTime() : 0;
        const bt = b.eventDate ? new Date(b.eventDate).getTime() : 0;
        return bt - at;
      }),
    [bundle.chronology],
  );

  function handleStatusChange(status: PhiSheetStatus) {
    startTransition(async () => {
      await updatePhiSheetStatus(bundle.caseId, status);
    });
  }

  function handleAssign(userId: string) {
    startTransition(async () => {
      await assignPhiSheetToWriter(bundle.caseId, userId);
    });
  }

  return (
    <div className="space-y-4">
      {/* Sticky countdown banner */}
      <div
        className="sticky top-0 z-10 rounded-[10px] border px-4 py-3 flex items-center justify-between gap-4"
        style={{
          backgroundColor: tone.bg,
          borderColor: "rgba(0,0,0,0.04)",
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="rounded-md p-2"
            style={{
              backgroundColor: "rgba(255,255,255,0.5)",
              color: tone.color,
            }}
          >
            <HugeiconsIcon icon={CalendarCheckOut01Icon} size={20} />
          </div>
          <div className="min-w-0">
            <div
              className="text-[10px] uppercase tracking-wide font-medium"
              style={{ color: tone.color }}
            >
              Hearing Countdown
            </div>
            <div
              className="text-lg font-bold leading-tight"
              style={{ color: tone.color }}
            >
              {tone.label}
              <span className="text-xs font-normal ml-2 opacity-80">
                {fmtDate(bundle.hearingDate)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-0 text-[11px]"
            style={statusBadgeStyle(bundle.phiSheetStatus)}
          >
            {STATUS_LABELS[bundle.phiSheetStatus]}
          </Badge>
          <Select
            value={bundle.phiSheetStatus}
            onValueChange={(v) => handleStatusChange(v as PhiSheetStatus)}
            disabled={isPending}
          >
            <SelectTrigger className="w-[140px] h-8 text-xs bg-white">
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
            value={bundle.assignedWriter?.id ?? "unassigned"}
            onValueChange={(v) => {
              if (v && v !== "unassigned") handleAssign(v);
            }}
            disabled={isPending}
          >
            <SelectTrigger className="w-[160px] h-8 text-xs bg-white">
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

      {/* Three-pane layout */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,5fr)_minmax(0,4fr)]">
        {/* Left: case data sidebar */}
        <div className="space-y-4">
          <Card style={{ borderRadius: 10 }}>
            <CardHeader className="pb-2" style={{ backgroundColor: SURFACE }}>
              <CardTitle className="text-sm flex items-center gap-2">
                <HugeiconsIcon icon={UserIcon} size={14} />
                Claimant
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2 text-sm">
              {bundle.claimant ? (
                <>
                  <div className="font-medium text-foreground">
                    {bundle.claimant.firstName} {bundle.claimant.lastName}
                  </div>
                  {bundle.claimant.email && (
                    <KV label="Email" value={bundle.claimant.email} />
                  )}
                  {bundle.claimant.phone && (
                    <KV label="Phone" value={bundle.claimant.phone} />
                  )}
                  {(bundle.claimant.address || bundle.claimant.city) && (
                    <KV
                      label="Address"
                      value={[
                        bundle.claimant.address,
                        [
                          bundle.claimant.city,
                          bundle.claimant.state,
                          bundle.claimant.zip,
                        ]
                          .filter(Boolean)
                          .join(", "),
                      ]
                        .filter(Boolean)
                        .join("\n")}
                    />
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No claimant contact linked.
                </p>
              )}
            </CardContent>
          </Card>

          <Card style={{ borderRadius: 10 }}>
            <CardHeader className="pb-2" style={{ backgroundColor: SURFACE }}>
              <CardTitle className="text-sm flex items-center gap-2">
                <HugeiconsIcon icon={Legal01Icon} size={14} />
                Hearing & SSA
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2 text-sm">
              <KV label="Hearing Date" value={fmtDate(bundle.hearingDate)} />
              <KV label="ALJ" value={bundle.adminLawJudge ?? "—"} />
              <KV label="Hearing Office" value={bundle.hearingOffice ?? "—"} />
              <KV label="SSA Office" value={bundle.ssaOffice ?? "—"} />
              <KV label="SSA Claim #" value={bundle.ssaClaimNumber ?? "—"} />
              <KV
                label="Application"
                value={
                  [
                    bundle.applicationTypePrimary,
                    bundle.applicationTypeSecondary,
                  ]
                    .filter(Boolean)
                    .join(" / ") || "—"
                }
              />
              <KV
                label="Alleged Onset"
                value={fmtDate(bundle.allegedOnsetDate)}
              />
              <KV
                label="Date Last Insured"
                value={fmtDate(bundle.dateLastInsured)}
              />
              <KV label="Current Stage" value={bundle.stageName ?? "—"} />
            </CardContent>
          </Card>

          <Card style={{ borderRadius: 10 }}>
            <CardHeader className="pb-2" style={{ backgroundColor: SURFACE }}>
              <CardTitle className="text-sm flex items-center gap-2">
                <HugeiconsIcon icon={File01Icon} size={14} />
                Documents ({bundle.documents.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[320px] overflow-auto">
              {bundle.documents.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">
                  No documents on file.
                </p>
              ) : (
                <ul className="divide-y">
                  {bundle.documents.map((d) => (
                    <li
                      key={d.id}
                      className="px-4 py-2 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground truncate">
                          {d.fileName}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {d.source} · {fmtDate(d.createdAt)}
                        </p>
                      </div>
                      {d.category && (
                        <Badge
                          variant="outline"
                          className="text-[10px] shrink-0"
                        >
                          {d.category}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card style={{ borderRadius: 10 }}>
            <CardHeader className="pb-2" style={{ backgroundColor: SURFACE }}>
              <CardTitle className="text-sm flex items-center gap-2">
                <HugeiconsIcon icon={Clock01Icon} size={14} />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {bundle.activity.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No recent activity.
                </p>
              ) : (
                bundle.activity.map((a) => (
                  <div key={a.id} className="text-xs">
                    <p className="text-foreground">
                      {a.fromStageId ? "Stage changed" : "Case created"}
                      {a.isAutomatic ? " · auto" : ""}
                    </p>
                    <p className="text-muted-foreground">
                      {a.userName ?? "System"} · {fmtDateTime(a.transitionedAt)}
                    </p>
                    {a.notes && (
                      <p className="text-muted-foreground italic mt-0.5">
                        {a.notes}
                      </p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Center: PHI sheet draft form */}
        <div>
          <Card style={{ borderRadius: 10 }}>
            <CardHeader
              className="pb-3"
              style={{ backgroundColor: ACCENT_SOFT }}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-base" style={{ color: ACCENT }}>
                  PHI Sheet Draft
                </CardTitle>
                {bundle.phiSheetStartedAt && (
                  <span className="text-[10px] text-muted-foreground">
                    Started {fmtDateTime(bundle.phiSheetStartedAt)}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <DraftField
                label="Case Overview"
                value={draft.caseOverview}
                onChange={(v) => setDraft((d) => ({ ...d, caseOverview: v }))}
                placeholder="Summarize the claim, alleged onset, and how we got to hearing…"
              />
              <DraftField
                label="Medical Summary"
                value={draft.medicalSummary}
                onChange={(v) => setDraft((d) => ({ ...d, medicalSummary: v }))}
                placeholder="High-level summary of treatment history and supporting evidence…"
              />
              <DraftField
                label="Primary Impairments"
                value={draft.impairments}
                onChange={(v) => setDraft((d) => ({ ...d, impairments: v }))}
                placeholder="List severe impairments, listings considered, functional limitations…"
              />
              <DraftField
                label="Vocational Factors"
                value={draft.vocationalFactors}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, vocationalFactors: v }))
                }
                placeholder="Age, education, past relevant work, transferable skills…"
              />
              <DraftField
                label="Issues / Problems"
                value={draft.issues}
                onChange={(v) => setDraft((d) => ({ ...d, issues: v }))}
                placeholder="Open questions, missing records, credibility concerns…"
              />
              <DraftField
                label="Questions for ALJ"
                value={draft.questionsForAlj}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, questionsForAlj: v }))
                }
                placeholder="Specific questions we want asked at hearing…"
              />
              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleStatusChange("in_review")}
                >
                  Send to Review
                </Button>
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleStatusChange("complete")}
                  style={{ backgroundColor: ACCENT, color: "white" }}
                >
                  <HugeiconsIcon
                    icon={CheckmarkCircle01Icon}
                    size={14}
                    className="mr-1.5"
                  />
                  Mark Complete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: medical chronology */}
        <div>
          <Card style={{ borderRadius: 10 }}>
            <CardHeader className="pb-2" style={{ backgroundColor: SURFACE }}>
              <CardTitle className="text-sm flex items-center gap-2">
                <HugeiconsIcon icon={StethoscopeIcon} size={14} />
                Medical Chronology ({sortedChronology.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[820px] overflow-auto">
              {sortedChronology.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">
                  No chronology entries yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {sortedChronology.map((entry) => (
                    <li key={entry.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground">
                            {fmtDate(entry.eventDate)}
                            {entry.providerName && (
                              <span className="text-muted-foreground font-normal">
                                {" "}
                                · {entry.providerName}
                              </span>
                            )}
                          </p>
                          {entry.facilityName && (
                            <p className="text-[10px] text-muted-foreground">
                              {entry.facilityName}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[10px] shrink-0"
                          style={
                            entry.isVerified
                              ? {
                                  backgroundColor: "rgba(22,163,74,0.1)",
                                  color: "#15803d",
                                  borderColor: "transparent",
                                }
                              : {
                                  backgroundColor: ACCENT_SOFT,
                                  color: ACCENT,
                                  borderColor: "transparent",
                                }
                          }
                        >
                          {entry.entryType.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-foreground mt-1.5 whitespace-pre-wrap">
                        {entry.summary}
                      </p>
                      {entry.diagnoses && entry.diagnoses.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {entry.diagnoses.slice(0, 5).map((d) => (
                            <span
                              key={d}
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: ACCENT_SOFT,
                                color: ACCENT,
                              }}
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-xs text-foreground whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function DraftField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label
        className="text-[11px] uppercase tracking-wide font-medium"
        style={{ color: ACCENT }}
      >
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full text-sm border rounded-md p-2 resize-y focus:outline-none focus:ring-2"
        style={
          {
            borderColor: "#e5e7eb",
            backgroundColor: "white",
            "--tw-ring-color": ACCENT,
          } as React.CSSProperties
        }
      />
    </div>
  );
}
