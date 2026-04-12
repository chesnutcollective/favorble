"use server";

import { db } from "@/db/drizzle";
import { integrationEvents, integrationAlertRules } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import {
  getIntegration,
  checkEnvVarPresence,
  resolveHealthCheckUrl,
  CATEGORY_LABELS,
  type IntegrationConfig,
  type IntegrationEnvVar,
} from "@/lib/integrations/registry";
import { eq, and, desc, gte, count, avg, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

// ── Types ──

export type EnvVarStatus = {
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
  configured: boolean;
  /** Display value — masked for secrets, truncated for long non-secrets */
  displayValue: string | null;
};

export type HealthStats = {
  avgLatencyMs: number | null;
  uptimePercent: number | null;
  totalChecks: number;
};

export type IntegrationEventRow = {
  id: string;
  eventType: string;
  status: string;
  latencyMs: number | null;
  httpStatus: number | null;
  summary: string | null;
  payload: unknown;
  webhookPath: string | null;
  webhookEventType: string | null;
  createdAt: string;
};

export type AlertRuleRow = {
  id: string;
  failureThreshold: number;
  windowMinutes: number;
  enabled: string;
  lastFiredAt: string | null;
  createdAt: string;
};

export type IntegrationDetail = {
  config: IntegrationConfig;
  categoryLabel: string;
  envVarStatuses: EnvVarStatus[];
  allRequiredConfigured: boolean;
  healthCheckUrl: string | null;
  healthStats: HealthStats;
  recentHealthChecks: IntegrationEventRow[];
  webhookDeliveries: IntegrationEventRow[];
  alertRules: AlertRuleRow[];
  latencyTimeline: number[];
};

// ── Helpers ──

function buildEnvVarStatuses(envVars: IntegrationEnvVar[]): EnvVarStatus[] {
  return envVars.map((v) => {
    const value = process.env[v.key];
    const configured = Boolean(value);
    let displayValue: string | null = null;

    if (configured) {
      if (v.secret) {
        displayValue = "••••••••••••••";
      } else {
        const raw = value!;
        displayValue = raw.length > 60 ? `${raw.slice(0, 57)}...` : raw;
      }
    }

    return {
      key: v.key,
      label: v.label,
      required: v.required,
      secret: v.secret,
      configured,
      displayValue,
    };
  });
}

// ── Actions ──

/**
 * Fetch the full detail for a single integration: registry config, env var
 * status, health stats, recent events, webhook deliveries, and alert rules.
 */
export async function getIntegrationDetail(
  id: string,
): Promise<IntegrationDetail | null> {
  const config = getIntegration(id);
  if (!config) return null;

  const session = await requireSession();
  const orgId = session.organizationId;
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const envVarStatuses = buildEnvVarStatuses(config.envVars);
  const envCheck = checkEnvVarPresence(config);
  const healthCheckUrl = resolveHealthCheckUrl(config);

  // Parallel DB queries
  const [
    healthChecks24h,
    healthStatsResult,
    recentHealthChecks,
    webhookDeliveries,
    alertRules,
  ] = await Promise.all([
    // Health check events in last 24h for sparkline
    db
      .select({
        latencyMs: integrationEvents.latencyMs,
        status: integrationEvents.status,
        createdAt: integrationEvents.createdAt,
      })
      .from(integrationEvents)
      .where(
        and(
          eq(integrationEvents.organizationId, orgId),
          eq(integrationEvents.integrationId, id),
          eq(integrationEvents.eventType, "health_check"),
          gte(integrationEvents.createdAt, twentyFourHoursAgo),
        ),
      )
      .orderBy(integrationEvents.createdAt),

    // Aggregated health stats for last 24h
    db
      .select({
        avgLatency: avg(integrationEvents.latencyMs),
        totalChecks: count(),
        okChecks: sql<number>`count(*) filter (where ${integrationEvents.status} = 'ok')`,
      })
      .from(integrationEvents)
      .where(
        and(
          eq(integrationEvents.organizationId, orgId),
          eq(integrationEvents.integrationId, id),
          eq(integrationEvents.eventType, "health_check"),
          gte(integrationEvents.createdAt, twentyFourHoursAgo),
        ),
      ),

    // Recent health checks (last 20)
    db
      .select({
        id: integrationEvents.id,
        eventType: integrationEvents.eventType,
        status: integrationEvents.status,
        latencyMs: integrationEvents.latencyMs,
        httpStatus: integrationEvents.httpStatus,
        summary: integrationEvents.summary,
        payload: integrationEvents.payload,
        webhookPath: integrationEvents.webhookPath,
        webhookEventType: integrationEvents.webhookEventType,
        createdAt: integrationEvents.createdAt,
      })
      .from(integrationEvents)
      .where(
        and(
          eq(integrationEvents.organizationId, orgId),
          eq(integrationEvents.integrationId, id),
          eq(integrationEvents.eventType, "health_check"),
        ),
      )
      .orderBy(desc(integrationEvents.createdAt))
      .limit(20),

    // Webhook deliveries (last 50)
    db
      .select({
        id: integrationEvents.id,
        eventType: integrationEvents.eventType,
        status: integrationEvents.status,
        latencyMs: integrationEvents.latencyMs,
        httpStatus: integrationEvents.httpStatus,
        summary: integrationEvents.summary,
        payload: integrationEvents.payload,
        webhookPath: integrationEvents.webhookPath,
        webhookEventType: integrationEvents.webhookEventType,
        createdAt: integrationEvents.createdAt,
      })
      .from(integrationEvents)
      .where(
        and(
          eq(integrationEvents.organizationId, orgId),
          eq(integrationEvents.integrationId, id),
          eq(integrationEvents.eventType, "webhook_received"),
        ),
      )
      .orderBy(desc(integrationEvents.createdAt))
      .limit(50),

    // Alert rules
    db
      .select({
        id: integrationAlertRules.id,
        failureThreshold: integrationAlertRules.failureThreshold,
        windowMinutes: integrationAlertRules.windowMinutes,
        enabled: integrationAlertRules.enabled,
        lastFiredAt: integrationAlertRules.lastFiredAt,
        createdAt: integrationAlertRules.createdAt,
      })
      .from(integrationAlertRules)
      .where(
        and(
          eq(integrationAlertRules.organizationId, orgId),
          eq(integrationAlertRules.integrationId, id),
        ),
      )
      .orderBy(desc(integrationAlertRules.createdAt)),
  ]);

  // Compute stats
  const statsRow = healthStatsResult[0];
  const totalChecks = Number(statsRow?.totalChecks ?? 0);
  const okChecks = Number(statsRow?.okChecks ?? 0);
  const avgLatencyMs = statsRow?.avgLatency
    ? Math.round(Number(statsRow.avgLatency))
    : null;
  const uptimePercent =
    totalChecks > 0 ? Math.round((okChecks / totalChecks) * 1000) / 10 : null;

  // Build sparkline data from latency values
  const latencyTimeline = healthChecks24h
    .map((e) => e.latencyMs)
    .filter((v): v is number => v !== null);

  const serializeEvent = (e: {
    id: string;
    eventType: string;
    status: string;
    latencyMs: number | null;
    httpStatus: number | null;
    summary: string | null;
    payload: unknown;
    webhookPath: string | null;
    webhookEventType: string | null;
    createdAt: Date;
  }): IntegrationEventRow => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
  });

  const serializeAlertRule = (r: {
    id: string;
    failureThreshold: number;
    windowMinutes: number;
    enabled: string;
    lastFiredAt: Date | null;
    createdAt: Date;
  }): AlertRuleRow => ({
    ...r,
    lastFiredAt: r.lastFiredAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  });

  return {
    config,
    categoryLabel: CATEGORY_LABELS[config.category],
    envVarStatuses,
    allRequiredConfigured: envCheck.allRequired,
    healthCheckUrl,
    healthStats: {
      avgLatencyMs,
      uptimePercent,
      totalChecks,
    },
    recentHealthChecks: recentHealthChecks.map(serializeEvent),
    webhookDeliveries: webhookDeliveries.map(serializeEvent),
    alertRules: alertRules.map(serializeAlertRule),
    latencyTimeline,
  };
}

