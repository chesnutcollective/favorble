import Link from "next/link";
import { and, count, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db/drizzle";
import {
  cases,
  providerCredentials,
  rfcRequests,
} from "@/db/schema";
import { logger } from "@/lib/logger/server";
import { COLORS, PERSONA_ACCENTS } from "@/lib/design-tokens";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardEmptyState } from "@/components/dashboard/empty-state";
import { RadialGauge } from "@/components/dashboard/charts/radial-gauge";
import {
  HeatmapMatrix,
  type HeatmapCell,
} from "@/components/dashboard/charts/heatmap-matrix";
import { StreakBadge } from "@/components/dashboard/primitives/streak-badge";
import type { SessionUser } from "@/lib/auth/session";

type Props = { actor: SessionUser };
const accent = PERSONA_ACCENTS.medical_records.accent;

// ── Loaders ────────────────────────────────────────────────────────────────

async function loadCompletionScore(orgId: string) {
  const now = new Date();
  const thirtyOut = new Date(now.getTime() + 30 * 86400000);
  try {
    const [totalRow, completeRow] = await Promise.all([
      db
        .select({ n: count() })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, orgId),
            eq(cases.status, "active"),
            isNull(cases.deletedAt),
            gte(cases.hearingDate, now),
            lte(cases.hearingDate, thirtyOut),
          ),
        ),
      db
        .select({ n: count() })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, orgId),
            eq(cases.status, "active"),
            isNull(cases.deletedAt),
            gte(cases.hearingDate, now),
            lte(cases.hearingDate, thirtyOut),
            eq(cases.mrStatus, "complete"),
          ),
        ),
    ]);
    const total = totalRow[0]?.n ?? 0;
    const complete = completeRow[0]?.n ?? 0;
    return {
      total,
      complete,
      score: total > 0 ? Math.round((complete / total) * 100) : 100,
    };
  } catch (e) {
    logger.error("MR completion failed", { error: e, orgId });
    return { total: 0, complete: 0, score: 100 };
  }
}

async function loadHearingMatrix(orgId: string) {
  // Rows = hearings ordered by date; columns = MR / RFC / completeness band
  const now = new Date();
  const thirtyOut = new Date(now.getTime() + 30 * 86400000);
  try {
    const rows = await db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        hearingDate: cases.hearingDate,
        mrStatus: cases.mrStatus,
        teamColor: cases.mrTeamColor,
      })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
          gte(cases.hearingDate, now),
          lte(cases.hearingDate, thirtyOut),
        ),
      )
      .orderBy(cases.hearingDate)
      .limit(15);
    return rows;
  } catch (e) {
    logger.error("MR hearing matrix failed", { error: e });
    return [];
  }
}

async function loadProviderCreds(orgId: string) {
  try {
    const rows = await db
      .select({
        id: providerCredentials.id,
        providerName: providerCredentials.providerName,
        label: providerCredentials.label,
        lastUsedAt: providerCredentials.lastUsedAt,
        isActive: providerCredentials.isActive,
      })
      .from(providerCredentials)
      .where(eq(providerCredentials.organizationId, orgId))
      .orderBy(desc(providerCredentials.lastUsedAt))
      .limit(8);
    return rows;
  } catch (e) {
    logger.error("MR provider creds failed", { error: e });
    return [];
  }
}

async function loadRfcCounters(orgId: string) {
  try {
    const rows = await db
      .select({ status: rfcRequests.status, n: count() })
      .from(rfcRequests)
      .where(eq(rfcRequests.organizationId, orgId))
      .groupBy(rfcRequests.status);
    return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
  } catch (e) {
    logger.error("MR rfc failed", { error: e });
    return {};
  }
}

function daysUntil(d: Date | null): number {
  if (!d) return 999;
  return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000));
}

// ── Component ──────────────────────────────────────────────────────────────

