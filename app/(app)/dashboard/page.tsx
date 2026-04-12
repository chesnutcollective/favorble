import type { Metadata } from "next";
import Link from "next/link";
import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  BinocularsIcon,
  CheckmarkCircle01Icon,
  DashboardSquare01Icon,
  Folder01Icon,
  UserAdd01Icon,
  CheckListIcon,
  Calendar03Icon,
  Message01Icon,
  Mail01Icon,
  UserGroupIcon,
  File01Icon,
  ChartLineData01Icon,
  CourtHouseIcon,
  InboxUploadIcon,
  Note01Icon,
  Hospital01Icon,
  InboxIcon,
  Invoice01Icon,
  SafeIcon,
  BubbleChatIcon,
  Shield01Icon,
} from "@hugeicons/core-free-icons";

import { requireEffectivePersona } from "@/lib/personas/effective-persona";
import {
  NAV_ITEM_REGISTRY,
  resolveNavItems,
  type NavItemMeta,
} from "@/lib/personas/nav-items";
import { COLORS } from "@/lib/design-tokens";
import { db } from "@/db/drizzle";
import {
  calendarEvents,
  cases,
  ereCredentials,
  leads,
  performanceSnapshots,
  tasks,
} from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { Sparkline } from "@/components/charts/sparkline";
import {
  computeCompositeScore,
  evaluateMetric,
  getRoleMetricPack,
  type RoleMetricDefinition,
} from "@/lib/services/role-metrics";
import { logger } from "@/lib/logger/server";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

// Map icon-name strings from NAV_ITEM_REGISTRY to the real hugeicons objects.
// Keeping this local to the server component avoids a second client-side
// bundle and sidesteps the serialization boundary.
const NAV_ICONS: Record<string, unknown> = {
  DashboardSquare01Icon,
  Folder01Icon,
  UserAdd01Icon,
  CheckListIcon,
  Calendar03Icon,
  Message01Icon,
  Mail01Icon,
  UserGroupIcon,
  File01Icon,
  ChartLineData01Icon,
  CourtHouseIcon,
  InboxUploadIcon,
  Note01Icon,
  Hospital01Icon,
  InboxIcon,
  Invoice01Icon,
  SafeIcon,
  BubbleChatIcon,
  BinocularsIcon,
};

// ---------------------------------------------------------------------------
// KPI computation
// ---------------------------------------------------------------------------

type KpiValue = {
  value: string;
  subtitle?: string;
};

const FALLBACK_KPI: KpiValue = { value: "—" };

// ---------------------------------------------------------------------------
// Per-role metric block (SM-5)
// ---------------------------------------------------------------------------

type MetricCardData = {
  metric: RoleMetricDefinition;
  currentValue: number | null;
  sparkline: number[];
  band: null | "warn" | "critical";
};

type RoleMetricBlockData = {
  personaLabel: string;
  metrics: MetricCardData[];
  compositeScore: number | null;
  hasSnapshotData: boolean;
};

async function loadRoleMetricBlock(
  personaId: string,
  userId: string,
): Promise<RoleMetricBlockData> {
  const pack = getRoleMetricPack(personaId);
  if (pack.metrics.length === 0) {
    return {
      personaLabel: pack.label,
      metrics: [],
      compositeScore: null,
      hasSnapshotData: false,
    };
  }

  const metricKeys = pack.metrics.map((m) => m.metricKey);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

  let rows: Array<{
    metricKey: string;
    value: string | number;
    periodStart: Date;
  }> = [];

  try {
    rows = await db
      .select({
        metricKey: performanceSnapshots.metricKey,
        value: performanceSnapshots.value,
        periodStart: performanceSnapshots.periodStart,
      })
      .from(performanceSnapshots)
      .where(
        and(
          eq(performanceSnapshots.userId, userId),
          inArray(performanceSnapshots.metricKey, metricKeys),
          gte(performanceSnapshots.periodStart, sevenDaysAgo),
        ),
      )
      .orderBy(asc(performanceSnapshots.periodStart));
  } catch (error) {
    logger.error("Failed to load role metric snapshots", {
      personaId,
      error,
    });
  }

  const byKey = new Map<string, number[]>();
  for (const r of rows) {
    const arr = byKey.get(r.metricKey) ?? [];
    arr.push(Number(r.value));
    byKey.set(r.metricKey, arr);
  }

  const metricCards: MetricCardData[] = pack.metrics.map((metric) => {
    const series = byKey.get(metric.metricKey) ?? [];
    const current = series.length > 0 ? series[series.length - 1] : null;
    const band = current !== null ? evaluateMetric(metric, current) : null;
    return {
      metric,
      currentValue: current,
      sparkline: series,
      band,
    };
  });

  const valueMap: Record<string, number> = {};
  for (const card of metricCards) {
    if (card.currentValue !== null) {
      valueMap[card.metric.metricKey] = card.currentValue;
    }
  }
  const hasSnapshotData = Object.keys(valueMap).length > 0;
  const compositeScore = hasSnapshotData
    ? computeCompositeScore(personaId, valueMap)
    : null;

  return {
    personaLabel: pack.label,
    metrics: metricCards,
    compositeScore,
    hasSnapshotData,
  };
}

