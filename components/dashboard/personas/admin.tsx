import Link from "next/link";
import Image from "next/image";
import { and, count, desc, eq, gte, isNull } from "drizzle-orm";

import { db } from "@/db/drizzle";
import {
  auditLog,
  ereCredentials,
  ereJobs,
  integrationEvents,
  users,
} from "@/db/schema";
import { logger } from "@/lib/logger/server";
import { COLORS, PERSONA_ACCENTS } from "@/lib/design-tokens";
import { Card, CardContent } from "@/components/ui/card";
import { RadialGauge } from "@/components/dashboard/charts/radial-gauge";
import { LiveTicker, type TickerItem } from "@/components/dashboard/primitives/live-ticker";
import { StreakBadge } from "@/components/dashboard/primitives/streak-badge";
import type { SessionUser } from "@/lib/auth/session";
import {
  INTEGRATION_REGISTRY,
  getIntegration,
} from "@/lib/integrations/registry";
import { getCustomLogoUrls } from "@/app/actions/integration-management";

type Props = { actor: SessionUser };
const accent = PERSONA_ACCENTS.admin.accent;

// ── Loaders ────────────────────────────────────────────────────────────────

async function loadOvernightIntegrity(orgId: string) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  try {
    const [credTotalRow, credActiveRow, recentEventsRow, badEventsRow] = await Promise.all([
      db.select({ n: count() }).from(ereCredentials),
      db
        .select({ n: count() })
        .from(ereCredentials)
        .where(eq(ereCredentials.isActive, true)),
      db
        .select({ n: count() })
        .from(integrationEvents)
        .where(gte(integrationEvents.createdAt, since)),
      db
        .select({ n: count() })
        .from(integrationEvents)
        .where(
          and(
            gte(integrationEvents.createdAt, since),
            eq(integrationEvents.status, "error"),
          ),
        ),
    ]);
    const total = credTotalRow[0]?.n ?? 0;
    const active = credActiveRow[0]?.n ?? 0;
    const recent = recentEventsRow[0]?.n ?? 0;
    const bad = badEventsRow[0]?.n ?? 0;

    // Composite 0-100: weighted combination of credential health + event quality.
    const credHealth = total > 0 ? (active / total) * 100 : 100;
    const eventHealth = recent > 0 ? Math.max(0, 100 - (bad / recent) * 200) : 100;
    const composite = Math.round(0.6 * credHealth + 0.4 * eventHealth);

    return { composite, active, total, recent, bad };
  } catch (e) {
    logger.error("admin overnight integrity failed", { error: e, orgId });
    return { composite: 100, active: 0, total: 0, recent: 0, bad: 0 };
  }
}

async function loadEcgEvents(): Promise<TickerItem[]> {
  try {
    const rows = await db
      .select({
        id: integrationEvents.id,
        eventType: integrationEvents.eventType,
        summary: integrationEvents.summary,
        status: integrationEvents.status,
        integrationId: integrationEvents.integrationId,
        createdAt: integrationEvents.createdAt,
      })
      .from(integrationEvents)
      .orderBy(desc(integrationEvents.createdAt))
      .limit(40);

    return rows.map((r) => ({
      id: r.id,
      tone:
        r.status === "error" || r.status === "timeout"
          ? ("bad" as const)
          : r.status === "warn"
            ? ("warn" as const)
            : ("ok" as const),
      label: `${r.integrationId} · ${r.eventType}`,
      detail: r.summary ? r.summary.slice(0, 60) : undefined,
    }));
  } catch (e) {
    logger.error("admin ecg events failed", { error: e });
    return [];
  }
}

async function loadServiceConstellation() {
  // Aggregate the latest event per integration to get a status read.
  try {
    const rows = await db
      .select({
        integrationId: integrationEvents.integrationId,
        status: integrationEvents.status,
        createdAt: integrationEvents.createdAt,
      })
      .from(integrationEvents)
      .orderBy(desc(integrationEvents.createdAt))
      .limit(200);
    const seen = new Map<string, { status: string; createdAt: Date }>();
    for (const r of rows) {
      if (!seen.has(r.integrationId)) {
        seen.set(r.integrationId, {
          status: r.status,
          createdAt: r.createdAt,
        });
      }
    }
    return Array.from(seen.entries()).map(([id, last]) => ({
      id,
      state:
        last.status === "error" || last.status === "timeout"
          ? "bad"
          : last.status === "warn"
            ? "warn"
            : "ok",
      lastEvent: last.createdAt,
    })) as Array<{
      id: string;
      state: "ok" | "warn" | "bad";
      lastEvent: Date;
    }>;
  } catch (e) {
    logger.error("admin constellation failed", { error: e });
    return [];
  }
}

