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

export type LogoSlot = "tech" | "host";

function parseSlot(raw: unknown): LogoSlot {
  return raw === "host" ? "host" : "tech";
}

const SLOT_CONFIG: Record<
  LogoSlot,
  { payloadKey: "customLogoPath" | "customHostLogoPath"; keySuffix: string; summaryLabel: string }
> = {
  tech: { payloadKey: "customLogoPath", keySuffix: "logo", summaryLabel: "Logo" },
  host: { payloadKey: "customHostLogoPath", keySuffix: "host-logo", summaryLabel: "Host logo" },
};

/**
 * Upload a custom integration logo. Stores the file in the Railway bucket
 * (production) or as a base64 data URL in the event payload (dev fallback).
 * Records a `config_changed` event for the audit trail.
 *
 * The `slot` field on the FormData ("tech" | "host") selects which logo
 * is being replaced. Defaults to "tech" for back-compat.
 */
export async function uploadIntegrationLogo(
  formData: FormData,
): Promise<{
  success: boolean;
  signedUrl?: string;
  storagePath?: string;
  error?: string;
}> {
  const session = await requireSession();
  const integrationId = formData.get("integrationId");
  const file = formData.get("file");
  const slot = parseSlot(formData.get("slot"));

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

  const slotCfg = SLOT_CONFIG[slot];
  let storagePath: string;
  let signedUrl: string;

  if (isRailwayBucketConfigured()) {
    const key = `integration-logos/${integrationId}-${slotCfg.keySuffix}.${ext}`;
    const result = await uploadRailwayDocumentAtKey(key, buffer, file.type);
    storagePath = result.storagePath;
    signedUrl = await getRailwaySignedUrl(storagePath);
  } else {
    const base64 = buffer.toString("base64");
    storagePath = `data:${file.type};base64,${base64}`;
    signedUrl = storagePath;
  }

  await db.insert(integrationEvents).values({
    organizationId: session.organizationId,
    integrationId,
    eventType: "config_changed",
    status: "ok",
    summary: `${slotCfg.summaryLabel} updated`,
    payload: { [slotCfg.payloadKey]: storagePath },
  });

  logger.info("Integration logo uploaded", { integrationId, slot });

  revalidatePath(`/admin/integrations/${integrationId}`);
  revalidatePath("/admin/integrations");

  return { success: true, signedUrl, storagePath };
}

/**
 * Fetch a favicon from a URL and save it as the integration's logo.
 * Uses Google's favicon service to reliably get high-res favicons for
 * any domain. The admin enters a URL like "https://clerk.com" and we
 * pull the 128px icon, upload it to the bucket, and record the event.
 */
export async function fetchFaviconAsLogo(input: {
  integrationId: string;
  url: string;
  slot?: LogoSlot;
}): Promise<{
  success: boolean;
  signedUrl?: string;
  storagePath?: string;
  error?: string;
}> {
  const session = await requireSession();
  const slot: LogoSlot = input.slot === "host" ? "host" : "tech";

  const config = getIntegration(input.integrationId);
  if (!config) {
    return { success: false, error: "Unknown integration" };
  }

  // Extract the domain from the URL
  let domain: string;
  try {
    const parsed = new URL(
      input.url.startsWith("http") ? input.url : `https://${input.url}`,
    );
    domain = parsed.hostname;
  } catch {
    return { success: false, error: "Invalid URL" };
  }

  // Fetch favicon via Google's service (reliable, returns PNG, supports size param)
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;

  let buffer: Buffer;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(faviconUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        success: false,
        error: `Google favicon service returned ${response.status}`,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);

    // Google returns a tiny 1x1 or 16x16 default when the domain has no favicon.
    // Reject very small images (< 500 bytes is almost certainly the default).
    if (buffer.length < 500) {
      return {
        success: false,
        error: `No favicon found for ${domain}. Try uploading a logo file instead.`,
      };
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch favicon: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }

  const slotCfg = SLOT_CONFIG[slot];
  let storagePath: string;
  let signedUrl: string;

  if (isRailwayBucketConfigured()) {
    const key = `integration-logos/${input.integrationId}-${slotCfg.keySuffix}.png`;
    const result = await uploadRailwayDocumentAtKey(key, buffer, "image/png");
    storagePath = result.storagePath;
    signedUrl = await getRailwaySignedUrl(storagePath);
  } else {
    const base64 = buffer.toString("base64");
    storagePath = `data:image/png;base64,${base64}`;
    signedUrl = storagePath;
  }

  await db.insert(integrationEvents).values({
    organizationId: session.organizationId,
    integrationId: input.integrationId,
    eventType: "config_changed",
    status: "ok",
    summary: `${slotCfg.summaryLabel} fetched from ${domain}`,
    payload: { [slotCfg.payloadKey]: storagePath, sourceDomain: domain },
  });

  logger.info("Integration favicon fetched", {
    integrationId: input.integrationId,
    domain,
    slot,
  });

  revalidatePath(`/admin/integrations/${input.integrationId}`);
  revalidatePath("/admin/integrations");

  return { success: true, signedUrl, storagePath };
}

