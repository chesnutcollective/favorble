"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateLeadStage,
  createLead,
  searchDuplicateLeads,
} from "@/app/actions/leads";
import { checkLeadDuplicates } from "@/app/actions/duplicates";
import type { DuplicateLeadMatch } from "@/lib/services/lead-dedup";
import {
  t as tIntake,
  tf as tfIntake,
  type Locale,
  readSavedLocale,
  saveLocale,
} from "@/lib/i18n/intake-forms";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Mail01Icon,
  Call02Icon,
  PlusSignIcon,
  SearchList02Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";

export type ClientLead = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  createdAt: string;
  notes: string | null;
  pipelineStage: string;
};

type StagePayload = {
  id: string;
  label: string;
  color: string;
  order: number;
  isTerminal: boolean;
  leads: ClientLead[];
};

type GroupPayload = {
  id: string;
  label: string;
  color: string;
  order: number;
  stages: StagePayload[];
};

type StageMeta = {
  id: string;
  label: string;
  group: string;
  order: number;
  color: string;
  isTerminal: boolean;
};

type DuplicateMatchClient = {
  leadId: string;
  matchScore: number;
  matchReason:
    | "exact_email"
    | "exact_phone"
    | "name_and_dob"
    | "name_and_email_domain"
    | "name_and_city"
    | "fuzzy_name_and_area_code"
    | "phonetic_name";
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    createdAt: string | Date;
    pipelineStage: string | null;
    status: string;
  };
};

const LEAD_SOURCES = [
  "website",
  "referral",
  "phone",
  "walk_in",
  "social_media",
  "other",
];

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / 86400000);
  return `${days}d ago`;
}

function describeReason(reason: DuplicateMatchClient["matchReason"]): string {
  switch (reason) {
    case "exact_email":
      return "Exact email match";
    case "exact_phone":
      return "Exact phone match";
    case "name_and_dob":
      return "Same name + DOB";
    case "name_and_email_domain":
      return "Same name + email domain";
    case "name_and_city":
      return "Same name + city";
    case "fuzzy_name_and_area_code":
      return "Similar name + area code";
    case "phonetic_name":
      return "Phonetic name match";
  }
}