export async function MedicalRecordsDashboard({ actor }: Props) {
  const [comp, hearings, creds, rfc] = await Promise.all([
    loadCompletionScore(actor.organizationId),
    loadHearingMatrix(actor.organizationId),
    loadProviderCreds(actor.organizationId),
    loadRfcCounters(actor.organizationId),
  ]);

  // Build hearing matrix: rows = hearings, cols = [Days Remaining, MR Status]
  const matrixCells: HeatmapCell[][] = hearings.map((h) => {
    const days = daysUntil(h.hearingDate);
    const isComplete = h.mrStatus === "complete";
    return [
      {
        intensity: 1 - days / 30,
        display: `${days}d`,
        state: days <= 7 ? "bad" : days <= 14 ? "warn" : undefined,
        tooltip: `Case ${h.caseNumber} · hearing in ${days} days`,
      },
      {
        intensity: isComplete ? 0 : 1,
        display: h.mrStatus ?? "—",
        state: isComplete ? "ok" : days <= 14 ? "bad" : "warn",
        tooltip: `MR status: ${h.mrStatus ?? "not started"}`,
      },
    ];
  });

  return (
    <div className="space-y-6">
      {/* Hero — completion gauge with team color */}
      <div
        className="rounded-[14px] border bg-white p-8 dash-fade-up"
        style={{ borderColor: COLORS.borderDefault }}
      >
        <div className="flex items-center gap-8 flex-wrap">
          <RadialGauge
            value={comp.score}
            size={200}
            strokeWidth={18}
            color={accent}
            label="MR Completion"
            subtitle={`${comp.complete} / ${comp.total} hearings <30d`}
          />
          <div className="min-w-0 flex-1">
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.10em] mb-2"
              style={{ color: COLORS.text2 }}
            >
              Records Pipeline
            </div>
            <div
              className="font-semibold leading-tight mb-3"
              style={{ fontSize: 22, color: COLORS.text1 }}
            >
              {comp.score >= 90
                ? "On track for every hearing"
                : comp.score >= 70
                  ? "Most cases ready — watch the urgents"
                  : "Several cases behind — escalate this morning"}
            </div>
            <StreakBadge
              count={comp.score >= 90 ? 7 : 0}
              unit="days"
              description="100% on-time rate"
              broken={comp.score < 90}
            />
          </div>
        </div>
      </div>

      {/* Hearing × MR readiness matrix */}
      <Card>
        <CardContent className="p-5">
          <h3
            className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
            style={{ color: COLORS.text2 }}
          >
            Hearings × Records Readiness · Next 30 Days
          </h3>
          {hearings.length === 0 ? (
            <DashboardEmptyState
              icon="🏥"
              title="No hearings within 30 days"
              body="The records pipeline is quiet. Use the calm to verify provider portal credentials before the next wave."
              action={{ label: "Open vault", href: "/medical-records?tab=credentials" }}
              accent={accent}
            />
          ) : (
            <HeatmapMatrix
              rowLabels={hearings.map((h) => `#${h.caseNumber ?? "??"}`)}
              colLabels={["Days Remaining", "MR Status"]}
              cells={matrixCells}
              cellSize={80}
              cellGap={3}
              showValues
            />
          )}
        </CardContent>
      </Card>

      {/* Provider creds + RFC pipeline */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3
              className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
              style={{ color: COLORS.text2 }}
            >
              Provider Portal Credentials
            </h3>
            {creds.length === 0 ? (
              <p className="text-[12px]" style={{ color: COLORS.text3 }}>
                No portal credentials configured.
              </p>
            ) : (
              <ul className="space-y-2">
                {creds.map((c) => {
                  const days = c.lastUsedAt
                    ? Math.floor(
                        (Date.now() - new Date(c.lastUsedAt).getTime()) /
                          86400000,
                      )
                    : 999;
                  const stale = days > 30;
                  return (
                    <li key={c.id} className="flex items-center justify-between text-[12px]">
                      <div>
                        <div style={{ color: COLORS.text1 }}>{c.providerName}</div>
                        <div className="text-[10px]" style={{ color: COLORS.text3 }}>
                          {c.label ?? "—"}
                        </div>
                      </div>
                      <span
                        className="text-[11px] tabular-nums"
                        style={{
                          color: !c.isActive
                            ? COLORS.text4
                            : stale
                              ? COLORS.bad
                              : COLORS.emerald,
                        }}
                      >
                        {!c.isActive
                          ? "Inactive"
                          : stale
                            ? `${days}d stale`
                            : `Used ${days}d ago`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              href="/medical-records?tab=credentials"
              className="inline-block mt-3 text-[12px] hover:underline"
              style={{ color: accent }}
            >
              Open credential vault →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3
              className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
              style={{ color: COLORS.text2 }}
            >
              RFC Pipeline
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(rfc).slice(0, 6).map(([status, n]) => (
                <div key={status}>
                  <div className="text-[10px] uppercase tracking-[0.10em]" style={{ color: COLORS.text3 }}>
                    {status.replace("_", " ")}
                  </div>
                  <div className="text-[28px] font-semibold tabular-nums" style={{ color: COLORS.text1 }}>
                    {n}
                  </div>
                </div>
              ))}
              {Object.keys(rfc).length === 0 && (
                <p className="text-[12px] col-span-2" style={{ color: COLORS.text3 }}>
                  No RFC requests yet.
                </p>
              )}
            </div>
            <Link
              href="/medical-records?tab=rfc"
              className="inline-block mt-3 text-[12px] hover:underline"
              style={{ color: accent }}
            >
              Open RFC tracker →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