export type CustomLogoRef = { url: string; storagePath: string };
export type CustomLogoUrls = {
  tech: CustomLogoRef | null;
  host: CustomLogoRef | null;
};

/**
 * Maximum size (in characters) of a data: URL we're willing to inline into
 * SSR HTML. Large base64-encoded images (often >100 KB) balloon the initial
 * document payload — we saw a single Outlook upload push /dashboard and
 * /admin/integrations past 1 MB of HTML. Anything larger than this threshold
 * is dropped so the UI falls back to the shipped SVG logo for that slot.
 * Real Railway-signed URLs (http/https) are unaffected.
 */
const MAX_INLINE_DATA_URL_CHARS = 8 * 1024;

async function signStoragePath(path: string): Promise<string | null> {
  if (path.startsWith("data:")) {
    return path.length > MAX_INLINE_DATA_URL_CHARS ? null : path;
  }
  try {
    return await getRailwaySignedUrl(path);
  } catch {
    return null;
  }
}

/**
 * Look up custom logos uploaded for an integration. Scans recent
 * `config_changed` events and returns the most-recent tech + host overrides
 * independently — each slot is tracked separately so uploading one does not
 * clear the other.
 */
export async function getCustomLogoUrl(
  integrationId: string,
): Promise<CustomLogoUrls> {
  const session = await requireSession();

  const rows = await db
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
    .limit(50);

  let techPath: string | null = null;
  let hostPath: string | null = null;
  for (const row of rows) {
    const payload = row.payload as Record<string, unknown> | null;
    if (!payload) continue;
    if (!techPath && typeof payload.customLogoPath === "string") {
      techPath = payload.customLogoPath;
    }
    if (!hostPath && typeof payload.customHostLogoPath === "string") {
      hostPath = payload.customHostLogoPath;
    }
    if (techPath && hostPath) break;
  }

  const [techUrl, hostUrl] = await Promise.all([
    techPath ? signStoragePath(techPath) : Promise.resolve(null),
    hostPath ? signStoragePath(hostPath) : Promise.resolve(null),
  ]);

  if (techPath && !techUrl) {
    logger.warn("Failed to sign custom tech logo URL", { integrationId });
  }
  if (hostPath && !hostUrl) {
    logger.warn("Failed to sign custom host logo URL", { integrationId });
  }

  return {
    tech: techPath && techUrl ? { url: techUrl, storagePath: techPath } : null,
    host: hostPath && hostUrl ? { url: hostUrl, storagePath: hostPath } : null,
  };
}

export type UploadedLogo = {
  /** The storage path (bucket key or data: URL). Round-trip safely — server
   * re-validates membership in the org's event log before applying. */
  storagePath: string;
  /** Signed URL for display. */
  signedUrl: string;
  /** The integration this logo was last uploaded for. */
  lastUsedFor: string;
  /** Whether it was last used as tech or host. */
  lastUsedAs: LogoSlot;
  /** Favicon source domain, if this came from the fetch-favicon flow. */
  sourceDomain?: string;
  updatedAt: string;
};

/**
 * List every unique custom logo uploaded or favicon-fetched in this org.
 * Dedupes by storage path, sorted most-recent first. Used by the admin UI
 * to let operators reuse an existing asset instead of re-uploading.
 */
export async function listUploadedLogos(): Promise<UploadedLogo[]> {
  const session = await requireSession();

  const rows = await db
    .select({
      integrationId: integrationEvents.integrationId,
      payload: integrationEvents.payload,
      createdAt: integrationEvents.createdAt,
    })
    .from(integrationEvents)
    .where(
      and(
        eq(integrationEvents.organizationId, session.organizationId),
        eq(integrationEvents.eventType, "config_changed"),
      ),
    )
    .orderBy(desc(integrationEvents.createdAt))
    .limit(500);

  // Dedup by storagePath, keeping the most-recent metadata (first seen in
  // desc order == most recent).
  const seen = new Map<
    string,
    {
      slot: LogoSlot;
      integrationId: string;
      sourceDomain?: string;
      createdAt: Date;
    }
  >();

  for (const row of rows) {
    const payload = row.payload as Record<string, unknown> | null;
    if (!payload) continue;

    const techPath = payload.customLogoPath;
    if (typeof techPath === "string" && !seen.has(techPath)) {
      seen.set(techPath, {
        slot: "tech",
        integrationId: row.integrationId,
        sourceDomain:
          typeof payload.sourceDomain === "string"
            ? payload.sourceDomain
            : undefined,
        createdAt: row.createdAt,
      });
    }

    const hostPath = payload.customHostLogoPath;
    if (typeof hostPath === "string" && !seen.has(hostPath)) {
      seen.set(hostPath, {
        slot: "host",
        integrationId: row.integrationId,
        sourceDomain:
          typeof payload.sourceDomain === "string"
            ? payload.sourceDomain
            : undefined,
        createdAt: row.createdAt,
      });
    }
  }

  const signed = await Promise.all(
    Array.from(seen.entries()).map(async ([storagePath, meta]) => {
      const signedUrl = await signStoragePath(storagePath);
      if (!signedUrl) return null;
      const logo: UploadedLogo = {
        storagePath,
        signedUrl,
        lastUsedFor: meta.integrationId,
        lastUsedAs: meta.slot,
        updatedAt: meta.createdAt.toISOString(),
        ...(meta.sourceDomain ? { sourceDomain: meta.sourceDomain } : {}),
      };
      return logo;
    }),
  );

  const resolved: UploadedLogo[] = [];
  for (const entry of signed) {
    if (entry) resolved.push(entry);
  }
  resolved.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return resolved;
}

