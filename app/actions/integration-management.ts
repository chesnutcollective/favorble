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
import {
  uploadRailwayDocumentAtKey,
  getRailwaySignedUrl,
  isRailwayBucketConfigured,
} from "@/lib/storage/railway-bucket";

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

// ── Logo Upload ──

const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
]);
const MAX_LOGO_SIZE = 500 * 1024; // 500 KB

/**
 * Upload a custom integration logo. Stores the file in the Railway bucket
 * (production) or as a base64 data URL in the event payload (dev fallback).
 * Records a `config_changed` event for the audit trail.
 */
export async function uploadIntegrationLogo(
  formData: FormData,
): Promise<{ success: boolean; signedUrl?: string; error?: string }> {
  const session = await requireSession();
  const integrationId = formData.get("integrationId");
  const file = formData.get("file");

  if (typeof integrationId !== "string" || !integrationId) {
    return { success: false, error: "Missing integrationId" };
  }

  const config = getIntegration(integrationId);
  if (!config) {
    return { success: false, error: "Unknown integration" };
  }

  if (!(file instanceof File)) {
    return { success: false, error: "No file provided" };
  }

  if (!ALLOWED_LOGO_TYPES.has(file.type)) {
    return {
      success: false,
      error: "Invalid file type. Must be PNG, JPEG, or SVG.",
    };
  }

  if (file.size > MAX_LOGO_SIZE) {
    return { success: false, error: "File too large. Maximum size is 500 KB." };
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Determine extension from content type
  const extMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/svg+xml": "svg",
  };
  const ext = extMap[file.type] ?? "png";

  let customLogoPath: string;
  let signedUrl: string;

  if (isRailwayBucketConfigured()) {
    // Production: upload to Railway bucket
    const key = `integration-logos/${integrationId}-logo.${ext}`;
    const result = await uploadRailwayDocumentAtKey(key, buffer, file.type);
    customLogoPath = result.storagePath;
    signedUrl = await getRailwaySignedUrl(customLogoPath);
  } else {
    // Dev fallback: store as base64 data URL in the event payload
    const base64 = buffer.toString("base64");
    customLogoPath = `data:${file.type};base64,${base64}`;
    signedUrl = customLogoPath;
  }

  // Record config_changed event with the custom logo path
  await db.insert(integrationEvents).values({
    organizationId: session.organizationId,
    integrationId,
    eventType: "config_changed",
    status: "ok",
    summary: "Logo updated",
    payload: { customLogoPath },
  });

  logger.info("Integration logo uploaded", { integrationId });

  revalidatePath(`/admin/integrations/${integrationId}`);
  revalidatePath("/admin/integrations");

  return { success: true, signedUrl };
}

/**
 * Look up whether a custom logo has been uploaded for the given integration.
 * Returns a signed URL (or data URL in dev) if one exists, null otherwise.
 */
export async function getCustomLogoUrl(
  integrationId: string,
): Promise<string | null> {
  const session = await requireSession();

  const [row] = await db
    .select({ payload: integrationEvents.payload })
    .from(integrationEvents)
    .where(
      and(
        eq(integrationEvents.organizationId, session.organizationId),
        eq(integrationEvents.integrationId, integrationId),
        eq(integrationEvents.eventType, "config_changed"),
      ),
    )
    .orderBy(desc(integrationEvents.createdAt))
    .limit(1);

  if (!row?.payload) return null;

  const payload = row.payload as Record<string, unknown>;
  const customLogoPath = payload.customLogoPath;
  if (typeof customLogoPath !== "string") return null;

  // Data URL (dev fallback) — return directly
  if (customLogoPath.startsWith("data:")) return customLogoPath;

  // Railway bucket path — sign it
  try {
    return await getRailwaySignedUrl(customLogoPath);
  } catch (err) {
    logger.warn("Failed to sign custom logo URL", {
      integrationId,
      error: err,
    });
    return null;
  }
}

/**
 * Batch lookup of custom logo URLs for multiple integrations.
 * Returns a map of integrationId -> signed URL for those that have custom logos.
 */
export async function getCustomLogoUrls(
  integrationIds: string[],
): Promise<Record<string, string>> {
  if (integrationIds.length === 0) return {};

  const session = await requireSession();

  // Find the most recent config_changed event per integration that has a customLogoPath
  const rows = await db
    .select({
      integrationId: integrationEvents.integrationId,
      payload: integrationEvents.payload,
    })
    .from(integrationEvents)
    .where(
      and(
        eq(integrationEvents.organizationId, session.organizationId),
        eq(integrationEvents.eventType, "config_changed"),
      ),
    )
    .orderBy(desc(integrationEvents.createdAt));

  // Deduplicate: keep only the most recent per integration
  const latestPerIntegration = new Map<string, string>();
  for (const row of rows) {
    if (latestPerIntegration.has(row.integrationId)) continue;
    const payload = row.payload as Record<string, unknown> | null;
    const customLogoPath = payload?.customLogoPath;
    if (typeof customLogoPath === "string") {
      latestPerIntegration.set(row.integrationId, customLogoPath);
    }
  }

  // Sign URLs in parallel
  const result: Record<string, string> = {};
  const entries = Array.from(latestPerIntegration.entries()).filter(([id]) =>
    integrationIds.includes(id),
  );

  await Promise.all(
    entries.map(async ([id, path]) => {
      if (path.startsWith("data:")) {
        result[id] = path;
        return;
      }
      try {
        result[id] = await getRailwaySignedUrl(path);
      } catch {
        // Skip if signing fails
      }
    }),
  );

  return result;
}
