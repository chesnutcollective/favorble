import Link from "next/link";
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
} from "@hugeicons/core-free-icons";

import { Card, CardContent } from "@/components/ui/card";
import { Sparkline } from "@/components/charts/sparkline";
import { COLORS } from "@/lib/design-tokens";
import {
  resolveNavItems,
  type NavItemMeta,
} from "@/lib/personas/nav-items";
import type { PersonaConfig } from "@/lib/personas/config";
import type { RoleMetricDefinition } from "@/lib/services/role-metrics";

export type DefaultDashboardProps = {
  config: PersonaConfig;
  kpiValue: string;
  kpiSubtitle?: string;
  metricBlock: {
    personaLabel: string;
    metrics: Array<{
      metric: RoleMetricDefinition;
      currentValue: number | null;
      sparkline: number[];
      band: null | "warn" | "critical";
    }>;
    compositeScore: number | null;
    hasSnapshotData: boolean;
  } | null;
};

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
  return `Target ${suffix} ${formatMetricValue(metric, metric.targetValue)}`;
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

/**
 * Generic per-persona dashboard layout. Used as a fallback for personas that
 * don't have a custom dashboard yet — preserves the prior behaviour:
 *   - Centered oversized primary KPI card
 *   - Role metric block with sparklines
 *   - Quick-link cards to the persona's nav items
 */
export function DefaultDashboard({
  config,
  kpiValue,
  kpiSubtitle,
  metricBlock,
}: DefaultDashboardProps) {
  const navItems: NavItemMeta[] = resolveNavItems(
    config.nav.filter((id) => id !== "dashboard"),
  ).slice(0, 4);

  return (
    <div className="space-y-6">
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
              {kpiValue}
            </div>
            {(kpiSubtitle ?? config.primaryKpi.subtitle) && (
              <p
                className="text-[13px] max-w-md"
                style={{ color: COLORS.text2 }}
              >
                {kpiSubtitle ?? config.primaryKpi.subtitle}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-role metric block */}
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
                        style={{ backgroundColor: subtle, color: accent }}
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

      {/* Quick-link cards */}
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
