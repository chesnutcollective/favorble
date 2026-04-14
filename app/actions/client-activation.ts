"use server";

import { and, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  cases,
  clientInvitations,
  portalActivityEvents,
  portalUsers,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger/server";

/**
 * Client-usage activation funnel. Produces the four numbers the C5 report
 * renders:
 *
 *   Invited   — count of client_invitations sent inside the period.
 *   Activated — count of portal_users with activated_at inside the period
 *               whose status is 'active'.
 *   Engaged   — distinct portal_user_id from portal_activity_events in the
 *               period whose event_type is NOT 'login' (we want meaningful
 *               engagement, not just bounces).
 *   Closed    — cases with closed_at inside the period and a terminal
 *               case_status.
 *
 * Ratios:
 *   activationRate = activated / invited       (0 when invited = 0)
 *   engagementRate = engaged   / activated     (0 when activated = 0)
 *
 * All queries are scoped to the caller's `organizationId`.
 */

export type ActivationPeriod = "7d" | "30d" | "90d" | "all";

export type ActivationMetrics = {
  period: ActivationPeriod;
  periodStart: string | null;
  invited: number;
  activated: number;
  engaged: number;
  closed: number;
  activationRate: number;
  engagementRate: number;
};

function periodStart(period: ActivationPeriod): Date | null {
  if (period === "all") return null;
  const now = Date.now();
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return new Date(now - days * 24 * 60 * 60 * 1000);
}

async function safeCount<T>(
  q: Promise<T[]>,
  extract: (row: T) => number,
): Promise<number> {
  try {
    const rows = await q;
    if (rows.length === 0) return 0;
    return extract(rows[0]) ?? 0;
  } catch (error) {
    logger.error("client-activation: count query failed", { error });
    return 0;
  }
}

export async function getActivationMetrics(
  period: ActivationPeriod = "30d",
): Promise<ActivationMetrics> {
  const session = await requireSession();
  const orgId = session.organizationId;
  const start = periodStart(period);

  const invitedPromise = safeCount<{ n: number }>(
    db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(clientInvitations)
      .where(
        and(
          eq(clientInvitations.organizationId, orgId),
          isNotNull(clientInvitations.sentAt),
          start
            ? gte(clientInvitations.sentAt, start)
            : sql`true`,
        ),
      ),
    (r) => r.n,
  );

  const activatedPromise = safeCount<{ n: number }>(
    db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(portalUsers)
      .where(
        and(
          eq(portalUsers.organizationId, orgId),
          eq(portalUsers.status, "active"),
          isNotNull(portalUsers.activatedAt),
          start ? gte(portalUsers.activatedAt, start) : sql`true`,
        ),
      ),
    (r) => r.n,
  );

  const engagedPromise = safeCount<{ n: number }>(
    db
      .select({
        n: sql<number>`cast(count(distinct ${portalActivityEvents.portalUserId}) as int)`,
      })
      .from(portalActivityEvents)
      .where(
        and(
          eq(portalActivityEvents.organizationId, orgId),
          ne(portalActivityEvents.eventType, "login"),
          start
            ? gte(portalActivityEvents.createdAt, start)
            : sql`true`,
        ),
      ),
    (r) => r.n,
  );

  const closedPromise = safeCount<{ n: number }>(
    db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, orgId),
          isNotNull(cases.closedAt),
          start ? gte(cases.closedAt, start) : sql`true`,
        ),
      ),
    (r) => r.n,
  );

  const [invited, activated, engaged, closed] = await Promise.all([
    invitedPromise,
    activatedPromise,
    engagedPromise,
    closedPromise,
  ]);

  const activationRate =
    invited > 0 ? Math.round((activated / invited) * 100) / 100 : 0;
  const engagementRate =
    activated > 0 ? Math.round((engaged / activated) * 100) / 100 : 0;

  return {
    period,
    periodStart: start ? start.toISOString() : null,
    invited,
    activated,
    engaged,
    closed,
    activationRate,
    engagementRate,
  };
}
