"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COLORS } from "@/lib/design-tokens";
import type { AttorneySubnavData } from "@/lib/dashboard-subnav/types";
import {
  logHearingOutcome,
  getLoggableHearingCases,
  type HearingOutcomeValue,
  type LoggableHearingCase,
} from "@/app/actions/hearings";

export function AttorneySubnav({ data }: { data: AttorneySubnavData }) {
  const next = data.nextHearing;
  const [outcomeOpen, setOutcomeOpen] = useState(false);

  return (
    <SubnavShell title="My Docket">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <SubnavActionGrid
        actions={[
          {
            label: "Next hearing",
            href: next?.caseId ? `/hearings/${next.caseId}` : "/hearings",
          },
          { label: "Generate brief", href: "/drafts?type=brief" },
          { label: "Look up ALJ", href: "/reports/alj-stats" },
          {
            label: "Log outcome",
            onClick: () => setOutcomeOpen(true),
          },
        ]}
      />

      {/* Anchor: Next Hearing Prep Strip */}
      <SubnavSectionLabel>Next Hearing</SubnavSectionLabel>
      <SubnavAnchorBlock>
        {next ? (
          <>
            {/* Countdown dominates — 28px so it reads at a glance */}
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: COLORS.text1,
                letterSpacing: "-0.04em",
                lineHeight: 1,
                marginBottom: 4,
              }}
            >
              {next.countdown}
            </div>
            {/* Compact meta — case + ALJ on one line each, muted */}
            <div
              style={{
                fontSize: 11,
                color: COLORS.text2,
                marginBottom: 2,
                lineHeight: 1.3,
              }}
            >
              Case {next.caseNumber ?? "—"}
            </div>
            {next.alj && (
              <div
                style={{
                  fontSize: 11,
                  color: COLORS.text2,
                  marginBottom: 8,
                  lineHeight: 1.3,
                }}
              >
                ALJ {next.alj}
              </div>
            )}
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 3 }}>
              {next.prepCheckList.map((item, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    color: item.ok ? COLORS.text2 : COLORS.text1,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: item.ok ? COLORS.emerald : "transparent",
                      border: `1.5px solid ${item.ok ? COLORS.emerald : COLORS.warn}`,
                      flexShrink: 0,
                    }}
                  />
                  <span>{item.label}</span>
                  {!item.ok && (
                    <Link
                      href={next.caseId ? `/hearings/${next.caseId}` : "/hearings"}
                      style={{
                        marginLeft: "auto",
                        fontSize: 10,
                        color: COLORS.brand,
                        textDecoration: "none",
                      }}
                    >
                      Fix →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div style={{ fontSize: 12, color: COLORS.text2 }}>
            No upcoming hearings in the next 7 days.
          </div>
        )}
      </SubnavAnchorBlock>

      <SubnavSectionLabel>This Week</SubnavSectionLabel>
      <SubnavStatRow label="Hearings (next 7d)" value={data.hearingsThisWeek} href="/hearings" />

      <SubnavSectionLabel>Recent</SubnavSectionLabel>
      <SubnavRecentList items={data.recentFeed} />

      <LogOutcomeDialog
        open={outcomeOpen}
        onOpenChange={setOutcomeOpen}
        defaultCaseId={next?.caseId ?? null}
        defaultAlj={next?.alj ?? null}
      />
    </SubnavShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Log outcome dialog
// ─────────────────────────────────────────────────────────────

const HEARING_OUTCOMES: Array<{
  value: HearingOutcomeValue;
  label: string;
  helper: string;
}> = [
  {
    value: "fully_favorable",
    label: "Fully favorable",
    helper: "ALJ granted all requested relief.",
  },
  {
    value: "partially_favorable",
    label: "Partially favorable",
    helper: "Onset adjusted or period limited.",
  },
  {
    value: "unfavorable",
    label: "Unfavorable",
    helper: "Denied — AC appeal window begins.",
  },
  {
    value: "dismissed",
    label: "Dismissed",
    helper: "Dismissed on procedural grounds.",
  },
  {
    value: "case_closed",
    label: "Case closed",
    helper: "Withdrawn / closed post-hearing.",
  },
];

function LogOutcomeDialog({
  open,
  onOpenChange,
  defaultCaseId,
  defaultAlj,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  defaultCaseId: string | null;
  defaultAlj: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cases, setCases] = useState<LoggableHearingCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCase, setSelectedCase] = useState<string>(defaultCaseId ?? "");
  const [outcome, setOutcome] = useState<HearingOutcomeValue>("fully_favorable");
  const [alj, setAlj] = useState<string>(defaultAlj ?? "");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setNotes("");
    setOutcome("fully_favorable");
    setAlj(defaultAlj ?? "");
    getLoggableHearingCases()
      .then((rows) => {
        setCases(rows);
        if (defaultCaseId && rows.some((r) => r.caseId === defaultCaseId)) {
          setSelectedCase(defaultCaseId);
        } else if (rows.length > 0) {
          setSelectedCase(rows[0].caseId);
          if (!defaultAlj && rows[0].aljName) setAlj(rows[0].aljName);
        }
      })
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, [open, defaultCaseId, defaultAlj]);

  // Prefill ALJ when user switches case
  useEffect(() => {
    if (!selectedCase) return;
    const match = cases.find((c) => c.caseId === selectedCase);
    if (match?.aljName && !alj) setAlj(match.aljName);
  }, [selectedCase, cases, alj]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCase) {
      toast.error("Pick a case.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await logHearingOutcome(
          selectedCase,
          outcome,
          notes.trim() || undefined,
          alj.trim() || undefined,
        );
        if (!result.success) {
          toast.error(result.message ?? "Could not log outcome");
          return;
        }
        toast.success(`Outcome logged: ${outcome.replace(/_/g, " ")}`);
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not log outcome",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log hearing outcome</DialogTitle>
          <DialogDescription>
            Record the ALJ&apos;s decision. Terminal outcomes advance the
            case stage automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="attorney-outcome-case">Case</Label>
            {loading ? (
              <div className="text-sm text-muted-foreground">
                Loading recent hearings…
              </div>
            ) : cases.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No recent hearings on file.
              </div>
            ) : (
              <Select value={selectedCase} onValueChange={setSelectedCase}>
                <SelectTrigger id="attorney-outcome-case">
                  <SelectValue placeholder="Pick a case…" />
                </SelectTrigger>
                <SelectContent>
                  {cases.map((c) => (
                    <SelectItem key={c.caseId} value={c.caseId}>
                      {c.caseNumber} — {c.claimantName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="attorney-outcome-value">Outcome</Label>
            <Select
              value={outcome}
              onValueChange={(v) => setOutcome(v as HearingOutcomeValue)}
            >
              <SelectTrigger id="attorney-outcome-value">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HEARING_OUTCOMES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {HEARING_OUTCOMES.find((o) => o.value === outcome)?.helper}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="attorney-outcome-alj">ALJ name (optional)</Label>
            <Input
              id="attorney-outcome-alj"
              placeholder="e.g. Judge Susan Smith"
              value={alj}
              onChange={(e) => setAlj(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="attorney-outcome-notes">Notes (optional)</Label>
            <Textarea
              id="attorney-outcome-notes"
              rows={3}
              placeholder="Key facts, credibility notes, next steps…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || loading || cases.length === 0}
              style={{ backgroundColor: COLORS.brand }}
            >
              {isPending ? "Saving…" : "Log outcome"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
