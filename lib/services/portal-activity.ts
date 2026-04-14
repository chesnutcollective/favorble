import "server-only";

import { db } from "@/db/drizzle";
import { portalActivityEvents } from "@/db/schema";
import { logger } from "@/lib/logger/server";
import {
  getPortalRequestContext,
  tryGetPortalSession,
} from "@/lib/auth/portal-session";

/**
 * Append a row to portal_activity_events for the current portal session.
 *
 * Best-effort: a failure to persist the activity row MUST NEVER break the
 * user-facing request. We log and move on — this mirrors the HIPAA audit
 * helper contract.
 *
 * Wave 2 callers should pass a stable `eventType` string. Examples:
 *   - 'login', 'logout'
 *   - 'view_stage', 'view_document', 'view_appointments'
 *   - 'send_message', 'upload_document'
 *   - 'submit_nps'
 *
 * Impersonation note: when a staff user is previewing the portal via
 * ?impersonate=<contactId>, activity events are SUPPRESSED so staff browsing
 * doesn't pollute the claimant's real activity timeline. The returned promise
 * still resolves cleanly.
 */
export async function logPortalActivity(
  eventType: string,
  targetType?: string | null,
  targetId?: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const session = await tryGetPortalSession();
    if (!session) return;
    if (session.isImpersonating) return;

    const { ip, userAgent } = await getPortalRequestContext();
    const primaryCaseId = session.cases[0]?.id ?? null;

    await db.insert(portalActivityEvents).values({
      organizationId: session.portalUser.organizationId,
      portalUserId: session.portalUser.id,
      caseId: primaryCaseId,
      eventType,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      metadata: metadata ?? {},
      ip,
      userAgent,
    });
  } catch (error) {
    logger.error("portal activity log failed", { eventType, error });
  }
}

/**
 * Low-level insert for cases where we already know the portal_user_id (e.g.
 * the invite-accept flow writes the first 'activated' event before the
 * session cookie is even set). Same best-effort semantics.
 */
export async function insertPortalActivity(row: {
  organizationId: string;
  portalUserId: string;
  caseId?: string | null;
  eventType: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await db.insert(portalActivityEvents).values({
      organizationId: row.organizationId,
      portalUserId: row.portalUserId,
      caseId: row.caseId ?? null,
      eventType: row.eventType,
      targetType: row.targetType ?? null,
      targetId: row.targetId ?? null,
      metadata: row.metadata ?? {},
      ip: row.ip ?? null,
      userAgent: row.userAgent ?? null,
    });
  } catch (error) {
    logger.error("portal activity insert failed", {
      eventType: row.eventType,
      error,
    });
  }
}