function formatMetricValue(
  metric: RoleMetricDefinition,
  value: number | null,
): string {
  if (value === null || Number.isNaN(value)) return "—";
  switch (metric.unit) {
    case "percent":
      return `${Math.round(value * 10) / 10}%`;
    case "hours":
      return `${Math.round(value * 10) / 10}h`;
    case "minutes":
      return `${Math.round(value)}m`;
    case "days":
      return `${Math.round(value * 10) / 10}d`;
    case "currency":
      return `$${Math.round(value).toLocaleString("en-US")}`;
    case "count":
    default:
      return `${Math.round(value * 100) / 100}`;
  }
}

function formatTargetValue(metric: RoleMetricDefinition): string {
  const suffix = metric.direction === "higher_is_better" ? "≥" : "≤";
  const val = formatMetricValue(metric, metric.targetValue);
  return `Target ${suffix} ${val}`;
}

function bandColor(band: null | "warn" | "critical"): string {
  if (band === "critical") return COLORS.bad;
  if (band === "warn") return COLORS.warn;
  return COLORS.ok;
}

function bandSubtle(band: null | "warn" | "critical"): string {
  if (band === "critical") return COLORS.badSubtle;
  if (band === "warn") return COLORS.warnSubtle;
  return COLORS.okSubtle;
}