/**
 * Apply an existing logo (from the org's prior uploads) to an integration
 * slot. Validates the storagePath is present in this org's event log to
 * prevent pointing at arbitrary bucket keys.
 */
export async function applyExistingLogo(input: {
  integrationId: string;
  slot: LogoSlot;
  storagePath: string;
}): Promise<{
  success: boolean;
  signedUrl?: string;
  storagePath?: string;
  error?: string;
}> {
  const session = await requireSession();

  const config = getIntegration(input.integrationId);
  if (!config) return { success: false, error: "Unknown integration" };

  const slot: LogoSlot = input.slot === "host" ? "host" : "tech";

  // Validate storagePath exists in this org's config_changed history
  const rows = await db
    .select({ payload: integrationEvents.payload })
    .from(integrationEvents)
    .where(
      and(
        eq(integrationEvents.organizationId, session.organizationId),
        eq(integrationEvents.eventType, "config_changed"),
      ),
    )
    .orderBy(desc(integrationEvents.createdAt))
    .limit(500);

  const known = rows.some((r) => {
    const p = r.payload as Record<string, unknown> | null;
    if (!p) return false;
    return (
      p.customLogoPath === input.storagePath ||
      p.customHostLogoPath === input.storagePath
    );
  });
  if (!known) {
    return { success: false, error: "Logo not found in your library" };
  }

  const slotCfg = SLOT_CONFIG[slot];

  await db.insert(integrationEvents).values({
    organizationId: session.organizationId,
    integrationId: input.integrationId,
    eventType: "config_changed",
    status: "ok",
    summary: `${slotCfg.summaryLabel} reused from library`,
    payload: { [slotCfg.payloadKey]: input.storagePath, reusedFromLibrary: true },
  });

  const signedUrl = await signStoragePath(input.storagePath);
  if (!signedUrl) {
    return { success: false, error: "Failed to sign logo URL" };
  }

  logger.info("Integration logo reused from library", {
    integrationId: input.integrationId,
    slot,
  });

  revalidatePath(`/admin/integrations/${input.integrationId}`);
  revalidatePath("/admin/integrations");

  return { success: true, signedUrl, storagePath: input.storagePath };
}

/**
 * Batch lookup of custom logo URLs. Returns a map of integrationId to its
 * tech/host overrides (only integrations with at least one override appear
 * in the map).
 */
export async function getCustomLogoUrls(
  integrationIds: string[],
): Promise<Record<string, CustomLogoUrls>> {
  if (integrationIds.length === 0) return {};

  const session = await requireSession();

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

  const pathsPerIntegration = new Map<
    string,
    { tech?: string; host?: string }
  >();
  for (const row of rows) {
    if (!integrationIds.includes(row.integrationId)) continue;
    const current = pathsPerIntegration.get(row.integrationId) ?? {};
    const payload = row.payload as Record<string, unknown> | null;
    if (!payload) continue;
    if (!current.tech && typeof payload.customLogoPath === "string") {
      current.tech = payload.customLogoPath;
    }
    if (!current.host && typeof payload.customHostLogoPath === "string") {
      current.host = payload.customHostLogoPath;
    }
    pathsPerIntegration.set(row.integrationId, current);
  }

  const result: Record<string, CustomLogoUrls> = {};
  await Promise.all(
    Array.from(pathsPerIntegration.entries()).map(async ([id, paths]) => {
      const [techUrl, hostUrl] = await Promise.all([
        paths.tech ? signStoragePath(paths.tech) : Promise.resolve(null),
        paths.host ? signStoragePath(paths.host) : Promise.resolve(null),
      ]);
      const tech =
        paths.tech && techUrl ? { url: techUrl, storagePath: paths.tech } : null;
      const host =
        paths.host && hostUrl ? { url: hostUrl, storagePath: paths.host } : null;
      if (tech || host) result[id] = { tech, host };
    }),
  );

  return result;
}
