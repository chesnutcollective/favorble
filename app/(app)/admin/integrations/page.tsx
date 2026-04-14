import type { Metadata } from "next";
import { db } from "@/db/drizzle";
import { integrationEvents } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import {
  INTEGRATION_REGISTRY,
  getAllCategories,
  getIntegrationsByCategory,
  checkEnvVarPresence,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  type IntegrationCategory,
} from "@/lib/integrations/registry";
import {
  getCustomLogoUrls,
  type CustomLogoUrls,
} from "@/app/actions/integration-management";
import { IntegrationsCockpitClient } from "./cockpit-client";

export const metadata: Metadata = {
  title: "Integrations",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type IntegrationCardData = {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  logoPath: string;
  fallbackIcon: string;
  hostLogoPath?: string;
  hostName?: string;
  category: IntegrationCategory;
  tags: string[];
  status: "connected" | "configured" | "missing_config" | "error";
  lastVerifiedAt: string | null;
  lastVerifiedStatus: string | null;
  lastLatencyMs: number | null;
  hasHealthCheck: boolean;
};

export type CategorySection = {
  category: IntegrationCategory;
  label: string;
  description: string;
  integrations: IntegrationCardData[];
};

export type CockpitSummary = {
  connected: number;
  configured: number;
  warnings: number;
  errors: number;
  total: number;
};

export type CockpitPageData = {
  categories: CategorySection[];
  summary: CockpitSummary;
  /** Map of integrationId -> signed custom logo URLs (tech + host) for integrations with uploaded logos */
  customLogoUrls: Record<string, CustomLogoUrls>;
};

export default async function IntegrationsPage() {
  const session = await requireSession();

  // Fetch the latest health_check event per integration from last 30 minutes
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

  let recentEvents: Array<{
    integrationId: string;
    status: string;
    latencyMs: number | null;
    createdAt: Date;
  }> = [];

  try {
    recentEvents = await db
      .select({
        integrationId: integrationEvents.integrationId,
        status: integrationEvents.status,
        latencyMs: integrationEvents.latencyMs,
        createdAt: integrationEvents.createdAt,
      })
      .from(integrationEvents)
      .where(
        and(
          eq(integrationEvents.organizationId, session.organizationId),
          eq(integrationEvents.eventType, "health_check"),
        ),
      )
      .orderBy(desc(integrationEvents.createdAt))
      .limit(200);
  } catch {
    // DB query might fail if no events exist yet — that's fine
  }

  // Build a map: integrationId -> latest event
  const latestEventMap = new Map<
    string,
    { status: string; latencyMs: number | null; createdAt: Date }
  >();
  for (const evt of recentEvents) {
    if (!latestEventMap.has(evt.integrationId)) {
      latestEventMap.set(evt.integrationId, {
        status: evt.status,
        latencyMs: evt.latencyMs,
        createdAt: evt.createdAt,
      });
    }
  }

  const categories = getAllCategories();
  const summary: CockpitSummary = {
    connected: 0,
    configured: 0,
    warnings: 0,
    errors: 0,
    total: INTEGRATION_REGISTRY.length,
  };

  // Canonical category order
  const categoryOrder: IntegrationCategory[] = [
    "data_pipeline",
    "communication",
    "ai",
    "infrastructure",
    "auth",
  ];

  const sortedCategories = categoryOrder.filter((c) =>
    categories.includes(c),
  );

  const categorySections: CategorySection[] = sortedCategories.map((cat) => {
    const integrations = getIntegrationsByCategory(cat);
    const cards: IntegrationCardData[] = integrations.map((integration) => {
      const envCheck = checkEnvVarPresence(integration);
      const latestEvent = latestEventMap.get(integration.id);

      // Determine status
      let status: IntegrationCardData["status"];
      if (
        latestEvent &&
        latestEvent.createdAt >= thirtyMinAgo &&
        latestEvent.status === "ok"
      ) {
        status = "connected";
      } else if (
        latestEvent &&
        latestEvent.status === "error"
      ) {
        status = "error";
      } else if (envCheck.allRequired) {
        status = "configured";
      } else {
        status = "missing_config";
      }

      switch (status) {
        case "connected":
          summary.connected++;
          break;
        case "configured":
          summary.configured++;
          break;
        case "missing_config":
          summary.warnings++;
          break;
        case "error":
          summary.errors++;
          break;
      }

      const hasHealthCheck = Boolean(
        integration.healthCheckUrl || integration.healthCheckEnvVar,
      );

      return {
        id: integration.id,
        name: integration.name,
        shortName: integration.shortName,
        tagline: integration.tagline,
        logoPath: integration.logoPath,
        fallbackIcon: integration.fallbackIcon,
        hostLogoPath: integration.hostLogoPath,
        hostName: integration.hostName,
        category: integration.category,
        tags: integration.tags,
        status,
        lastVerifiedAt: latestEvent
          ? latestEvent.createdAt.toISOString()
          : null,
        lastVerifiedStatus: latestEvent ? latestEvent.status : null,
        lastLatencyMs: latestEvent ? latestEvent.latencyMs : null,
        hasHealthCheck,
      };
    });

    return {
      category: cat,
      label: CATEGORY_LABELS[cat],
      description: CATEGORY_DESCRIPTIONS[cat],
      integrations: cards,
    };
  });

  // Fetch any custom logo URLs in parallel
  const allIntegrationIds = INTEGRATION_REGISTRY.map((i) => i.id);
  const customLogoUrls = await getCustomLogoUrls(allIntegrationIds);

  const data: CockpitPageData = {
    categories: categorySections,
    summary,
    customLogoUrls,
  };

  return <IntegrationsCockpitClient data={data} />;
}
