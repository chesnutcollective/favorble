"use server";

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  cases,
  contacts,
  portalActivityEvents,
  portalUsers,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger/server";
import {
  getActivationMetrics,
  type ActivationMetrics,
  type ActivationPeriod,
} from "@/app/actions/client-activation";

/**
 * Data loader for the /reports/client-usage (C5) page.
 *
 * Wave 2 replaces the earlier stub with real queries against the portal
 * schema. Everything is scoped to the caller's organization and wrapped in
 * try/catch so a transient DB hiccup renders zeros instead of crashing.
 */

export type ClientUsageRow = {
  contactId: string;
  portalUserId: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  invitedAt: string | null;
  activatedAt: string | null;
  lastLoginAt: string | null;
  loginCount: number;
  activityCount30d: number;
  caseNumber: string | null;
};

export type ClientUsageReport = {
  metrics: ActivationMetrics;
  rows: ClientUsageRow[];
};

export async function getClientUsageReport(
  period: ActivationPeriod = "30d",
): Promise<ClientUsageReport> {
  const session = await requireSession();
  const orgId = session.organizationId;

  let metrics: ActivationMetrics;
  try {
    metrics = await getActivationMetrics(period);
  } catch (error) {
    logger.error("client-usage: getActivationMetrics failed", { error });
    metrics = {
      period,
      periodStart: null,
      invited: 0,
      activated: 0,
      engaged: 0,
      closed: 0,
      activationRate: 0,
      engagementRate: 0,
    };
  }

  let rows: ClientUsageRow[] = [];
  try {
    // Per-claimant usage snapshot — joins portal_users → contacts and
    // aggregates a 30-day activity count. `cases.caseNumber` is a
    // best-effort lookup (null when the claimant isn't linked to any case
    // yet; the UI handles that).
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    );

    const dbRows = await db
      .select({
        contactId: portalUsers.contactId,
        portalUserId: portalUsers.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: portalUsers.email,
        status: portalUsers.status,
        invitedAt: portalUsers.invitedAt,
        activatedAt: portalUsers.activatedAt,
        lastLoginAt: portalUsers.lastLoginAt,
        loginCount: portalUsers.loginCount,
        activityCount30d: sql<number>`cast((
          select count(*) from ${portalActivityEvents}
          where ${portalActivityEvents.portalUserId} = ${portalUsers.id}
            and ${portalActivityEvents.createdAt} >= ${thirtyDaysAgo.toISOString()}
        ) as int)`,
        caseNumber: sql<
          string | null
        >`(select ${cases.caseNumber} from ${cases}
             inner join case_contacts on case_contacts.case_id = ${cases.id}
             where case_contacts.contact_id = ${portalUsers.contactId}
             order by ${cases.createdAt} desc
             limit 1)`,
      })
      .from(portalUsers)
      .innerJoin(contacts, eq(contacts.id, portalUsers.contactId))
      .where(
        and(
          eq(portalUsers.organizationId, orgId),
          isNotNull(portalUsers.email),
        ),
      )
      .orderBy(desc(portalUsers.invitedAt))
      .limit(200);

    rows = dbRows.map((r) => ({
      contactId: r.contactId,
      portalUserId: r.portalUserId,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      status: r.status,
      invitedAt: r.invitedAt?.toISOString() ?? null,
      activatedAt: r.activatedAt?.toISOString() ?? null,
      lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
      loginCount: r.loginCount ?? 0,
      activityCount30d: Number(r.activityCount30d ?? 0),
      caseNumber: r.caseNumber ?? null,
    }));
  } catch (error) {
    logger.error("client-usage: rows query failed", { error });
    rows = [];
  }

  return { metrics, rows };
}
