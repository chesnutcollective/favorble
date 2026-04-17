"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon,
  CourtHouseIcon,
  JusticeScale01Icon,
  Video01Icon,
  TelephoneIcon,
  Calendar03Icon,
  File01Icon,
  DocumentValidationIcon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";

const PRIMARY = "#263c94";
const STATUS_READY = "#1d72b8";
const STATUS_PARTIAL = "#cf8a00";
const STATUS_URGENT = "#d1453b";
const TINT = "rgba(38,60,148,0.08)";

type Mode = "in_person" | "video" | "phone" | "unknown";
type PrepStatus = "ready" | "partial" | "not_ready";

export type HearingWorkspaceData = {
  caseId: string;
  caseNumber: string;
  claimantName: string;
  claimantDob: string | null;
  ssaClaimNumber: string | null;
  ssaOffice: string | null;
  hearingOffice: string | null;
  applicationTypePrimary: string | null;
  applicationTypeSecondary: string | null;
  allegedOnsetDate: string | null;
  dateLastInsured: string | null;
  adminLawJudge: string | null;
  modeOfAppearance: Mode;
  hearingStartIso: string | null;
  hearingEndIso: string | null;
  prepStatus: PrepStatus;
  chronologyTotal: number;
  chronologySummary: Array<{
    id: string;
    eventDate: string | null;
    entryType: string;
    providerName: string | null;
    summary: string;
  }>;
  keyDiagnoses: string[];
  keyMedications: string[];
  keyTreatments: string[];
  documentCategories: Array<{ category: string; count: number }>;
  documentTotal: number;
  phiSheet: {
    id: string;
    fileName: string;
    createdAt: string;
  } | null;
  aljStats: {
    aljName: string;
    totalHearings: number;
    wonCount: number;
    lostCount: number;
    winRate: number | null;
    avgHearingLengthMinutes: number | null;
    recentDecisions: Array<{
      caseId: string;
      caseNumber: string;
      status: string;
      closedAt: string | null;
    }>;
  } | null;
};

function modeIconFor(mode: Mode) {
  if (mode === "video") return Video01Icon;
  if (mode === "phone") return TelephoneIcon;
  if (mode === "in_person") return CourtHouseIcon;
  return Calendar03Icon;
}

function modeLabel(mode: Mode) {
  if (mode === "video") return "Video hearing";
  if (mode === "phone") return "Phone hearing";
  if (mode === "in_person") return "In-person hearing";
  return "Mode TBD";
}

function prepStyles(status: PrepStatus) {
  if (status === "ready")
    return {
      color: STATUS_READY,
      bg: "rgba(29,114,184,0.10)",
      label: "Prep complete",
    };
  if (status === "partial")
    return {
      color: STATUS_PARTIAL,
      bg: "rgba(207,138,0,0.12)",
      label: "Prep partial",
    };
  return {
    color: STATUS_URGENT,
    bg: "rgba(209,69,59,0.10)",
    label: "Prep incomplete",
  };
}

function formatCountdown(targetIso: string | null) {
  if (!targetIso)
    return { text: "No upcoming hearing", color: "#666", isUrgent: false };
  const target = new Date(targetIso);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  if (diffMs < 0)
    return { text: "In progress / past", color: "#666", isUrgent: false };

  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  let color = STATUS_READY;
  let isUrgent = false;
  if (diffHours < 48) {
    color = STATUS_URGENT;
    isUrgent = true;
  } else if (diffDays < 7) {
    color = STATUS_PARTIAL;
  }

  let text: string;
  if (diffHours < 1) {
    text = `Starts in ${Math.round(diffMs / (1000 * 60))} min`;
  } else if (diffHours < 24) {
    text = `Starts in ${Math.round(diffHours)} hours`;
  } else {
    text = `Starts in ${Math.floor(diffDays)} days ${Math.round(diffHours % 24)} hrs`;
  }

  return { text, color, isUrgent };
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="py-2">
      <p className="text-xs text-[#666] uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-sm font-medium">{value ?? "—"}</p>
    </div>
  );
}

