import Link from "next/link";
import { and, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { cases } from "@/db/schema";
import { logger } from "@/lib/logger/server";
import { COLORS, PERSONA_ACCENTS } from "@/lib/design-tokens";
import { Card, CardContent } from "@/components/ui/card";
import { StatHero } from "@/components/dashboard/primitives/stat-hero";
import { TriageCard } from "@/components/dashboard/primitives/triage-card";
import type { SessionUser } from "@/lib/auth/session";

type Props = { actor: SessionUser };
const accent = PERSONA_ACCENTS.phi_sheet_writer.accent;
const canvas = "#FAF6EB"; // warm paper

// ── Loaders ────────────────────────────────────────────────────────────────

async function loadHeroStats(orgId: string) {
  const now = new Date();
  const fourteenOut = new Date(now.getTime() + 14 * 86400000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  try {
    const [assignedRow, completedThisMonth, wonRow, totalDecidedRow] = await Promise.all([
      db
        .select({ n: count() })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, orgId),
            isNull(cases.deletedAt),
            inArray(cases.phiSheetStatus, ["assigned", "in_progress"]),
            gte(cases.hearingDate, now),
            lte(cases.hearingDate, fourteenOut),
          ),
        ),
      db
        .select({ n: count() })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, orgId),
            isNull(cases.deletedAt),
            eq(cases.phiSheetStatus, "complete"),
            gte(cases.phiSheetCompletedAt, thirtyDaysAgo),
          ),
        ),
      db
        .select({ n: count() })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, orgId),
            isNull(cases.deletedAt),
            eq(cases.status, "closed_won"),
            gte(cases.closedAt, thirtyDaysAgo),
            eq(cases.phiSheetStatus, "complete"),
          ),
        ),
      db
        .select({ n: count() })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, orgId),
            isNull(cases.deletedAt),
            inArray(cases.status, ["closed_won", "closed_lost"]),
            gte(cases.closedAt, thirtyDaysAgo),
            eq(cases.phiSheetStatus, "complete"),
          ),
        ),
    ]);
    const decided = totalDecidedRow[0]?.n ?? 0;
    return {
      assignedNext14: assignedRow[0]?.n ?? 0,
      drafted30d: completedThisMonth[0]?.n ?? 0,
      attorneyWin: decided > 0 ? Math.round(((wonRow[0]?.n ?? 0) / decided) * 100) : null,
    };
  } catch (e) {
    logger.error("phi writer hero failed", { error: e, orgId });
    return { assignedNext14: 0, drafted30d: 0, attorneyWin: null };
  }
}

async function loadDossierStack(orgId: string) {
  const now = new Date();
  const fourteenOut = new Date(now.getTime() + 14 * 86400000);
  try {
    const rows = await db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        hearingDate: cases.hearingDate,
        phiSheetStatus: cases.phiSheetStatus,
        adminLawJudge: cases.adminLawJudge,
      })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          isNull(cases.deletedAt),
          inArray(cases.phiSheetStatus, ["unassigned", "assigned", "in_progress", "in_review"]),
          gte(cases.hearingDate, now),
          lte(cases.hearingDate, fourteenOut),
        ),
      )
      .orderBy(cases.hearingDate)
      .limit(8);
    return rows;
  } catch (e) {
    logger.error("phi writer dossier failed", { error: e });
    return [];
  }
}

function daysUntil(d: Date | null): number {
  if (!d) return 999;
  return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000));
}

// ── Component ──────────────────────────────────────────────────────────────

export async function PhiSheetWriterDashboard({ actor }: Props) {
  const [hero, dossier] = await Promise.all([
    loadHeroStats(actor.organizationId),
    loadDossierStack(actor.organizationId),
  ]);

  return (
    <div className="space-y-6">
      {/* Hero — editorial masthead with brass accent */}
      <div
        className="rounded-[14px] border p-8 dash-fade-up"
        style={{
          background: canvas,
          borderColor: accent + "33",
          fontFamily: "Georgia, 'Source Serif 4', serif",
        }}
      >
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <div>
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-2"
              style={{ color: accent, fontFamily: "system-ui" }}
            >
              The Writer's Desk
            </div>
            <div
              className="font-semibold leading-none tabular-nums"
              style={{ fontSize: 64, letterSpacing: "-0.02em", color: COLORS.text1 }}
            >
              {hero.drafted30d} sheets · {hero.attorneyWin !== null ? `${hero.attorneyWin}% win` : "—"}
            </div>
            <p
              className="mt-3 text-[14px]"
              style={{ color: COLORS.text2, fontFamily: "system-ui", maxWidth: 460 }}
            >
              Drafted in the last 30 days. Win rate measured on hearings that
              concluded with one of your sheets in the file.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.10em] opacity-70" style={{ color: accent, fontFamily: "system-ui" }}>
              Assigned · Next 14 Days
            </div>
            <div
              className="text-[64px] font-semibold tabular-nums leading-none"
              style={{ color: COLORS.text1 }}
            >
              {hero.assignedNext14}
            </div>
          </div>
        </div>
      </div>

      {/* Dossier stack */}
      <section>
        <h2
          className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
          style={{ color: COLORS.text2 }}
        >
          The Stack · Next 14 days
        </h2>
        {dossier.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-[13px]" style={{ color: COLORS.text2 }}>
              No assigned sheets within 14 days. Use the time to revisit recent rejected drafts.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {dossier.map((d) => {
              const days = daysUntil(d.hearingDate);
              const tone =
                days <= 3 ? "bad" : days <= 7 ? "warn" : "info";
              const statusLabel =
                d.phiSheetStatus === "complete"
                  ? "Done"
                  : d.phiSheetStatus === "in_review"
                    ? "In review"
                    : d.phiSheetStatus === "in_progress"
                      ? "Drafting"
                      : "Assigned";
              return (
                <TriageCard
                  key={d.id}
                  avatar={(d.caseNumber ?? "??").slice(-2)}
                  avatarColor={accent}
                  title={`Case ${d.caseNumber ?? "—"}`}
                  subtitle={d.adminLawJudge ?? "ALJ TBD"}
                  meta={`hearing in ${days}d`}
                  tags={[
                    { label: statusLabel, tone: tone as "bad" | "warn" | "info" },
                  ]}
                  countdownPercent={Math.max(5, 100 - (days / 14) * 100)}
                  countdownLabel={`${days}d`}
                  accent={accent}
                  actions={[
                    {
                      label: "Open dossier",
                      variant: "primary",
                      href: `/phi-writer/${d.id}`,
                    },
                    { label: "AI draft", variant: "ghost" },
                  ]}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/phi-writer"
          className="block rounded-[10px] border p-4 hover:border-[#999] transition-colors"
          style={{ borderColor: accent + "33", background: "#fff" }}
        >
          <div className="text-[14px] font-semibold" style={{ color: COLORS.text1 }}>
            Open the writer's queue
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: COLORS.text2 }}>
            All assigned sheets sorted by hearing date
          </div>
        </Link>
        <Link
          href="/phi-writer?filter=ai_drafts"
          className="block rounded-[10px] border p-4 hover:border-[#999] transition-colors"
          style={{ borderColor: accent + "33", background: "#fff" }}
        >
          <div className="text-[14px] font-semibold" style={{ color: COLORS.text1 }}>
            Triage AI drafts
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: COLORS.text2 }}>
            Polish or reject the AI's suggestions
          </div>
        </Link>
      </div>
    </div>
  );
}
