import "server-only";
import { db } from "@/db/drizzle";
import { integrationEvents } from "@/db/schema";
import { logger } from "@/lib/logger/server";

/**
 * Log an integration event (health check, webhook delivery, API call, etc.)
 * to the `integration_events` table. Called from webhook handlers and the
 * health-check ping API to populate the per-integration detail page.
 */
export async function logIntegrationEvent(params: {
  organizationId: string;
  integrationId: string;
  eventType: string;
  status: "ok" | "warn" | "error" | "timeout";
  latencyMs?: number | null;
  httpStatus?: number | null;
  summary?: string | null;
  payload?: unknown;
  webhookPath?: string | null;
  webhookEventType?: string | null;
}): Promise<string | null> {
  try {
    const [row] = await db
      .insert(integrationEvents)
      .values({
        organizationId: params.organizationId,
        integrationId: params.integrationId,
        eventType: params.eventType,
        status: params.status,
        latencyMs: params.latencyMs ?? null,
        httpStatus: params.httpStatus ?? null,
        summary: params.summary ?? null,
        payload: params.payload ?? null,
        webhookPath: params.webhookPath ?? null,
        webhookEventType: params.webhookEventType ?? null,
      })
      .returning({ id: integrationEvents.id });

    return row?.id ?? null;
  } catch (error) {
    logger.error("Failed to log integration event", {
      integrationId: params.integrationId,
      eventType: params.eventType,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