/**
 * Paginated event list for an integration.
 */
export async function getIntegrationEvents(
  integrationId: string,
  options?: { eventType?: string; limit?: number },
): Promise<IntegrationEventRow[]> {
  const session = await requireSession();
  const limit = Math.min(options?.limit ?? 50, 200);

  const conditions = [
    eq(integrationEvents.organizationId, session.organizationId),
    eq(integrationEvents.integrationId, integrationId),
  ];
  if (options?.eventType) {
    conditions.push(eq(integrationEvents.eventType, options.eventType));
  }

  const rows = await db
    .select({
      id: integrationEvents.id,
      eventType: integrationEvents.eventType,
      status: integrationEvents.status,
      latencyMs: integrationEvents.latencyMs,
      httpStatus: integrationEvents.httpStatus,
      summary: integrationEvents.summary,
      payload: integrationEvents.payload,
      webhookPath: integrationEvents.webhookPath,
      webhookEventType: integrationEvents.webhookEventType,
      createdAt: integrationEvents.createdAt,
    })
    .from(integrationEvents)
    .where(and(...conditions))
    .orderBy(desc(integrationEvents.createdAt))
    .limit(limit);

  return rows.map((e) => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
  }));
}

/**
 * Create a default alert rule (3 failures in 60 minutes).
 */