export function HearingWorkspaceClient({
  data,
}: {
  data: HearingWorkspaceData;
}) {
  const [countdown, setCountdown] = useState(() =>
    formatCountdown(data.hearingStartIso),
  );

  // Refresh countdown every minute
  useEffect(() => {
    if (!data.hearingStartIso) return;
    const id = setInterval(() => {
      setCountdown(formatCountdown(data.hearingStartIso));
    }, 60_000);
    return () => clearInterval(id);
  }, [data.hearingStartIso]);

  const prep = prepStyles(data.prepStatus);
  const ModeIcon = modeIconFor(data.modeOfAppearance);
  const hearingDateText = data.hearingStartIso
    ? new Date(data.hearingStartIso).toLocaleString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href="/hearings"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; All hearings
      </Link>

      {/* Sticky countdown banner */}
      <div
        className="sticky top-0 z-10 rounded-md border p-3 flex items-center justify-between gap-3"
        style={{
          backgroundColor: countdown.isUrgent ? "rgba(209,69,59,0.08)" : TINT,
          borderColor: countdown.isUrgent ? STATUS_URGENT : PRIMARY,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <HugeiconsIcon icon={Clock01Icon} size={18} color={countdown.color} aria-hidden="true" />
          <div className="min-w-0">
            <p
              className="text-sm font-semibold truncate"
              style={{ color: countdown.color }}
            >
              {countdown.text}
            </p>
            {hearingDateText && (
              <p className="text-xs text-muted-foreground truncate">
                {hearingDateText}
              </p>
            )}
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-wide"
          style={{ color: prep.color, backgroundColor: prep.bg }}
        >
          {prep.label}
        </span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground truncate">
            {data.claimantName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {data.caseNumber}
            {data.claimantDob && <> &middot; DOB: {data.claimantDob}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <HugeiconsIcon icon={ModeIcon} size={16} color={PRIMARY} aria-hidden="true" />
          <span>{modeLabel(data.modeOfAppearance)}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        {/* Main content */}
        <div>
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="medical">Medical</TabsTrigger>
              <TabsTrigger value="alj">ALJ Profile</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="phi">PHI Sheet</TabsTrigger>
            </TabsList>

            {/* Overview */}
            <TabsContent value="overview">
              <Card>
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-medium text-foreground">
                    Hearing Details
                  </h3>
                  <div className="grid gap-x-6 gap-y-0 sm:grid-cols-2 lg:grid-cols-3 [&>*]:border-b [&>*]:border-border/40 [&>*:nth-last-child(-n+3)]:border-b-0">
                    <InfoItem
                      label="SSA Claim Number"
                      value={data.ssaClaimNumber}
                    />
                    <InfoItem
                      label="Hearing Office"
                      value={data.hearingOffice}
                    />
                    <InfoItem
                      label="Administrative Law Judge"
                      value={data.adminLawJudge}
                    />
                    <InfoItem
                      label="Mode of Appearance"
                      value={modeLabel(data.modeOfAppearance)}
                    />
                    <InfoItem label="SSA Office" value={data.ssaOffice} />
                    <InfoItem
                      label="Primary Application"
                      value={data.applicationTypePrimary}
                    />
                    <InfoItem
                      label="Secondary Application"
                      value={data.applicationTypeSecondary}
                    />
                    <InfoItem
                      label="Alleged Onset Date"
                      value={data.allegedOnsetDate}
                    />
                    <InfoItem
                      label="Date Last Insured"
                      value={data.dateLastInsured}
                    />
                    <InfoItem label="Claimant DOB" value={data.claimantDob} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Medical */}
            <TabsContent value="medical">
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-foreground">
                      Chronology Summary
                    </h3>
                    <Badge variant="outline">
                      {data.chronologyTotal} entries
                    </Badge>
                  </div>

                  {data.chronologySummary.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No chronology entries yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {data.chronologySummary.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-md border border-[#EAEAEA] p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                {entry.eventDate ?? "Date unknown"}
                                {entry.providerName && (
                                  <> &middot; {entry.providerName}</>
                                )}
                              </p>
                              <p className="text-sm text-foreground mt-1">
                                {entry.summary}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-[10px]">
                              {entry.entryType}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {(data.keyDiagnoses.length > 0 ||
                    data.keyMedications.length > 0 ||
                    data.keyTreatments.length > 0) && (
                    <div className="grid gap-4 sm:grid-cols-3 pt-3 border-t border-[#EAEAEA]">
                      <div>
                        <p className="text-xs text-[#666] uppercase tracking-wider mb-2">
                          Key Diagnoses
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {data.keyDiagnoses.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          ) : (
                            data.keyDiagnoses.map((d) => (
                              <Badge
                                key={d}
                                variant="outline"
                                className="text-[10px]"
                              >
                                {d}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-[#666] uppercase tracking-wider mb-2">
                          Medications
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {data.keyMedications.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          ) : (
                            data.keyMedications.map((m) => (
                              <Badge
                                key={m}
                                variant="outline"
                                className="text-[10px]"
                              >
                                {m}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-[#666] uppercase tracking-wider mb-2">
                          Treatments
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {data.keyTreatments.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          ) : (
                            data.keyTreatments.map((t) => (
                              <Badge
                                key={t}
                                variant="outline"
                                className="text-[10px]"
                              >
                                {t}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ALJ Profile */}
            <TabsContent value="alj">
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon
                      icon={JusticeScale01Icon}
                      size={18}
                      color={PRIMARY}
                      aria-hidden="true"
                    />
                    <h3 className="font-medium text-foreground">
                      {data.aljStats?.aljName ?? data.adminLawJudge ?? "ALJ"}
                    </h3>
                  </div>

                  {!data.aljStats ? (
                    <p className="text-sm text-muted-foreground">
                      No stats available for this ALJ.
                    </p>
                  ) : (
                    <>
                      <div className="grid gap-4 sm:grid-cols-4">
                        <StatTile
                          label="Total hearings"
                          value={data.aljStats.totalHearings.toString()}
                        />
                        <StatTile
                          label="Win rate"
                          value={
                            data.aljStats.winRate !== null
                              ? `${Math.round(data.aljStats.winRate * 100)}%`
                              : "—"
                          }
                          accent={
                            data.aljStats.winRate !== null &&
                            data.aljStats.winRate >= 0.5
                              ? STATUS_READY
                              : undefined
                          }
                        />
                        <StatTile
                          label="Won / lost"
                          value={`${data.aljStats.wonCount} / ${data.aljStats.lostCount}`}
                        />
                        <StatTile
                          label="Avg length"
                          value={
                            data.aljStats.avgHearingLengthMinutes
                              ? `${data.aljStats.avgHearingLengthMinutes} min`
                              : "—"
                          }
                        />
                      </div>

                      <div>
                        <p className="text-xs text-[#666] uppercase tracking-wider mb-2">
                          Recent decisions
                        </p>
                        {data.aljStats.recentDecisions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No closed cases on record.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {data.aljStats.recentDecisions.map((d) => (
                              <Link
                                key={d.caseId}
                                href={`/cases/${d.caseId}`}
                                className="flex items-center justify-between border-b border-[#EAEAEA] py-1.5 text-sm hover:bg-[#F8F9FC] transition-colors duration-200"
                              >
                                <span className="font-medium">
                                  {d.caseNumber}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {d.closedAt
                                    ? new Date(d.closedAt).toLocaleDateString()
                                    : ""}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[10px]"
                                  style={{
                                    color:
                                      d.status === "closed_won"
                                        ? STATUS_READY
                                        : d.status === "closed_lost"
                                          ? STATUS_URGENT
                                          : undefined,
                                  }}
                                >
                                  {d.status.replace("closed_", "")}
                                </Badge>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Documents */}
            <TabsContent value="documents">
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-foreground">
                      Medical &amp; SSA Correspondence
                    </h3>
                    <Badge variant="outline">{data.documentTotal} total</Badge>
                  </div>

                  {data.documentCategories.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No documents on file.
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {data.documentCategories.map((c) => (
                        <div
                          key={c.category}
                          className="flex items-center justify-between rounded-md border border-[#EAEAEA] px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <HugeiconsIcon
                              icon={File01Icon}
                              size={14}
                              color={PRIMARY}
                              aria-hidden="true"
                            />
                            <span className="text-sm text-foreground">
                              {c.category}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {c.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-3 border-t border-[#EAEAEA]">
                    <Link
                      href={`/cases/${data.caseId}/documents`}
                      className="text-sm text-primary hover:underline"
                    >
                      View all documents &rarr;
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* PHI Sheet */}
            <TabsContent value="phi">
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon
                      icon={DocumentValidationIcon}
                      size={18}
                      color={PRIMARY}
                      aria-hidden="true"
                    />
                    <h3 className="font-medium text-foreground">PHI Sheet</h3>
                  </div>

                  {data.phiSheet ? (
                    <div className="space-y-3">
                      <div
                        className="rounded-md border p-3"
                        style={{
                          borderColor: STATUS_READY,
                          backgroundColor: "rgba(29,114,184,0.08)",
                        }}
                      >
                        <p
                          className="text-xs font-semibold uppercase tracking-wider"
                          style={{ color: STATUS_READY }}
                        >
                          PHI Sheet on file
                        </p>
                        <p className="text-sm text-foreground mt-1">
                          {data.phiSheet.fileName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Generated{" "}
                          {new Date(
                            data.phiSheet.createdAt,
                          ).toLocaleDateString()}
                        </p>
                      </div>
                      <Button asChild variant="outline">
                        <Link href={`/phi-writer/${data.caseId}`}>
                          Edit PHI Sheet
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        No PHI sheet has been generated for this case yet. Open
                        the PHI Writer to draft one before the hearing.
                      </p>
                      <Button asChild>
                        <Link href={`/phi-writer/${data.caseId}`}>
                          <HugeiconsIcon
                            icon={LinkSquare02Icon}
                            size={14}
                            className="mr-2"
                            aria-hidden="true"
                          />
                          Open PHI Writer
                        </Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <aside className="space-y-3">
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-xs text-[#666] uppercase tracking-wider mb-1">
                Quick Links
              </p>
              <SidebarLink
                href={`/cases/${data.caseId}/documents`}
                label="View Medical Records"
              />
              <SidebarLink
                href={`/phi-writer/${data.caseId}`}
                label={data.phiSheet ? "Open PHI Sheet" : "Create PHI Sheet"}
              />
              <SidebarLink
                href={`/cases/${data.caseId}/documents`}
                label="View All Documents"
              />
              {data.adminLawJudge && (
                <SidebarLink
                  href={`#alj`}
                  label="ALJ Profile"
                  onClickTab="alj"
                />
              )}
              <SidebarLink
                href={`/cases/${data.caseId}/overview`}
                label="Open Case File"
              />
            </CardContent>
          </Card>

          {/* Prep checklist */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-xs text-[#666] uppercase tracking-wider">
                Prep Checklist
              </p>
              <ChecklistItem
                done={data.chronologyTotal > 5}
                label={`Medical chronology (${data.chronologyTotal})`}
              />
              <ChecklistItem
                done={!!data.phiSheet}
                label="PHI sheet generated"
              />
              <ChecklistItem
                done={!!data.adminLawJudge}
                label="ALJ identified"
              />
              <ChecklistItem
                done={data.modeOfAppearance !== "unknown"}
                label="Mode of appearance known"
              />
              <ChecklistItem
                done={data.documentTotal > 0}
                label="Documents on file"
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-md border border-[#EAEAEA] p-3"
      style={{ backgroundColor: "#F8F9FC" }}
    >
      <p className="text-xs text-[#666] uppercase tracking-wider">{label}</p>
      <p
        className="mt-1 text-xl font-semibold"
        style={{ color: accent ?? "#111" }}
      >
        {value}
      </p>
    </div>
  );
}

function SidebarLink({
  href,
  label,
  onClickTab,
}: {
  href: string;
  label: string;
  onClickTab?: string;
}) {
  if (onClickTab) {
    return (
      <button
        type="button"
        onClick={() => {
          const el = document.querySelector<HTMLButtonElement>(
            `[role="tab"][value="${onClickTab}"]`,
          );
          el?.click();
        }}
        className="block w-full text-left text-sm text-primary hover:underline"
      >
        {label}
      </button>
    );
  }
  return (
    <Link href={href} className="block text-sm text-primary hover:underline">
      {label}
    </Link>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px]"
        style={{
          borderColor: done ? STATUS_READY : "#CCC",
          backgroundColor: done ? STATUS_READY : "transparent",
          color: "#fff",
        }}
      >
        {done ? "✓" : ""}
      </span>
      <span className={done ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </div>
  );
}
