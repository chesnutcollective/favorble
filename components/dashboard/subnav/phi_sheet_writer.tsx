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
  createPhiSheetDraft,
  listCasesNeedingPhiSheet,
  type PhiSheetCasePickerRow,
} from "@/app/actions/ai-drafts";
import { COLORS } from "@/lib/design-tokens";
import type { PhiSheetWriterSubnavData } from "@/lib/dashboard-subnav/types";

export function PhiSheetWriterSubnav({
  data,
}: {
  data: PhiSheetWriterSubnavData;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <SubnavShell title="The Bench">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <div className="ttn-quick-actions">
        <DialogTriggerButton
          label="Generate AI draft"
          onClick={() => setDialogOpen(true)}
        />
      </div>
      <SubnavActionGrid
        actions={[
          { label: "Pick next sheet", href: "/phi-writer" },
          { label: "Side-by-side", href: "/phi-writer?layout=split" },
          {
            label: "Mark oldest complete",
            onAction: markOldestPhiSheetCompleteAction,
          },
        ]}
      />

      <GeneratePhiSheetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      {/* Anchor: Silent-rewrite alerts (the editor's reality check) */}
      <SubnavSectionLabel>Silent Rewrites</SubnavSectionLabel>
      <SubnavAnchorBlock label="Sheets the attorney quietly rewrote">
        {data.silentRewriteCount === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.emeraldDeep }}>
            No silent rewrites detected. Your drafts stuck.
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: COLORS.warn,
                  fontFamily: "Georgia, serif",
                  lineHeight: 1,
                }}
              >
                {data.silentRewriteCount}
              </span>
              <span style={{ fontSize: 11, color: COLORS.text2 }}>
                returned to review · last 30d
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: COLORS.text2,
                fontStyle: "italic",
              }}
            >
              The honest quality metric. Each one is a learning moment.
            </div>
          </>
        )}
      </SubnavAnchorBlock>

      <SubnavSectionLabel>This Week</SubnavSectionLabel>
      <SubnavStatRow label="Sheets drafted" value={data.sheetsThisWeek} href="/phi-writer" />

      {data.attorneyPairings.length > 0 && (
        <>
          <SubnavSectionLabel>Attorney Pairings · 30d</SubnavSectionLabel>
          <div style={{ padding: "0 12px 8px", display: "grid", gap: 4 }}>
            {data.attorneyPairings.map((p) => (
              <div
                key={p.attorney}
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
                  {p.attorney}
                </span>
                <span style={{ color: COLORS.text3, fontVariantNumeric: "tabular-nums" }}>
                  {p.sheetsCount}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <SubnavSectionLabel>Recently Approved</SubnavSectionLabel>
      <SubnavRecentList items={data.recentApproved} />
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

function GeneratePhiSheetDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<PhiSheetCasePickerRow[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [isGenerating, startGenerating] = useTransition();

  async function loadCandidates() {
    setLoading(true);
    try {
      const rows = await listCasesNeedingPhiSheet(50);
      setCandidates(rows);
      setSelectedCaseId(rows[0]?.caseId ?? "");
    } catch {
      toast.error("Failed to load cases needing PHI sheets");
    } finally {
      setLoading(false);
    }
  }

  function handleGenerate() {
    if (!selectedCaseId) return;
    startGenerating(async () => {
      const result = await createPhiSheetDraft({
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
          <DialogTitle>Generate PHI sheet draft</DialogTitle>
          <DialogDescription>
            Pick a case that needs a pre-hearing intelligence sheet. A
            templated draft will be created and assigned to the case's
            reviewer for refinement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading cases…</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No cases currently need a PHI sheet.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Case needing PHI sheet</Label>
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
                        {c.claimantName} ({c.caseNumber}) · {c.phiSheetStatus}
                        {c.daysUntilHearing !== null
                          ? ` · hearing in ${c.daysUntilHearing}d`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selected && (
                  <p className="text-xs text-muted-foreground">
                    Status: {selected.phiSheetStatus}
                    {selected.hearingDate
                      ? ` · hearing ${new Date(
                          selected.hearingDate,
                        ).toLocaleDateString("en-US")}`
                      : ""}
                  </p>
                )}
              </div>

              <div className="rounded-md border border-border bg-muted p-3 text-xs text-muted-foreground">
                Creates an <span className="font-mono">ai_drafts</span> row
                with <span className="font-mono">type=phi_sheet</span>.
                Template scaffold — the reviewer refines the draft in the
                drafts inbox. Real LLM generation is pending integration.
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