async function computePrimaryKpi(
  personaId: string,
  organizationId: string,
): Promise<KpiValue> {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const fourteenDaysOut = new Date(now.getTime() + 14 * 86400000);
  const thirtyDaysOut = new Date(now.getTime() + 30 * 86400000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  try {
    switch (personaId) {
      case "admin": {
        // System health — integrations-status.ts has getIntegrationsStatus()
        // but that's heavy (pings Railway, n8n, etc). For a fast welcome
        // screen we surface ERE credential count as a cheap proxy and fall
        // back to a literal "All systems operational" message if even that
        // query fails.
        const [totalRow] = await db.select({ n: count() }).from(ereCredentials);
        const [activeRow] = await db
          .select({ n: count() })
          .from(ereCredentials)
          .where(eq(ereCredentials.isActive, true));
        const total = totalRow?.n ?? 0;
        const active = activeRow?.n ?? 0;
        if (total === 0) {
          return {
            value: "All systems operational",
            subtitle: "No ERE credentials configured yet",
          };
        }
        return {
          value: `${active} / ${total}`,
          subtitle: "Active ERE credentials",
        };
      }

      case "attorney": {
        const [row] = await db
          .select({ n: count() })
          .from(calendarEvents)
          .where(
            and(
              eq(calendarEvents.organizationId, organizationId),
              eq(calendarEvents.eventType, "hearing"),
              gte(calendarEvents.startAt, now),
              lte(calendarEvents.startAt, weekFromNow),
              isNull(calendarEvents.deletedAt),
            ),
          );
        return {
          value: String(row?.n ?? 0),
          subtitle: "Hearings between now and +7 days",
        };
      }

      case "case_manager": {
        const [row] = await db
          .select({ n: count() })
          .from(tasks)
          .where(
            and(
              eq(tasks.organizationId, organizationId),
              inArray(tasks.status, ["pending", "in_progress"]),
              isNull(tasks.deletedAt),
            ),
          );
        return {
          value: String(row?.n ?? 0),
          subtitle: "Pending + in progress",
        };
      }

      case "filing_agent": {
        // Re-use getFilingMetrics() — it's already the canonical "ready to
        // file" count used by /filing. We lazy-import so a typecheck issue
        // in that module never blocks the dashboard from loading.
        const { getFilingMetrics } = await import("@/app/actions/filing");
        const metrics = await getFilingMetrics();
        return {
          value: String(metrics.readyToFile),
          subtitle: "Applications awaiting submission",
        };
      }

      case "intake_agent": {
        const [row] = await db
          .select({ n: count() })
          .from(leads)
          .where(
            and(
              eq(leads.organizationId, organizationId),
              gte(leads.createdAt, startOfToday),
              lte(leads.createdAt, endOfToday),
              isNull(leads.deletedAt),
            ),
          );
        return {
          value: String(row?.n ?? 0),
          subtitle: "Created since midnight",
        };
      }

      case "mail_clerk": {
        const { getInboundMailQueue } = await import("@/app/actions/mail");
        const queue = await getInboundMailQueue();
        return {
          value: String(queue.length),
          subtitle: "Inbound documents pending processing",
        };
      }

      case "medical_records": {
        const [row] = await db
          .select({ n: count() })
          .from(cases)
          .where(
            and(
              eq(cases.organizationId, organizationId),
              eq(cases.status, "active"),
              isNull(cases.deletedAt),
              gte(cases.hearingDate, now),
              lte(cases.hearingDate, thirtyDaysOut),
              // Anything not already complete counts as queue depth
              sql`COALESCE(${cases.mrStatus}, 'not_started') <> 'complete'`,
            ),
          );
        return {
          value: String(row?.n ?? 0),
          subtitle: "Hearings within 30 days · MR incomplete",
        };
      }

      case "phi_sheet_writer": {
        const [row] = await db
          .select({ n: count() })
          .from(cases)
          .where(
            and(
              eq(cases.organizationId, organizationId),
              isNull(cases.deletedAt),
              inArray(cases.phiSheetStatus, ["assigned", "in_progress"]),
              gte(cases.hearingDate, now),
              lte(cases.hearingDate, fourteenDaysOut),
            ),
          );
        return {
          value: String(row?.n ?? 0),
          subtitle: "Hearings within 14 days",
        };
      }

      case "reviewer": {
        const [wonRow] = await db
          .select({ n: count() })
          .from(cases)
          .where(
            and(
              eq(cases.organizationId, organizationId),
              eq(cases.status, "closed_won"),
              gte(cases.closedAt, thirtyDaysAgo),
              isNull(cases.deletedAt),
            ),
          );
        const [lostRow] = await db
          .select({ n: count() })
          .from(cases)
          .where(
            and(
              eq(cases.organizationId, organizationId),
              eq(cases.status, "closed_lost"),
              gte(cases.closedAt, thirtyDaysAgo),
              isNull(cases.deletedAt),
            ),
          );
        const won = wonRow?.n ?? 0;
        const lost = lostRow?.n ?? 0;
        const total = won + lost;
        if (total === 0) {
          return {
            value: "—",
            subtitle: "No closed cases in the last 30 days",
          };
        }
        const pct = Math.round((won / total) * 100);
        return {
          value: `${pct}%`,
          subtitle: `${won} won of ${total} closed · trailing 30d`,
        };
      }

      case "viewer": {
        const [row] = await db
          .select({ n: count() })
          .from(cases)
          .where(
            and(
              eq(cases.organizationId, organizationId),
              eq(cases.status, "active"),
              isNull(cases.deletedAt),
            ),
          );
        return {
          value: String(row?.n ?? 0),
          subtitle: "Currently open",
        };
      }

      default:
        return FALLBACK_KPI;
    }
  } catch (error) {
    logger.error("Failed to compute persona KPI", { personaId, error });
    return FALLBACK_KPI;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const persona = await requireEffectivePersona();
  const { actor, config, isViewingAs, personaId } = persona;

  const kpi = await computePrimaryKpi(personaId, actor.organizationId);
  let metricBlock: RoleMetricBlockData | null = null;
  try {
    metricBlock = await loadRoleMetricBlock(personaId, actor.id);
  } catch (error) {
    logger.error("Failed to load role metric block", { personaId, error });
  }

  // Build the quick-link cards from the persona's nav order, skipping the
  // dashboard entry itself and falling back to the universal items if
  // somehow nothing resolves (defensive — shouldn't happen).
  const navItems: NavItemMeta[] = resolveNavItems(
    config.nav.filter((id) => id !== "dashboard"),
  ).slice(0, 4);

  const welcomeTitle = isViewingAs
    ? `Viewing as ${config.label}`
    : `Welcome, ${actor.firstName}`;

  const welcomeSubtitle = config.workspaceDescription;

  return (
    <div className="space-y-6">
      <PageHeader
        title={welcomeTitle}
        description={welcomeSubtitle}
        actions={
          <Button
            asChild
            size="sm"
            style={{ backgroundColor: COLORS.brand }}
            className="text-white"
          >
            <Link href={config.defaultRoute}>
              Go to {config.label} Workspace
              <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
            </Link>
          </Button>
        }
      />

      {isViewingAs && (
        <Card
          style={{
            borderColor: COLORS.brandMuted,
            backgroundColor: COLORS.brandSubtle,
          }}
        >
          <CardContent className="p-4 flex items-start gap-3">
            <HugeiconsIcon icon={Shield01Icon} size={18} color={COLORS.brand} />
            <div
              className="text-[12px] leading-5"
              style={{ color: COLORS.text2 }}
            >
              <p className="font-medium" style={{ color: COLORS.text1 }}>
                Super-admin view
              </p>
              <p>
                You are signed in as {actor.firstName} {actor.lastName} but
                previewing the {config.label} experience. Actions you take are
                still audited under your real identity.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Primary KPI card — centered, oversized number */}
      <div className="flex justify-center">
        <Card className="w-full max-w-xl">
          <CardContent className="p-10 flex flex-col items-center text-center gap-3">
            <div
              className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em]"
              style={{ color: COLORS.text2 }}
            >
              <HugeiconsIcon
                icon={CheckmarkCircle01Icon}
                size={14}
                color={COLORS.brand}
              />
              {config.primaryKpi.label}
            </div>
            <div
              className="text-[56px] sm:text-[72px] font-semibold leading-none tracking-[-1.5px]"
              style={{ color: COLORS.text1 }}
            >
              {kpi.value}
            </div>
            {(kpi.subtitle ?? config.primaryKpi.subtitle) && (
              <p
                className="text-[13px] max-w-md"
                style={{ color: COLORS.text2 }}
              >
                {kpi.subtitle ?? config.primaryKpi.subtitle}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full per-role metric block (SM-5) */}
      {metricBlock && metricBlock.metrics.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h2
              className="text-[13px] font-semibold uppercase tracking-[0.06em]"
              style={{ color: COLORS.text2 }}
            >
              {metricBlock.personaLabel} Metrics
            </h2>
            {metricBlock.compositeScore !== null && (
              <div
                className="text-[12px] font-medium"
                style={{ color: COLORS.text2 }}
              >
                Composite score:{" "}
                <span
                  className="text-[20px] font-semibold ml-1"
                  style={{ color: COLORS.text1 }}
                >
                  {metricBlock.compositeScore}
                </span>
                <span
                  className="text-[11px] ml-1"
                  style={{ color: COLORS.text3 }}
                >
                  / 100
                </span>
              </div>
            )}
          </div>
          {!metricBlock.hasSnapshotData && (
            <Card className="mb-3">
              <CardContent className="p-4">
                <p className="text-[12px]" style={{ color: COLORS.text2 }}>
                  No performance snapshot data yet. Metrics will populate once
                  the nightly rollup has recorded at least one day of activity
                  for your account.
                </p>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {metricBlock.metrics.map((card) => {
              const accent = bandColor(card.band);
              const subtle = bandSubtle(card.band);
              return (
                <Card key={card.metric.metricKey}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-[12px] font-medium truncate"
                          style={{ color: COLORS.text2 }}
                        >
                          {card.metric.label}
                        </p>
                        <p
                          className="text-[10px] mt-0.5"
                          style={{ color: COLORS.text3 }}
                        >
                          {formatTargetValue(card.metric)}
                        </p>
                      </div>
                      <div
                        className="shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]"
                        style={{
                          backgroundColor: subtle,
                          color: accent,
                        }}
                      >
                        {card.band === "critical"
                          ? "Critical"
                          : card.band === "warn"
                            ? "Warn"
                            : "Healthy"}
                      </div>
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <div
                        className="text-[28px] font-semibold leading-none"
                        style={{ color: COLORS.text1 }}
                      >
                        {formatMetricValue(card.metric, card.currentValue)}
                      </div>
                      <div style={{ color: accent }}>
                        <Sparkline data={card.sparkline} stroke={accent} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick-link cards — the persona's primary workspaces */}
      {navItems.length > 0 && (
        <div>
          <h2
            className="text-[13px] font-semibold mb-3 uppercase tracking-[0.06em]"
            style={{ color: COLORS.text2 }}
          >
            Your Workspaces
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {navItems.map((item) => {
              const Icon =
                (NAV_ICONS[item.iconName] as typeof DashboardSquare01Icon) ??
                DashboardSquare01Icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="group block focus:outline-none"
                >
                  <Card className="h-full transition-colors group-hover:border-[#CCC] group-focus-visible:border-[#999]">
                    <CardContent className="p-5 flex flex-col gap-2">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-[7px]"
                        style={{
                          backgroundColor: COLORS.brandSubtle,
                          color: COLORS.brand,
                        }}
                      >
                        <HugeiconsIcon
                          icon={Icon}
                          size={18}
                          color={COLORS.brand}
                        />
                      </div>
                      <p
                        className="text-[14px] font-semibold mt-1"
                        style={{ color: COLORS.text1 }}
                      >
                        {item.label}
                      </p>
                      <p
                        className="text-[12px] leading-5"
                        style={{ color: COLORS.text2 }}
                      >
                        {item.description}
                      </p>
                      <div
                        className="mt-2 flex items-center gap-1 text-[12px] font-medium"
                        style={{ color: COLORS.brand }}
                      >
                        Open
                        <HugeiconsIcon icon={ArrowRight01Icon} size={12} />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Silence unused-import warnings for the registry type import — we reference
// NAV_ITEM_REGISTRY indirectly through resolveNavItems but want the named
// type available for future extensions.
void NAV_ITEM_REGISTRY;
