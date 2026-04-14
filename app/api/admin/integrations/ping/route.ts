import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { integrationEvents } from "@/db/schema";
import { logger } from "@/lib/logger/server";
import {
  getIntegration,
  resolveHealthCheckUrl,
  checkEnvVarPresence,
} from "@/lib/integrations/registry";

/**
 * POST /api/admin/integrations/ping
 *
 * Ping an integration's health check URL and record the result.
 * Falls back to env-var presence check when no health URL is available.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { integrationId } = body as { integrationId: string };

    if (!integrationId) {
      return NextResponse.json(
        { error: "integrationId is required" },
        { status: 400 },
      );
    }

    const integration = getIntegration(integrationId);
    if (!integration) {
      return NextResponse.json(
        { error: `Unknown integration: ${integrationId}` },
        { status: 404 },
      );
    }

    const healthUrl = resolveHealthCheckUrl(integration);
    const start = Date.now();
    let status: "ok" | "warn" | "error" | "timeout";
    let httpStatus: number | null = null;
    let summary: string;

    if (healthUrl) {
      // Ping the health check URL with a 5-second timeout
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const method = integration.healthCheckMethod ?? "GET";
        const expectedStatus = integration.healthCheckExpectedStatus ?? 200;

        const response = await fetch(healthUrl, {
          method,
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timeout);

        httpStatus = response.status;
        if (response.status === expectedStatus) {
          status = "ok";
          summary = `Health check passed (${response.status})`;
        } else {
          status = "error";
          summary = `Unexpected status ${response.status} (expected ${expectedStatus})`;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          status = "timeout";
          summary = "Health check timed out (5s)";
        } else {
          status = "error";
          summary = `Health check failed: ${err instanceof Error ? err.message : "Unknown error"}`;
        }
      }
    } else {
      // No health check URL — fall back to env var presence
      const envCheck = checkEnvVarPresence(integration);
      if (envCheck.allRequired) {
        status = "ok";
        summary = `All required env vars present (${envCheck.configured.length} configured)`;
      } else {
        status = "warn";
        summary = `Missing required env vars: ${envCheck.missing.join(", ")}`;
      }
    }

    const latencyMs = Date.now() - start;
    const checkedAt = new Date().toISOString();

    // Record the event in the database
    try {
      await db.insert(integrationEvents).values({
        organizationId: session.organizationId,
        integrationId,
        eventType: "health_check",
        status,
        latencyMs,
        httpStatus,
        summary,
        createdAt: new Date(),
      });
    } catch (dbErr) {
      logger.error("Failed to record health check event", {
        integrationId,
        error: dbErr,
      });
      // Don't fail the request — still return the ping result
    }

    return NextResponse.json({ status, latencyMs, checkedAt });
  } catch (error) {
    logger.error("Integration ping error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