export function LeadsPipelineClient({
  groups: initialGroups,
  allStages,
  initialAction,
  initialStage,
}: {
  groups: GroupPayload[];
  allStages: StageMeta[];
  initialAction?: string;
  initialStage?: string;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [isPending, startTransition] = useTransition();
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [dupDialogOpen, setDupDialogOpen] = useState(false);
  const pipelineRef = useRef<HTMLDivElement>(null);

  // Auto-open create dialog when navigating with ?action=new
  useEffect(() => {
    if (initialAction === "new") {
      setNewLeadOpen(true);
    } else if (initialAction === "find-duplicates") {
      setDupDialogOpen(true);
    }
  }, [initialAction]);

  // Scroll to a specific stage if initialStage is set
  useEffect(() => {
    if (!initialStage) return;
    const timer = setTimeout(() => {
      const el = pipelineRef.current?.querySelector<HTMLElement>(
        `[data-stage="${initialStage}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", inline: "center" });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [initialStage]);

  // ─── New Lead form state ─────────────────────────────────────
  const [nlFirstName, setNlFirstName] = useState("");
  const [nlLastName, setNlLastName] = useState("");
  const [nlEmail, setNlEmail] = useState("");
  const [nlPhone, setNlPhone] = useState("");
  const [nlSource, setNlSource] = useState("website");
  const [nlDuplicates, setNlDuplicates] = useState<DuplicateMatchClient[]>([]);
  const [nlError, setNlError] = useState<string | null>(null);

  // ─── Inline debounced duplicate pre-check (Wave 5 polish) ────
  const [nlLivePreview, setNlLivePreview] = useState<DuplicateLeadMatch[]>([]);
  const [nlExpanded, setNlExpanded] = useState(false);
  const [nlCheckLoading, setNlCheckLoading] = useState(false);

  // ─── Intake locale (en/es) ───────────────────────────────────
  const [locale, setLocale] = useState<Locale>("en");
  useEffect(() => {
    setLocale(readSavedLocale());
  }, []);
  function handleLocaleChange(next: Locale) {
    setLocale(next);
    saveLocale(next);
  }
  const t = (key: Parameters<typeof tIntake>[1]) => tIntake(locale, key);
  const tf = (
    key: Parameters<typeof tfIntake>[1],
    vars: Record<string, string | number>,
  ) => tfIntake(locale, key, vars);

  // Debounce the live duplicate check: fire 500ms after the last keystroke
  // once we have first name + last name + (email OR phone).
  // biome-ignore lint/correctness/useExhaustiveDependencies: scoped to form inputs
  useEffect(() => {
    if (!newLeadOpen) {
      setNlLivePreview([]);
      setNlExpanded(false);
      return;
    }
    if (!nlFirstName || !nlLastName) {
      setNlLivePreview([]);
      return;
    }
    if (!nlEmail && !nlPhone) {
      setNlLivePreview([]);
      return;
    }
    const handle = setTimeout(async () => {
      setNlCheckLoading(true);
      try {
        const results = await checkLeadDuplicates({
          firstName: nlFirstName,
          lastName: nlLastName,
          email: nlEmail || undefined,
          phone: nlPhone || undefined,
        });
        setNlLivePreview(results);
      } catch {
        setNlLivePreview([]);
      } finally {
        setNlCheckLoading(false);
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [nlFirstName, nlLastName, nlEmail, nlPhone, newLeadOpen]);

  // ─── Duplicate search dialog state ───────────────────────────
  const [dsFirstName, setDsFirstName] = useState("");
  const [dsLastName, setDsLastName] = useState("");
  const [dsEmail, setDsEmail] = useState("");
  const [dsPhone, setDsPhone] = useState("");
  const [dsResults, setDsResults] = useState<DuplicateMatchClient[] | null>(
    null,
  );

  function moveLeadToStage(
    leadId: string,
    fromStageId: string,
    toStageId: string,
  ) {
    if (fromStageId === toStageId) return;

    // Optimistic update across groups
    setGroups((prev) => {
      const next = prev.map((g) => ({
        ...g,
        stages: g.stages.map((s) => ({ ...s, leads: [...s.leads] })),
      }));
      let moving: ClientLead | undefined;
      for (const g of next) {
        for (const s of g.stages) {
          if (s.id === fromStageId) {
            const idx = s.leads.findIndex((l) => l.id === leadId);
            if (idx >= 0) {
              [moving] = s.leads.splice(idx, 1);
              break;
            }
          }
        }
        if (moving) break;
      }
      if (!moving) return prev;
      moving.pipelineStage = toStageId;
      for (const g of next) {
        for (const s of g.stages) {
          if (s.id === toStageId) {
            s.leads.unshift(moving);
          }
        }
      }
      return next;
    });

    startTransition(async () => {
      await updateLeadStage(leadId, toStageId);
    });
  }

  function handleStageChange(
    leadId: string,
    fromStageId: string,
    toStageId: string,
  ) {
    moveLeadToStage(leadId, fromStageId, toStageId);
  }

  // ─── Drag and drop ───────────────────────────────────────────
  function handleDragStart(e: React.DragEvent, leadId: string) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", leadId);
    setDraggedLeadId(leadId);
  }

  function handleDragEnd() {
    setDraggedLeadId(null);
    setDragOverStage(null);
  }

  function handleDragOver(e: React.DragEvent, stageId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stageId);
  }

  function handleDragLeave(e: React.DragEvent) {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setDragOverStage(null);
    }
  }

  function handleDrop(e: React.DragEvent, targetStageId: string) {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("text/plain");
    setDraggedLeadId(null);
    setDragOverStage(null);
    if (!leadId) return;

    let sourceStageId: string | null = null;
    for (const g of groups) {
      for (const s of g.stages) {
        if (s.leads.some((l) => l.id === leadId)) {
          sourceStageId = s.id;
          break;
        }
      }
      if (sourceStageId) break;
    }
    if (!sourceStageId) return;
    moveLeadToStage(leadId, sourceStageId, targetStageId);
  }

  // ─── Create lead flow (with duplicate check) ─────────────────
  async function handleCreateLead(forceCreate: boolean) {
    if (!nlFirstName || !nlLastName) return;
    setNlError(null);
    startTransition(async () => {
      const result = await createLead({
        firstName: nlFirstName,
        lastName: nlLastName,
        email: nlEmail || undefined,
        phone: nlPhone || undefined,
        source: nlSource,
        forceCreate,
        language: locale,
      });

      if (result.status === "duplicate_suspected") {
        setNlDuplicates(
          result.duplicates.map((d) => ({
            ...d,
            lead: {
              ...d.lead,
              createdAt:
                d.lead.createdAt instanceof Date
                  ? d.lead.createdAt.toISOString()
                  : d.lead.createdAt,
            },
          })),
        );
        return;
      }

      // Created — add to the New Inquiry stage optimistically.
      const newLead = result.lead;
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          stages: g.stages.map((s) =>
            s.id === (newLead.pipelineStage ?? "new_inquiry")
              ? {
                  ...s,
                  leads: [
                    {
                      id: newLead.id,
                      firstName: newLead.firstName,
                      lastName: newLead.lastName,
                      email: newLead.email,
                      phone: newLead.phone,
                      source: newLead.source,
                      createdAt: new Date().toISOString(),
                      notes: newLead.notes,
                      pipelineStage: newLead.pipelineStage ?? "new_inquiry",
                    },
                    ...s.leads,
                  ],
                }
              : s,
          ),
        })),
      );
      setNewLeadOpen(false);
      setNlFirstName("");
      setNlLastName("");
      setNlEmail("");
      setNlPhone("");
      setNlSource("website");
      setNlDuplicates([]);
    });
  }

  async function handleDuplicateSearch() {
    if (!dsFirstName && !dsLastName && !dsEmail && !dsPhone) {
      setDsResults([]);
      return;
    }
    startTransition(async () => {
      const matches = await searchDuplicateLeads({
        firstName: dsFirstName || undefined,
        lastName: dsLastName || undefined,
        email: dsEmail || undefined,
        phone: dsPhone || undefined,
      });
      setDsResults(
        matches.map((d) => ({
          ...d,
          lead: {
            ...d.lead,
            createdAt:
              d.lead.createdAt instanceof Date
                ? d.lead.createdAt.toISOString()
                : d.lead.createdAt,
          },
        })),
      );
    });
  }

  return (
    <>
      <PageHeader
        title="Leads"
        description="Lead pipeline and intake management."
        actions={
          <div className="flex items-center gap-2">
            <Dialog open={dupDialogOpen} onOpenChange={setDupDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <HugeiconsIcon
                    icon={SearchList02Icon}
                    size={16}
                    className="mr-1"
                  />
                  Find Duplicates
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Find Duplicate Leads</DialogTitle>
                  <DialogDescription>
                    Search by name, email, or phone to find possible duplicate
                    leads.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>First Name</Label>
                      <Input
                        value={dsFirstName}
                        onChange={(e) => setDsFirstName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Last Name</Label>
                      <Input
                        value={dsLastName}
                        onChange={(e) => setDsLastName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={dsEmail}
                        onChange={(e) => setDsEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Phone</Label>
                      <Input
                        type="tel"
                        value={dsPhone}
                        onChange={(e) => setDsPhone(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleDuplicateSearch}
                    disabled={isPending}
                  >
                    {isPending ? "Searching..." : "Search"}
                  </Button>
                  {dsResults !== null && (
                    <div className="border-t border-[#eaeaea] pt-3">
                      <h4 className="text-sm font-medium text-[#171717] mb-2">
                        {dsResults.length > 0
                          ? `${dsResults.length} potential match${dsResults.length === 1 ? "" : "es"}`
                          : "No duplicates found"}
                      </h4>
                      <div className="space-y-2 max-h-[280px] overflow-y-auto">
                        {dsResults.map((match) => (
                          <div
                            key={match.leadId}
                            className="flex items-center justify-between rounded-[6px] border border-[#eaeaea] bg-[#fafafa] p-3"
                          >
                            <div>
                              <Link
                                href={`/leads/${match.leadId}`}
                                className="text-sm font-medium text-[#171717] hover:underline"
                              >
                                {match.lead.firstName} {match.lead.lastName}
                              </Link>
                              <div className="text-xs text-[#666] mt-0.5">
                                {match.lead.email ?? "no email"} ·{" "}
                                {match.lead.phone ?? "no phone"}
                              </div>
                              <div className="text-xs text-[#666] mt-0.5">
                                {describeReason(match.matchReason)}
                              </div>
                            </div>
                            <Badge
                              className="text-xs"
                              style={{
                                backgroundColor:
                                  match.matchScore >= 90
                                    ? "#dc2626"
                                    : match.matchScore >= 70
                                      ? "#d97706"
                                      : "#1d72b8",
                                color: "white",
                              }}
                            >
                              {match.matchScore}%
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDupDialogOpen(false);
                      setDsResults(null);
                    }}
                  >
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={newLeadOpen}
              onOpenChange={(open) => {
                setNewLeadOpen(open);
                if (!open) {
                  setNlDuplicates([]);
                  setNlError(null);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <HugeiconsIcon
                    icon={PlusSignIcon}
                    size={16}
                    className="mr-1"
                  />
                  New Lead
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("formTitle")}</DialogTitle>
                  <DialogDescription>{t("formDescription")}</DialogDescription>
                </DialogHeader>

                {/* Language toggle (en / es) */}
                <div className="flex items-center justify-between -mb-1">
                  <span className="text-xs text-[#666]">
                    {t("languageLabel")}
                  </span>
                  <div className="inline-flex rounded-[6px] border border-[#eaeaea] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => handleLocaleChange("en")}
                      className={`px-3 py-1 text-xs transition-colors ${
                        locale === "en"
                          ? "bg-[#263c94] text-white"
                          : "bg-white text-[#666] hover:bg-[#fafafa]"
                      }`}
                      style={{ fontFamily: "'DM Sans', sans-serif" }}
                    >
                      {t("english")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLocaleChange("es")}
                      className={`px-3 py-1 text-xs transition-colors border-l border-[#eaeaea] ${
                        locale === "es"
                          ? "bg-[#263c94] text-white"
                          : "bg-white text-[#666] hover:bg-[#fafafa]"
                      }`}
                      style={{ fontFamily: "'DM Sans', sans-serif" }}
                    >
                      {t("spanish")}
                    </button>
                  </div>
                </div>

                {/* Live debounced duplicate warning (Wave 5 polish) */}
                {nlLivePreview.length > 0 && (
                  <div className="rounded-[6px] border border-[#263c94] bg-[#eef1fb] p-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => setNlExpanded((v) => !v)}
                      className="flex items-center gap-2 w-full text-left"
                    >
                      <HugeiconsIcon
                        icon={AlertCircleIcon}
                        size={16}
                        className="text-[#263c94]"
                      />
                      <span
                        className="text-sm font-medium text-[#171717]"
                        style={{ fontFamily: "'DM Sans', sans-serif" }}
                      >
                        {nlLivePreview.length === 1
                          ? t("duplicateWarningSingle")
                          : tf("duplicateWarningMany", {
                              count: nlLivePreview.length,
                            })}
                      </span>
                      <span className="ml-auto text-xs text-[#263c94]">
                        {nlExpanded ? "–" : "+"}
                      </span>
                    </button>
                    {nlExpanded && (
                      <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                        {nlLivePreview.map((m) => (
                          <div
                            key={m.leadId}
                            className="flex items-center justify-between gap-2 rounded-[4px] bg-white border border-[#eaeaea] px-2 py-1.5 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-medium text-[#171717] truncate">
                                {m.name}
                              </div>
                              <div className="text-[#666] truncate">
                                {m.lead.status} ·{" "}
                                {tf("daysAgo", { count: m.daysAgo })} ·{" "}
                                {tf("confidence", {
                                  percent: m.matchScore,
                                })}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Link
                                href={`/leads/${m.leadId}`}
                                className="px-2 py-1 rounded border border-[#eaeaea] text-[#263c94] hover:bg-[#fafafa]"
                              >
                                {t("viewLead")}
                              </Link>
                              <button
                                type="button"
                                onClick={() => {
                                  setNlDuplicates((prev) => [
                                    ...prev,
                                    {
                                      leadId: m.leadId,
                                      matchScore: m.matchScore,
                                      matchReason: m.matchReason,
                                      lead: {
                                        id: m.lead.id,
                                        firstName: m.lead.firstName,
                                        lastName: m.lead.lastName,
                                        email: m.lead.email,
                                        phone: m.lead.phone,
                                        createdAt:
                                          m.lead.createdAt instanceof Date
                                            ? m.lead.createdAt.toISOString()
                                            : m.lead.createdAt,
                                        pipelineStage: m.lead.pipelineStage,
                                        status: m.lead.status,
                                      },
                                    },
                                  ]);
                                }}
                                className="px-2 py-1 rounded border border-[#d97706] text-[#d97706] hover:bg-[#fffaf0]"
                              >
                                {t("markAsDuplicate")}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {nlCheckLoading && nlLivePreview.length === 0 && (
                  <p className="text-[11px] text-[#999]">…</p>
                )}

                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="nl-first">{t("firstName")}</Label>
                      <Input
                        id="nl-first"
                        value={nlFirstName}
                        onChange={(e) => setNlFirstName(e.target.value)}
                        placeholder={t("firstNamePlaceholder")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="nl-last">{t("lastName")}</Label>
                      <Input
                        id="nl-last"
                        value={nlLastName}
                        onChange={(e) => setNlLastName(e.target.value)}
                        placeholder={t("lastNamePlaceholder")}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nl-email">{t("email")}</Label>
                    <Input
                      id="nl-email"
                      type="email"
                      value={nlEmail}
                      onChange={(e) => setNlEmail(e.target.value)}
                      placeholder={t("emailPlaceholder")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nl-phone">{t("phone")}</Label>
                    <Input
                      id="nl-phone"
                      type="tel"
                      value={nlPhone}
                      onChange={(e) => setNlPhone(e.target.value)}
                      placeholder={t("phonePlaceholder")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("source")}</Label>
                    <Select value={nlSource} onValueChange={setNlSource}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (c) => c.toUpperCase())}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {nlDuplicates.length > 0 && (
                    <div className="rounded-[6px] border border-[#d97706] bg-[#fffaf0] p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <HugeiconsIcon
                          icon={AlertCircleIcon}
                          size={16}
                          className="text-[#d97706]"
                        />
                        <h4 className="text-sm font-medium text-[#171717]">
                          Possible duplicate{nlDuplicates.length > 1 ? "s" : ""}{" "}
                          detected
                        </h4>
                      </div>
                      <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                        {nlDuplicates.map((match) => (
                          <div
                            key={match.leadId}
                            className="flex items-center justify-between text-xs"
                          >
                            <div>
                              <Link
                                href={`/leads/${match.leadId}`}
                                className="font-medium text-[#171717] hover:underline"
                              >
                                {match.lead.firstName} {match.lead.lastName}
                              </Link>
                              <span className="text-[#666] ml-2">
                                {describeReason(match.matchReason)}
                              </span>
                            </div>
                            <Badge
                              className="text-xs"
                              style={{
                                backgroundColor:
                                  match.matchScore >= 90
                                    ? "#dc2626"
                                    : "#d97706",
                                color: "white",
                              }}
                            >
                              {match.matchScore}%
                            </Badge>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-[#666]">
                        Click "Create Anyway" to acknowledge and create this
                        lead.
                      </p>
                    </div>
                  )}
                  {nlError && (
                    <p className="text-xs text-[#dc2626]">{nlError}</p>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setNewLeadOpen(false)}
                  >
                    {t("cancel")}
                  </Button>
                  {nlDuplicates.length > 0 ? (
                    <Button
                      onClick={() => handleCreateLead(true)}
                      disabled={isPending}
                    >
                      {isPending ? t("creating") : "Create Anyway"}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleCreateLead(false)}
                      disabled={!nlFirstName || !nlLastName || isPending}
                    >
                      {isPending ? t("creating") : t("createLead")}
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div ref={pipelineRef} className="space-y-6">
        {groups.map((group) => (
          <section key={group.id}>
            {/* Group header */}
            <div
              className="flex items-center gap-2 mb-3 rounded-[6px] px-3 py-2"
              style={{
                backgroundColor: `${group.color}10`,
                borderLeft: `3px solid ${group.color}`,
              }}
            >
              <h2
                className="text-sm font-semibold"
                style={{ color: group.color }}
              >
                {group.label}
              </h2>
              <span className="text-xs text-[#666]">
                {group.stages.reduce((sum, s) => sum + s.leads.length, 0)} leads
              </span>
            </div>

            {/* Stages row */}
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {group.stages.map((stage) => (
                <div
                  key={stage.id}
                  data-stage={stage.id}
                  className={`w-[260px] shrink-0 rounded-[6px] border border-[#eaeaea] bg-[#fafafa] p-3 transition-colors duration-200 ${
                    dragOverStage === stage.id ? "border-[#999]" : ""
                  }`}
                  onDragOver={(e) => handleDragOver(e, stage.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, stage.id)}
                >
                  {/* Stage header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: stage.color }}
                      />
                      <h3 className="text-xs font-medium text-[#171717] truncate">
                        {stage.label}
                      </h3>
                    </div>
                    <span className="text-xs text-[#666] shrink-0">
                      {stage.leads.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="space-y-2">
                    {stage.leads.map((lead) => (
                      <Card
                        key={lead.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead.id)}
                        onDragEnd={handleDragEnd}
                        className={`border-[#eaeaea] bg-white transition-colors duration-200 hover:border-[#999] cursor-grab active:cursor-grabbing ${
                          draggedLeadId === lead.id ? "opacity-50" : ""
                        }`}
                      >
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between">
                            <Link
                              href={`/leads/${lead.id}`}
                              className="text-sm font-medium text-[#171717] hover:underline"
                            >
                              {lead.firstName} {lead.lastName}
                            </Link>
                            <span className="text-xs text-[#666]">
                              {formatRelative(lead.createdAt)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-[#666]">
                            {lead.email && (
                              <span className="flex items-center gap-1 truncate max-w-full">
                                <HugeiconsIcon icon={Mail01Icon} size={12} />
                                <span className="truncate">{lead.email}</span>
                              </span>
                            )}
                            {lead.phone && (
                              <span className="flex items-center gap-1">
                                <HugeiconsIcon icon={Call02Icon} size={12} />
                                {lead.phone}
                              </span>
                            )}
                          </div>
                          {lead.source && (
                            <Badge
                              variant="outline"
                              className="text-xs border-[#eaeaea] text-[#666]"
                            >
                              {lead.source}
                            </Badge>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Select
                              value={stage.id}
                              onValueChange={(val) =>
                                handleStageChange(lead.id, stage.id, val)
                              }
                            >
                              <SelectTrigger className="h-7 text-xs flex-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="max-h-[300px]">
                                {allStages.map((s) => (
                                  <SelectItem
                                    key={s.id}
                                    value={s.id}
                                    className="text-xs"
                                  >
                                    {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!stage.isTerminal && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 shrink-0"
                                title="Advance"
                                onClick={() => {
                                  // Advance to the defaultNext stage if any
                                  const nextStage = allStages.find(
                                    (s) => s.order > stage.order,
                                  );
                                  if (nextStage) {
                                    handleStageChange(
                                      lead.id,
                                      stage.id,
                                      nextStage.id,
                                    );
                                  }
                                }}
                              >
                                <HugeiconsIcon
                                  icon={ArrowRight01Icon}
                                  size={12}
                                />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {stage.leads.length === 0 && (
                      <div className="rounded-[6px] border border-dashed border-[#eaeaea] p-4 text-center">
                        <p className="text-xs text-[#666]">
                          {dragOverStage === stage.id ? "Drop here" : "Empty"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
