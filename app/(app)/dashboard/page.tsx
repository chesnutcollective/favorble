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
import { ArrowRight01Icon, Shield01Icon } from "@hugeicons/core-free-icons";

import { requireEffectivePersona } from "@/lib/personas/effective-persona";
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
import {
  computeCompositeScore,
  evaluateMetric,
  getRoleMetricPack,
  type RoleMetricDefinition,
} from "@/lib/services/role-metrics";
import { logger } from "@/lib/logger/server";
import {
  DefaultDashboard,
  type DefaultDashboardProps,
} from "@/components/dashboard/personas/default";
import { CaseManagerDashboard } from "@/components/dashboard/personas/case_manager";
import { AttorneyDashboard } from "@/components/dashboard/personas/attorney";
import { ReviewerDashboard } from "@/components/dashboard/personas/reviewer";
import { AdminDashboard } from "@/components/dashboard/personas/admin";
import { IntakeAgentDashboard } from "@/components/dashboard/personas/intake_agent";
import { FilingAgentDashboard } from "@/components/dashboard/personas/filing_agent";
import { MailClerkDashboard } from "@/components/dashboard/personas/mail_clerk";
import { MedicalRecordsDashboard } from "@/components/dashboard/personas/medical_records";
import { PhiSheetWriterDashboard } from "@/components/dashboard/personas/phi_sheet_writer";
import { FeeCollectionDashboard } from "@/components/dashboard/personas/fee_collection";
import { AppealsCouncilDashboard } from "@/components/dashboard/personas/appeals_council";
import { PostHearingDashboard } from "@/components/dashboard/personas/post_hearing";
import { PreHearingPrepDashboard } from "@/components/dashboard/personas/pre_hearing_prep";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

// ───────────────────────────────────────────────────────────────────────────
// Shared KPI computation (still used by the DefaultDashboard fallback)
// ───────────────────────────────────────────────────────────────────────────

type KpiValue = { value: string; subtitle?: string };
const FALLBACK_KPI: KpiValue = { value: "—" };

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
        return {
          value: `${Math.round((won / total) * 100)}%`,
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

// ───────────────────────────────────────────────────────────────────────────
// Role metric block — used by DefaultDashboard fallback
// ───────────────────────────────────────────────────────────────────────────

async function loadRoleMetricBlock(
  personaId: string,
  userId: string,
): Promise<DefaultDashboardProps["metricBlock"]> {
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
    logger.error("Failed to load role metric snapshots", { personaId, error });
  }

  const byKey = new Map<string, number[]>();
  for (const r of rows) {
    const arr = byKey.get(r.metricKey) ?? [];
    arr.push(Number(r.value));
    byKey.set(r.metricKey, arr);
  }

  const metricCards = pack.metrics.map((metric) => {
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

// ───────────────────────────────────────────────────────────────────────────
// Page (dispatcher)
// ───────────────────────────────────────────────────────────────────────────

// Reference imports that the role-metrics block surface relies on through type
// inference (TS will erase the named imports below if we don't reference them).
type _RoleMetricRef = RoleMetricDefinition;

export default async function DashboardPage() {
  const persona = await requireEffectivePersona();
  const { actor, config, isViewingAs, personaId } = persona;

  const welcomeTitle = isViewingAs
    ? `Viewing as ${config.label}`
    : `Welcome, ${actor.firstName}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={welcomeTitle}
        description={config.workspaceDescription}
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

      {/* Per-persona dispatch */}
      {personaId === "case_manager" ? (
        <CaseManagerDashboard actor={actor} />
      ) : personaId === "attorney" ? (
        <AttorneyDashboard actor={actor} />
      ) : personaId === "reviewer" ? (
        <ReviewerDashboard actor={actor} />
      ) : personaId === "admin" ? (
        <AdminDashboard actor={actor} />
      ) : personaId === "intake_agent" ? (
        <IntakeAgentDashboard actor={actor} />
      ) : personaId === "filing_agent" ? (
        <FilingAgentDashboard actor={actor} />
      ) : personaId === "mail_clerk" ? (
        <MailClerkDashboard actor={actor} />
      ) : personaId === "medical_records" ? (
        <MedicalRecordsDashboard actor={actor} />
      ) : personaId === "phi_sheet_writer" ? (
        <PhiSheetWriterDashboard actor={actor} />
      ) : personaId === "fee_collection" ? (
        <FeeCollectionDashboard actor={actor} />
      ) : personaId === "appeals_council" ? (
        <AppealsCouncilDashboard actor={actor} />
      ) : personaId === "post_hearing" ? (
        <PostHearingDashboard actor={actor} />
      ) : personaId === "pre_hearing_prep" ? (
        <PreHearingPrepDashboard actor={actor} />
      ) : (
        // Fallback to the original generic layout for personas not yet built
        <DefaultDashboardWrapper
          personaId={personaId}
          orgId={actor.organizationId}
          userId={actor.id}
          config={config}
        />
      )}
    </div>
  );
}

async function DefaultDashboardWrapper({
  personaId,
  orgId,
  userId,
  config,
}: {
  personaId: string;
  orgId: string;
  userId: string;
  config: DefaultDashboardProps["config"];
}) {
  const [kpi, metricBlock] = await Promise.all([
    computePrimaryKpi(personaId, orgId),
    loadRoleMetricBlock(personaId, userId).catch(() => null),
  ]);
  return (
    <DefaultDashboard
      config={config}
      kpiValue={kpi.value}
      kpiSubtitle={kpi.subtitle}
      metricBlock={metricBlock}
    />
  );
}