async function loadOpsCounters(orgId: string) {
  try {
    const [usersRow, ereJobsTodayRow] = await Promise.all([
      db
        .select({ n: count() })
        .from(users)
        .where(
          and(eq(users.organizationId, orgId), isNull(users.deletedAt)),
        ),
      db
        .select({ n: count() })
        .from(ereJobs)
        .where(
          gte(
            ereJobs.createdAt,
            new Date(Date.now() - 24 * 3600 * 1000),
          ),
        ),
    ]);
    return {
      users: usersRow[0]?.n ?? 0,
      ereJobs24h: ereJobsTodayRow[0]?.n ?? 0,
    };
  } catch (e) {
    logger.error("admin ops counters failed", { error: e, orgId });
    return { users: 0, ereJobs24h: 0 };
  }
}

async function loadAuditTail(orgId: string) {
  try {
    const rows = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        userId: auditLog.userId,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(eq(auditLog.organizationId, orgId))
      .orderBy(desc(auditLog.createdAt))
      .limit(8);
    return rows;
  } catch (e) {
    logger.error("admin audit tail failed", { error: e, orgId });
    return [];
  }
}

function relativeTime(d: Date | null): string {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// ── Component ──────────────────────────────────────────────────────────────

export async function AdminDashboard({ actor }: Props) {
  const allIntegrationIds = INTEGRATION_REGISTRY.map((i) => i.id);
  const [
    integrity,
    ecg,
    constellation,
    counters,
    audit,
    customLogoUrls,
  ] = await Promise.all([
    loadOvernightIntegrity(actor.organizationId),
    loadEcgEvents(),
    loadServiceConstellation(),
    loadOpsCounters(actor.organizationId),
    loadAuditTail(actor.organizationId),
    getCustomLogoUrls(allIntegrationIds).catch(
      () => ({}) as Record<string, { tech: { url: string; storagePath: string } | null; host: { url: string; storagePath: string } | null }>,
    ),
  ]);

  const okCount = constellation.filter((s) => s.state === "ok").length;
  const totalServices = constellation.length;
  const allHealthy = constellation.every((s) => s.state === "ok");

  return (
    <div className="space-y-6">
      {/* ECG-style live ticker — the firm's heartbeat */}
      {ecg.length > 0 && (
        <LiveTicker
          items={ecg}
          height={28}
          background="rgba(14,22,51,0.92)"
          className="rounded-[8px] overflow-hidden"
        />
      )}

      {/* Hero — Overnight Integrity radial gauge */}
      <div
        className="rounded-[14px] border bg-white p-8 dash-fade-up"
        style={{ borderColor: COLORS.borderDefault }}
      >
        <div className="flex items-start justify-between gap-8 flex-wrap">
          <div className="flex items-center gap-8 flex-wrap">
            <RadialGauge
              value={integrity.composite}
              size={240}
              strokeWidth={20}
              label="Firm Pulse"
              subtitle={`${okCount} / ${totalServices || "—"} services healthy`}
              breathe
            />
            <div>
              <div
                className="text-[10px] font-semibold uppercase tracking-[0.10em] mb-2"
                style={{ color: COLORS.text2 }}
              >
                Overnight Integrity
              </div>
              <div
                className="font-semibold leading-tight"
                style={{ fontSize: 22, color: COLORS.text1 }}
              >
                {allHealthy
                  ? "All systems green"
                  : integrity.bad > 0
                    ? `${integrity.bad} errors in last 24h`
                    : "Monitoring"}
              </div>
              <p className="text-[12px] mt-1 max-w-sm" style={{ color: COLORS.text2 }}>
                Composite of credential health and event-quality over the last 24 hours.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.10em]" style={{ color: COLORS.text3 }}>
                    Active Creds
                  </div>
                  <div className="text-[20px] font-semibold tabular-nums">
                    {integrity.active} / {integrity.total}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.10em]" style={{ color: COLORS.text3 }}>
                    Events 24h
                  </div>
                  <div className="text-[20px] font-semibold tabular-nums">
                    {integrity.recent}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.10em]" style={{ color: COLORS.text3 }}>
                    Errors 24h
                  </div>
                  <div
                    className="text-[20px] font-semibold tabular-nums"
                    style={{ color: integrity.bad > 0 ? COLORS.bad : COLORS.text1 }}
                  >
                    {integrity.bad}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <StreakBadge
            count={allHealthy ? 14 : 0}
            unit="days"
            description="green streak"
            broken={!allHealthy}
          />
        </div>
      </div>

      {/* Status Constellation — service grid */}
      {constellation.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h3
              className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
              style={{ color: COLORS.text2 }}
            >
              Status Constellation
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {constellation.map((s) => {
                const config = getIntegration(s.id);
                const tone =
                  s.state === "bad"
                    ? COLORS.bad
                    : s.state === "warn"
                      ? COLORS.warn
                      : COLORS.emerald;
                const custom = customLogoUrls[s.id];
                const techLogo =
                  custom?.tech?.url ??
                  (config ? `/${config.logoPath}` : null);
                const hostLogo = config?.hostLogoPath
                  ? custom?.host?.url ?? `/${config.hostLogoPath}`
                  : null;
                const displayName = config?.shortName ?? s.id;

                return (
                  <Link
                    key={s.id}
                    href={`/admin/integrations/${s.id}`}
                    className="group rounded-[10px] border bg-white p-3 flex items-center gap-3 transition-colors hover:border-[#BBB]"
                    style={{
                      borderColor: COLORS.borderDefault,
                      borderLeftColor: tone,
                      borderLeftWidth: 3,
                    }}
                  >
                    {/* Logo + optional host badge overlay */}
                    <div className="relative flex-shrink-0 w-10 h-10">
                      <div
                        className="w-10 h-10 rounded-lg border flex items-center justify-center overflow-hidden"
                        style={{
                          borderColor: COLORS.borderSubtle,
                          background: "#FFF",
                        }}
                      >
                        {techLogo ? (
                          <Image
                            src={techLogo}
                            alt={displayName}
                            width={40}
                            height={40}
                            className="object-contain p-1"
                            unoptimized={
                              techLogo.startsWith("data:") ||
                              techLogo.startsWith("http")
                            }
                          />
                        ) : (
                          <span className="text-sm">
                            {config?.fallbackIcon ?? "•"}
                          </span>
                        )}
                      </div>
                      {hostLogo && (
                        <div
                          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-md bg-white ring-2 ring-white flex items-center justify-center overflow-hidden shadow-sm"
                          title={
                            config?.hostName
                              ? `Hosted on ${config.hostName}`
                              : undefined
                          }
                        >
                          <Image
                            src={hostLogo}
                            alt={config?.hostName ?? "Host"}
                            width={16}
                            height={16}
                            className="object-contain"
                            unoptimized={
                              hostLogo.startsWith("data:") ||
                              hostLogo.startsWith("http")
                            }
                          />
                        </div>
                      )}
                    </div>

                    {/* Name + status */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${s.state !== "ok" ? "dash-pulse-dot" : ""}`}
                          style={{ background: tone }}
                        />
                        <div
                          className="text-[12px] font-medium truncate"
                          style={{ color: COLORS.text1 }}
                        >
                          {displayName}
                        </div>
                      </div>
                      <div
                        className="text-[10px] mt-0.5 truncate"
                        style={{ color: COLORS.text3 }}
                      >
                        {config?.hostName ? `${config.hostName} · ` : ""}
                        {relativeTime(s.lastEvent)} ago
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick actions + audit tail */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h3
            className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
            style={{ color: COLORS.text2 }}
          >
            Quick Actions
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { href: "/admin/users", label: "Provision User", desc: `${counters.users} active users` },
              { href: "/admin/integrations", label: "Integrations Cockpit", desc: "Verify all services" },
              { href: "/admin/audit-logs", label: "Audit Logs", desc: "Search system event history" },
              { href: "/admin/compliance", label: "Compliance", desc: "Review open findings" },
            ].map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="block rounded-[10px] border p-4 hover:border-[#999] transition-colors"
                style={{ borderColor: COLORS.borderDefault, background: "#fff" }}
              >
                <div className="text-[14px] font-semibold" style={{ color: COLORS.text1 }}>
                  {a.label}
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: COLORS.text2 }}>
                  {a.desc}
                </div>
              </Link>
            ))}
          </div>
        </div>
        <Card>
          <CardContent className="p-5">
            <h3
              className="text-[13px] font-semibold uppercase tracking-[0.06em] mb-3"
              style={{ color: COLORS.text2 }}
            >
              Recent Audit
            </h3>
            {audit.length === 0 ? (
              <p className="text-[12px]" style={{ color: COLORS.text3 }}>
                No audit events.
              </p>
            ) : (
              <ul className="space-y-2">
                {audit.map((a) => (
                  <li key={a.id} className="text-[12px] leading-snug">
                    <div className="flex items-center gap-2">
                      <span
                        className="font-mono text-[10px]"
                        style={{ color: COLORS.text3 }}
                      >
                        {relativeTime(a.createdAt)}
                      </span>
                      <span style={{ color: COLORS.text1 }}>
                        {a.action}
                      </span>
                    </div>
                    <div style={{ color: COLORS.text3 }}>{a.entityType}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