export async function createAlertRule(
  integrationId: string,
): Promise<AlertRuleRow> {
  const session = await requireSession();

  const [rule] = await db
    .insert(integrationAlertRules)
    .values({
      organizationId: session.organizationId,
      integrationId,
      failureThreshold: 3,
      windowMinutes: 60,
      enabled: "true",
    })
    .returning();

  logger.info("Alert rule created", {
    ruleId: rule.id,
    integrationId,
  });

  revalidatePath(`/admin/integrations/${integrationId}`);

  return {
    id: rule.id,
    failureThreshold: rule.failureThreshold,
    windowMinutes: rule.windowMinutes,
    enabled: rule.enabled,
    lastFiredAt: rule.lastFiredAt?.toISOString() ?? null,
    createdAt: rule.createdAt.toISOString(),
  };
}

/**
 * Update an existing alert rule.
 */
export async function updateAlertRule(
  ruleId: string,
  updates: {
    failureThreshold?: number;
    windowMinutes?: number;
    enabled?: string;
  },
): Promise<AlertRuleRow | null> {
  const session = await requireSession();

  const setValues: Record<string, unknown> = {};
  if (updates.failureThreshold !== undefined)
    setValues.failureThreshold = updates.failureThreshold;
  if (updates.windowMinutes !== undefined)
    setValues.windowMinutes = updates.windowMinutes;
  if (updates.enabled !== undefined) setValues.enabled = updates.enabled;

  if (Object.keys(setValues).length === 0) return null;

  const [rule] = await db
    .update(integrationAlertRules)
    .set(setValues)
    .where(
      and(
        eq(integrationAlertRules.id, ruleId),
        eq(integrationAlertRules.organizationId, session.organizationId),
      ),
    )
    .returning();

  if (!rule) return null;

  logger.info("Alert rule updated", { ruleId, updates });

  revalidatePath(`/admin/integrations/${rule.integrationId}`);

  return {
    id: rule.id,
    failureThreshold: rule.failureThreshold,
    windowMinutes: rule.windowMinutes,
    enabled: rule.enabled,
    lastFiredAt: rule.lastFiredAt?.toISOString() ?? null,
    createdAt: rule.createdAt.toISOString(),
  };
}

/**
 * Delete an alert rule.
 */
export async function deleteAlertRule(ruleId: string): Promise<boolean> {
  const session = await requireSession();

  const [deleted] = await db
    .delete(integrationAlertRules)
    .where(
      and(
        eq(integrationAlertRules.id, ruleId),
        eq(integrationAlertRules.organizationId, session.organizationId),
      ),
    )
    .returning({ id: integrationAlertRules.id });

  if (deleted) {
    logger.info("Alert rule deleted", { ruleId });
  }

  return Boolean(deleted);
}
