"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  SubnavShell,
  SubnavSectionLabel,
  SubnavActionGrid,
  SubnavStatRow,
  SubnavRecentList,
  SubnavAnchorBlock,
} from "./_primitives";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { markOldestPhiSheetCompleteAction } from "@/app/actions/dashboard-quick-actions";
import {
  createPreHearingBriefDraft,
  listUpcomingHearingCases,
  type HearingCasePickerRow,
} from "@/app/actions/ai-drafts";
import { COLORS } from "@/lib/design-tokens";
import type { PreHearingPrepSubnavData } from "@/lib/dashboard-subnav/types";

export function PreHearingPrepSubnav({
  data,
}: {
  data: PreHearingPrepSubnavData;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <SubnavShell title="Pit Stand">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <div className="ttn-quick-actions">
        <DialogTriggerButton
          label="Generate AI draft"
          onClick={() => setDialogOpen(true)}
        />
      </div>
      <SubnavActionGrid
        actions={[
          { label: "Open next brief", href: "/phi-writer" },
          { label: "Side-by-side chrono", href: "/phi-writer?layout=split" },
          {
            label: "Mark prep complete",
            onAction: markOldestPhiSheetCompleteAction,
          },
        ]}
      />

      <GeneratePreHearingBriefDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <SubnavSectionLabel>This Week</SubnavSectionLabel>
      <SubnavStatRow
        label="Briefs sent"
        value={data.briefsThisWeek}
        href="/phi-writer"
      />
      {data.heaviestCaseDays !== null && (
        <SubnavStatRow
          label="Heaviest case in"
          value={`${data.heaviestCaseDays}d`}
          tone={
            data.heaviestCaseDays <= 3
              ? "bad"
              : data.heaviestCaseDays <= 7
                ? "warn"
                : "default"
          }
        />
      )}

      {/* Anchor: Per-attorney revision-rate leaderboard */}
      <SubnavSectionLabel>Attorney Revision Rates</SubnavSectionLabel>
      <SubnavAnchorBlock label="Who needs extra polish">
        {data.attorneyRevisionRates.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.text2 }}>
            No active attorney pairings within the 14-day window.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
            {data.attorneyRevisionRates.map((a) => {
              const total = a.inReview + a.completed;
              const pct = total > 0 ? Math.round((a.inReview / total) * 100) : 0;
              const tone =
                pct >= 50 ? COLORS.bad : pct >= 25 ? COLORS.warn : COLORS.emeraldDeep;
              return (
                <li
                  key={a.attorney}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      color: COLORS.text1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.attorney}
                  </span>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 10,
                      color: COLORS.text3,
                    }}
                  >
                    {a.completed} done
                  </span>
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                      color: tone,
                      minWidth: 32,
                      textAlign: "right",
                    }}
                  >
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SubnavAnchorBlock>

      <SubnavSectionLabel>Recently Sent</SubnavSectionLabel>
      <SubnavRecentList items={data.recentSent} />
    </SubnavShell>
  );
}

function DialogTriggerButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="ttn-quick-action-btn" onClick={onClick}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="14"
        height="14"
      >
        <path
          d="M9 5l7 7-7 7"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </svg>
      <span>{label}</span>
    </button>
  );
}

function GeneratePreHearingBriefDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<HearingCasePickerRow[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [isGenerating, startGenerating] = useTransition();

  async function loadCandidates() {
    setLoading(true);
    try {
      const rows = await listUpcomingHearingCases(14);
      setCandidates(rows);
      setSelectedCaseId(rows[0]?.caseId ?? "");
    } catch {
      toast.error("Failed to load upcoming hearings");
    } finally {
      setLoading(false);
    }
  }

  function handleGenerate() {
    if (!selectedCaseId) return;
    startGenerating(async () => {
      const result = await createPreHearingBriefDraft({
        caseId: selectedCaseId,
      });
      if (result.success && result.draftId) {
        toast.success(result.message ?? "Draft created", {
          action: {
            label: "Open",
            onClick: () => router.push(`/drafts/${result.draftId}`),
          },
        });
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.message ?? "Draft generation failed");
      }
    });
  }

  const selected = candidates.find((c) => c.caseId === selectedCaseId);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) {
          void loadCandidates();
        } else {
          setSelectedCaseId("");
          setCandidates([]);
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate pre-hearing brief</DialogTitle>
          <DialogDescription>
            Pick a case with a hearing within the next 14 days. A templated
            brief draft will be created and assigned to the case's primary
            reviewer for refinement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading hearings…</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hearings scheduled in the next 14 days.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Upcoming hearing</Label>
                <Select
                  value={selectedCaseId}
                  onValueChange={setSelectedCaseId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a case" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((c) => (
                      <SelectItem key={c.caseId} value={c.caseId}>
                        {c.claimantName} ({c.caseNumber})
                        {c.daysUntilHearing !== null
                          ? ` · hearing in ${c.daysUntilHearing}d`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selected && selected.hearingDate && (
                  <p className="text-xs text-muted-foreground">
                    Hearing date:{" "}
                    {new Date(selected.hearingDate).toLocaleString("en-US", {
                      dateStyle: "full",
                      timeStyle: "short",
                    })}
                  </p>
                )}
              </div>

              <div className="rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
                Creates an <span className="font-mono">ai_drafts</span> row
                with <span className="font-mono">type=pre_hearing_brief</span>.
                Template-only scaffold — the reviewer refines in the drafts
                inbox. Real LLM generation is pending integration.
                <div className="mt-2">
                  See{" "}
                  <Link
                    href="/drafts"
                    className="underline text-foreground"
                    onClick={() => onOpenChange(false)}
                  >
                    Drafts inbox
                  </Link>
                  .
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!selectedCaseId || isGenerating || loading}
          >
            {isGenerating ? "Generating…" : "Generate draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
