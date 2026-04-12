import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import { organizations } from "@/db/schema";
import {
  INTEGRATION_REGISTRY,
  resolveHealthCheckUrl,
  checkEnvVarPresence,
} from "@/lib/integrations/registry";
import { logIntegrationEvent } from "@/lib/services/integration-event-logger";

/**
 * Scheduled health check cron — pings every health-checkable integration
 * and records results in `integration_events`. For integrations without
 * a health URL, checks env var presence as a synthetic health signal.
 *
 * Schedule: every 5 minutes (cron: 0,5,10,...,55 * * * *)
 * Auth: CRON_SECRET Bearer token
 */

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${secret}`;
}

const HEALTH_CHECK_TIMEOUT_MS = 5000;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    logger.error("Cron integration-health unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // We need an org ID for event logging — use the first org
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .limit(1);

  if (!org) {
    logger.error("Cron integration-health: no organization found");
    return NextResponse.json(
      { error: "No organization found" },
      { status: 500 },
    );
  }

  const orgId = org.id;
  let ok = 0;
  let warn = 0;
  let error = 0;
  let skipped = 0;

  for (const integration of INTEGRATION_REGISTRY) {
    const healthUrl = resolveHealthCheckUrl(integration);

    if (healthUrl) {
      // Ping the health URL with a timeout
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          HEALTH_CHECK_TIMEOUT_MS,
        );
        const response = await fetch(healthUrl, {
          signal: controller.signal,
          method: integration.healthCheckMethod ?? "GET",
        });
        clearTimeout(timeout);
        const latencyMs = Date.now() - start;
        const expectedStatus = integration.healthCheckExpectedStatus ?? 200;
        const isOk = response.status === expectedStatus;

        await logIntegrationEvent({
          organizationId: orgId,
          integrationId: integration.id,
          eventType: "health_check",
          status: isOk ? "ok" : "error",
          latencyMs,
          httpStatus: response.status,
          summary: isOk
            ? `Health check passed (${response.status})`
            : `Health check failed (${response.status}, expected ${expectedStatus})`,
        });

        if (isOk) ok++;
        else error++;
      } catch (err) {
        const latencyMs = Date.now() - start;
        const isTimeout =
          err instanceof Error && err.name === "AbortError";

        await logIntegrationEvent({
          organizationId: orgId,
          integrationId: integration.id,
          eventType: "health_check",
          status: isTimeout ? "timeout" : "error",
          latencyMs,
          summary: isTimeout
            ? `Health check timed out after ${HEALTH_CHECK_TIMEOUT_MS}ms`
            : `Health check failed: ${err instanceof Error ? err.message : String(err)}`,
        });

        error++;
      }
    } else if (integration.envVars.length > 0) {
      // No health URL — check env var presence as synthetic health
      const envCheck = checkEnvVarPresence(integration);
      const missingRequired = integration.envVars
        .filter((v) => v.required)
        .some((v) => envCheck.missing.includes(v.key));
      const missingOptional =
        envCheck.missing.length > 0 && !missingRequired;

      let status: "ok" | "warn" | "error";
      let summary: string;

      if (missingRequired) {
        status = "error";
        summary = `Missing required env vars: ${envCheck.missing.filter((k) => integration.envVars.find((v) => v.key === k && v.required)).join(", ")}`;
        error++;
      } else if (missingOptional) {
        status = "warn";
        summary = `Missing optional env vars: ${envCheck.missing.join(", ")}`;
        warn++;
      } else {
        status = "ok";
        summary = `All ${envCheck.configured.length} env vars configured`;
        ok++;
      }

      await logIntegrationEvent({
        organizationId: orgId,
        integrationId: integration.id,
        eventType: "health_check",
        status,
        summary,
      });
    } else {
      // No health URL, no env vars — skip
      skipped++;
    }
  }

  const result = {
    checked: ok + warn + error,
    ok,
    warn,
    error,
    skipped,
  };

  logger.info("Cron integration-health complete", result);
  return NextResponse.json({ success: true, ...result });
}
