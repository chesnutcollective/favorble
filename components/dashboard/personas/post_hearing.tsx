import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { hearingOutcomes, cases } from "@/db/schema";
import { logger } from "@/lib/logger/server";
import { COLORS, PERSONA_ACCENTS } from "@/lib/design-tokens";
import { Card, CardContent } from "@/components/ui/card";
import { StageFlowCards, type Stage } from "@/components/dashboard/primitives/stage-flow-cards";
import { LiveTicker, type TickerItem } from "@/components/dashboard/primitives/live-ticker";
import { Sparkline } from "@/components/charts/sparkline";
import type { SessionUser } from "@/lib/auth/session";

type Props = { actor: SessionUser };
const accent = PERSONA_ACCENTS.post_hearing.accent;

// ── Loaders ────────────────────────────────────────────────────────────────

async function loadStageBuckets(orgId: string) {
  try {
    const rows = await db
      .select({
        outcome: hearingOutcomes.outcome,
        clientNotifiedAt: hearingOutcomes.clientNotifiedAt,
        stageAdvancedAt: hearingOutcomes.caseStageAdvancedAt,
        processingCompletedAt: hearingOutcomes.processingCompletedAt,
        outcomeReceivedAt: hearingOutcomes.outcomeReceivedAt,
      })
      .from(hearingOutcomes)
      .where(eq(hearingOutcomes.organizationId, orgId))
      .orderBy(desc(hearingOutcomes.outcomeReceivedAt))
      .limit(500);
    let received = 0,
      notified = 0,
      advanced = 0,
      completed = 0;
    for (const r of rows) {
      received++;
      if (r.clientNotifiedAt) notified++;
      if (r.stageAdvancedAt) advanced++;
      if (r.processingCompletedAt) completed++;
    }
    return { received, notified, advanced, completed };
  } catch (e) {
    logger.error("post-hearing stage buckets failed", { error: e, orgId });
    return { received: 0, notified: 0, advanced: 0, completed: 0 };
  }
}

async function loadAutoHandledRate(orgId: string) {
  try {
    const [autoRow, totalRow] = await Promise.all([
      db
        .select({ n: count() })
        .from(hearingOutcomes)
        .where(
          and(
            eq(hearingOutcomes.organizationId, orgId),
            isNull(hearingOutcomes.processedBy),
            gte(hearingOutcomes.processingCompletedAt, new Date(Date.now() - 7 * 86400000)),
          ),
        ),
      db
        .select({ n: count() })
        .from(hearingOutcomes)
        .where(
          and(
            eq(hearingOutcomes.organizationId, orgId),
            gte(hearingOutcomes.processingCompletedAt, new Date(Date.now() - 7 * 86400000)),
          ),
        ),
    ]);
    const auto = autoRow[0]?.n ?? 0;
    const total = totalRow[0]?.n ?? 0;
    return {
      autoPct: total > 0 ? Math.round((auto / total) * 100) : 100,
      total,
    };
  } catch (e) {
    logger.error("post-hearing auto rate failed", { error: e, orgId });
    return { autoPct: 100, total: 0 };
  }
}

async function loadOutcomeMix(orgId: string) {
  try {
    const rows = await db
      .select({ outcome: hearingOutcomes.outcome, n: count() })
      .from(hearingOutcomes)
      .where(
        and(
          eq(hearingOutcomes.organizationId, orgId),
          gte(hearingOutcomes.outcomeReceivedAt, new Date(Date.now() - 30 * 86400000)),
        ),
      )
      .groupBy(hearingOutcomes.outcome);
    return Object.fromEntries(rows.map((r) => [r.outcome, r.n])) as Record<string, number>;
  } catch (e) {
    logger.error("post-hearing outcome mix failed", { error: e });
    return {};
  }
}

async function loadOutcomeTicker(orgId: string): Promise<TickerItem[]> {
  try {
    const rows = await db
      .select({
        id: hearingOutcomes.id,
        outcome: hearingOutcomes.outcome,
        outcomeReceivedAt: hearingOutcomes.outcomeReceivedAt,
        caseNumber: cases.caseNumber,
      })
      .from(hearingOutcomes)
      .leftJoin(cases, eq(cases.id, hearingOutcomes.caseId))
      .orderBy(desc(hearingOutcomes.outcomeReceivedAt))
      .limit(30);
    return rows.map((r) => ({
      id: r.id,
      tone:
        r.outcome === "favorable"
          ? "ok"
          : r.outcome === "unfavorable"
            ? "bad"
            : "info",
      label: `${(r.outcome ?? "—").toUpperCase()} · ${r.caseNumber ?? "—"}`,
    }));
  } catch (e) {
    logger.error("post-hearing ticker failed", { error: e });
    return [];
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export async function PostHearingDashboard({ actor }: Props) {
  const [buckets, auto, mix, ticker] = await Promise.all([
    loadStageBuckets(actor.organizationId),
    loadAutoHandledRate(actor.organizationId),
    loadOutcomeMix(actor.organizationId),
    loadOutcomeTicker(actor.organizationId),
  ]);

  const stages: Stage[] = [
    { id: "received", label: "Received", count: buckets.received, accent },
    { id: "notified", label: "Notified", count: buckets.notified, accent },
    { id: "advanced", label: "Advanced", count: buckets.advanced, accent },
    { id: "completed", label: "Completed", count: buckets.completed, accent },
  ];

  return (
    <div className="space-y-6">
      {ticker.length > 0 && (
        <LiveTicker
          items={ticker}
          height={28}
          background="rgba(14,22,51,0.96)"
          className="rounded-[8px] overflow-hidden"
        />
      )}

      {/* Hero — pipeline conductor */}
      <div
        className="rounded-[14px] p-8 dash-fade-up"
        style={{
          background: "linear-gradient(135deg, #0E1633 0%, #050a1e 100%)",
          color: "#F5F5F7",
        }}
      >
        <div className="flex items-baseline gap-4 flex-wrap">
          <div
            className="font-semibold leading-none tabular-nums"
            style={{ fontSize: 84, color: accent, letterSpacing: "-0.04em" }}
          >
            {auto.autoPct}%
          </div>
          <div className="text-[18px] opacity-90">
            of outcomes auto-processed
          </div>
        </div>
        <div className="text-[14px] opacity-70 mt-2">
          {auto.total} outcomes processed in the last 7 days · the conductor watches the pipeline that runs itself.
        </div>
      </div>

      {/* Stage flow cards with pellet animation */}
      <section>
        <h2
          className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
          style={{ color: COLORS.text2 }}
        >
          Pipeline · Today
        </h2>
        <StageFlowCards stages={stages} animatePellets height={200} />
      </section>

      {/* Outcome mix */}
      <Card>
        <CardContent className="p-5">
          <h3
            className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
            style={{ color: COLORS.text2 }}
          >
            Outcome Mix · Last 30 Days
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { key: "favorable", color: COLORS.emerald },
              { key: "partially_favorable", color: accent },
              { key: "unfavorable", color: COLORS.bad },
              { key: "dismissed", color: COLORS.text3 },
            ].map((o) => (
              <div key={o.key}>
                <div className="text-[10px] uppercase tracking-[0.10em]" style={{ color: COLORS.text3 }}>
                  {o.key.replace("_", " ")}
                </div>
                <div className="text-[28px] font-semibold tabular-nums" style={{ color: o.color }}>
                  {mix[o.key] ?? 0}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
