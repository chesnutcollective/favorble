import Link from "next/link";
import { and, count, desc, eq, gte, isNull, lte } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { cases } from "@/db/schema";
import { logger } from "@/lib/logger/server";
import { COLORS, PERSONA_ACCENTS } from "@/lib/design-tokens";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardEmptyState } from "@/components/dashboard/empty-state";
import { ProgressRing } from "@/components/dashboard/charts/progress-ring";
import {
  HeatmapMatrix,
  type HeatmapCell,
} from "@/components/dashboard/charts/heatmap-matrix";
import type { SessionUser } from "@/lib/auth/session";

type Props = { actor: SessionUser };
const accent = PERSONA_ACCENTS.pre_hearing_prep.accent;

// ── Loaders ────────────────────────────────────────────────────────────────

async function loadHearingMatrix(orgId: string) {
  const now = new Date();
  const fourteenOut = new Date(now.getTime() + 14 * 86400000);
  try {
    const rows = await db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        hearingDate: cases.hearingDate,
        phiSheetStatus: cases.phiSheetStatus,
        mrStatus: cases.mrStatus,
        adminLawJudge: cases.adminLawJudge,
      })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
          gte(cases.hearingDate, now),
          lte(cases.hearingDate, fourteenOut),
        ),
      )
      .orderBy(cases.hearingDate)
      .limit(15);
    return rows;
  } catch (e) {
    logger.error("pre-hearing matrix failed", { error: e, orgId });
    return [];
  }
}

function daysUntil(d: Date | null): number {
  if (!d) return 999;
  return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000));
}

function readinessScore(c: {
  phiSheetStatus: string | null;
  mrStatus: string | null;
}): number {
  let score = 0;
  if (c.phiSheetStatus === "complete") score += 50;
  else if (c.phiSheetStatus === "in_review" || c.phiSheetStatus === "in_progress") score += 30;
  if (c.mrStatus === "complete") score += 50;
  else if (c.mrStatus === "in_progress") score += 25;
  return score;
}

// ── Component ──────────────────────────────────────────────────────────────

export async function PreHearingPrepDashboard({ actor }: Props) {
  const hearings = await loadHearingMatrix(actor.organizationId);
  const totalReady = hearings.filter((h) => readinessScore(h) >= 90).length;
  const overallPct =
    hearings.length === 0
      ? 100
      : Math.round((totalReady / hearings.length) * 100);
  const heaviest = hearings[0]; // soonest hearing

  // Build matrix cells: rows = hearings, cols = [Days, PHI, MR]
  const cells: HeatmapCell[][] = hearings.map((h) => {
    const days = daysUntil(h.hearingDate);
    return [
      {
        intensity: 1 - days / 14,
        display: `${days}d`,
        state: days <= 3 ? "bad" : days <= 7 ? "warn" : undefined,
        tooltip: `Hearing in ${days} days`,
      },
      {
        intensity: h.phiSheetStatus === "complete" ? 0 : 1,
        display: h.phiSheetStatus ?? "—",
        state: h.phiSheetStatus === "complete" ? "ok" : days <= 7 ? "bad" : "warn",
      },
      {
        intensity: h.mrStatus === "complete" ? 0 : 1,
        display: h.mrStatus ?? "—",
        state: h.mrStatus === "complete" ? "ok" : days <= 7 ? "bad" : "warn",
      },
    ];
  });

  return (
    <div className="space-y-6">
      {/* Hero — F1 pit-lane countdown */}
      <div
        className="rounded-[14px] p-8 dash-fade-up"
        style={{
          background: "linear-gradient(135deg, #0E1633 0%, #1a2240 100%)",
          color: "#F5F5F7",
        }}
      >
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70 mb-2">
              Race Week · 14-Day Window
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <div
                className="font-semibold leading-none tabular-nums"
                style={{ fontSize: 84, color: accent, letterSpacing: "-0.04em" }}
              >
                {totalReady}
              </div>
              <div className="text-[18px] opacity-80">
                of {hearings.length} hearings race-ready
              </div>
            </div>
            {heaviest && (
              <div className="text-[14px] opacity-70 mt-3">
                Pole position: Case {heaviest.caseNumber ?? "—"} · hearing in {daysUntil(heaviest.hearingDate)}d ·{" "}
                {heaviest.adminLawJudge ?? "ALJ TBD"}
              </div>
            )}
          </div>
          <ProgressRing
            value={overallPct}
            size={120}
            strokeWidth={10}
            // Persona `accent` is dark navy and the hero background is a
            // dark-navy gradient — the ring would be invisible. Use the
            // emerald highlight so the filled arc stays readable.
            color={COLORS.emerald}
            trackColor="rgba(255,255,255,0.25)"
            centerLabel={`${overallPct}%`}
            centerSubtitle="prep"
          />
        </div>
      </div>

      {/* Hearing prep readiness matrix */}
      <Card>
        <CardContent className="p-5">
          <h3
            className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
            style={{ color: COLORS.text2 }}
          >
            Hearing Prep Readiness · Next 14 Days
          </h3>
          {hearings.length === 0 ? (
            <DashboardEmptyState
              icon="🏁"
              title="Pit stand idle"
              body="No hearings in the next 14 days. Scrub up: review the chronology library, check for AI-drafts you can polish ahead."
              action={{ label: "Open writer queue", href: "/phi-writer" }}
              accent={accent}
            />
          ) : (
            <HeatmapMatrix
              rowLabels={hearings.map((h) => `#${h.caseNumber ?? "??"}`)}
              colLabels={["Days", "PHI Sheet", "Medical Records"]}
              cells={cells}
              cellSize={120}
              cellGap={3}
              showValues
            />
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/phi-writer"
          className="block rounded-[10px] border p-4 hover:border-[#999] transition-colors"
          style={{ borderColor: COLORS.borderDefault, background: "#fff" }}
        >
          <div className="text-[14px] font-semibold" style={{ color: COLORS.text1 }}>
            Open PHI Writer Queue
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: COLORS.text2 }}>
            Sheets and briefs by hearing date
          </div>
        </Link>
        <Link
          href="/hearings"
          className="block rounded-[10px] border p-4 hover:border-[#999] transition-colors"
          style={{ borderColor: COLORS.borderDefault, background: "#fff" }}
        >
          <div className="text-[14px] font-semibold" style={{ color: COLORS.text1 }}>
            Open hearings workspace
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: COLORS.text2 }}>
            Full prep checklist per hearing
          </div>
        </Link>
        <Link
          href="/medical-records"
          className="block rounded-[10px] border p-4 hover:border-[#999] transition-colors"
          style={{ borderColor: COLORS.borderDefault, background: "#fff" }}
        >
          <div className="text-[14px] font-semibold" style={{ color: COLORS.text1 }}>
            Chase missing records
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: COLORS.text2 }}>
            MR completeness by hearing date
          </div>
        </Link>
      </div>
    </div>
  );
}
