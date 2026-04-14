import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import { integrationAlertRules, integrationEvents, users } from "@/db/schema";
import { and, eq, gte, sql, isNull } from "drizzle-orm";
import { createNotification } from "@/lib/services/notify";
import { getIntegration } from "@/lib/integrations/registry";

/**
 * Alert evaluation cron — checks all enabled alert rules against
 * recent integration events and fires notifications to admin users
 * when thresholds are exceeded.
 *
 * Schedule: every 10 minutes (cron: 0,10,20,30,40,50 * * * *)
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

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    logger.error("Cron integration-alerts unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rulesEvaluated = 0;
  let alertsFired = 0;

  try {
    // Load all enabled alert rules
    const rules = await db
      .select()
      .from(integrationAlertRules)
      .where(eq(integrationAlertRules.enabled, "true"));

    const now = new Date();

    for (const rule of rules) {
      rulesEvaluated++;

      const windowStart = new Date(
        now.getTime() - rule.windowMinutes * 60 * 1000,
      );

      // Count errors in the window
      const [errorAgg] = await db
        .select({
          errorCount: sql<number>`count(*)::int`,
        })
        .from(integrationEvents)
        .where(
          and(
            eq(integrationEvents.integrationId, rule.integrationId),
            eq(integrationEvents.status, "error"),
            gte(integrationEvents.createdAt, windowStart),
          ),
        );

      const errorCount = errorAgg?.errorCount ?? 0;

      if (errorCount < rule.failureThreshold) continue;

      // Check cooldown — don't re-fire if we already fired within the window
      if (
        rule.lastFiredAt &&
        rule.lastFiredAt.getTime() > windowStart.getTime()
      ) {
        continue;
      }

      // Threshold exceeded — fire notification to all admin users in the org
      const integration = getIntegration(rule.integrationId);
      const integrationName = integration?.name ?? rule.integrationId;

      const adminUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.organizationId, rule.organizationId),
            eq(users.role, "admin"),
            eq(users.isActive, true),
            isNull(users.deletedAt),
          ),
        );

      for (const admin of adminUsers) {
        await createNotification({
          organizationId: rule.organizationId,
          userId: admin.id,
          title: `Integration alert: ${integrationName}`,
          body: `The ${integrationName} integration has failed ${errorCount} times in the last ${rule.windowMinutes} minutes`,
          priority: "urgent",
          actionHref: `/admin/integrations/${rule.integrationId}`,
          dedupeKey: `integration-alert:${rule.integrationId}:${rule.id}`,
        });
      }

      // Update lastFiredAt
      await db
        .update(integrationAlertRules)
        .set({ lastFiredAt: now })
        .where(eq(integrationAlertRules.id, rule.id));

      alertsFired++;

      logger.info("Integration alert fired", {
        integrationId: rule.integrationId,
        errorCount,
        threshold: rule.failureThreshold,
        windowMinutes: rule.windowMinutes,
        adminCount: adminUsers.length,
      });
    }
  } catch (err) {
    logger.error("Cron integration-alerts failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const result = { rulesEvaluated, alertsFired };
  logger.info("Cron integration-alerts complete", result);
  return NextResponse.json({ success: true, ...result });
}
