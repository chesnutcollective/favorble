"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { communications } from "@/db/schema";
import { ensurePortalSession } from "@/lib/auth/portal-session";
import { logPortalActivity } from "@/lib/services/portal-activity";
import { logger } from "@/lib/logger/server";
import { PORTAL_IMPERSONATE_COOKIE } from "@/app/(client)/layout";

const MAX_MESSAGE_LENGTH = 4000;

async function getSession() {
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
  return ensurePortalSession({ impersonateContactId });
}

/**
 * Send a message from the claimant to the firm via the portal.
 *
 *   - Writes a `communications` row with direction = 'inbound',
 *     type = 'message_inbound', visibleToClient = true so the firm
 *     side can also render it from the portal thread.
 *   - Ties the row to the claimant's primary case (first case in the
 *     session). If the contact has multiple cases, the caller can pass
 *     an explicit caseId.
 *   - Refuses to write when the session is impersonating (staff preview).
 */
export async function sendPortalMessage(input: {
  body: string;
  caseId?: string | null;
}): Promise<
  | { ok: true; id: string }
  | { ok: false; error: string }
> {
  const session = await getSession();

  if (session.isImpersonating) {
    return {
      ok: false,
      error: "Cannot send messages while previewing the portal.",
    };
  }

  const trimmed = input.body.trim();
  if (!trimmed) {
    return { ok: false, error: "Message body is required." };
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`,
    };
  }

  // Resolve which case this message is about. Prefer the explicit hint,
  // fall back to the first active case on the session.
  const sessionCaseIds = session.cases.map((c) => c.id);
  let targetCaseId: string | null = null;
  if (input.caseId && sessionCaseIds.includes(input.caseId)) {
    targetCaseId = input.caseId;
  } else {
    targetCaseId = sessionCaseIds[0] ?? null;
  }

  if (!targetCaseId) {
    return {
      ok: false,
      error: "No active case is linked to your account.",
    };
  }

  try {
    const [row] = await db
      .insert(communications)
      .values({
        organizationId: session.portalUser.organizationId,
        caseId: targetCaseId,
        type: "message_inbound",
        direction: "inbound",
        body: trimmed,
        fromAddress:
          `${session.contact.firstName} ${session.contact.lastName}`.trim() ||
          session.contact.email ||
          "Client",
        sourceSystem: "portal",
        sourceType: "portal",
        visibleToClient: true,
        sentByPortalUserId: session.portalUser.id,
        isAutomated: false,
      })
      .returning({ id: communications.id });

    await logPortalActivity("send_message", "communication", row.id, {
      caseId: targetCaseId,
    });

    revalidatePath("/portal/messages");
    // Staff-side inbox should also surface it.
    revalidatePath(`/cases/${targetCaseId}/messages`);
    revalidatePath("/messages");

    return { ok: true, id: row.id };
  } catch (error) {
    logger.error("portal: failed to send message", {
      portalUserId: session.portalUser.id,
      error,
    });
    return {
      ok: false,
      error: "We couldn't send your message. Please try again.",
    };
  }
}

/**
 * Mark every unread inbound-from-firm message the claimant can see as read
 * (readAt = now). Called when the portal messages page mounts.
 */
export async function markPortalMessagesRead(): Promise<{
  ok: true;
  updated: number;
} | { ok: false; error: string }> {
  const session = await getSession();

  if (session.isImpersonating) {
    // Don't pollute real read state when staff is previewing.
    return { ok: true, updated: 0 };
  }

  const sessionCaseIds = session.cases.map((c) => c.id);
  if (sessionCaseIds.length === 0) {
    return { ok: true, updated: 0 };
  }

  try {
    const result = await db
      .update(communications)
      .set({ readAt: new Date() })
      .where(
        and(
          inArray(communications.caseId, sessionCaseIds),
          eq(communications.direction, "outbound"),
          eq(communications.visibleToClient, true),
          isNull(communications.readAt),
        ),
      )
      .returning({ id: communications.id });

    return { ok: true, updated: result.length };
  } catch (error) {
    logger.error("portal: failed to mark messages read", {
      portalUserId: session.portalUser.id,
      error,
    });
    return { ok: false, error: "Could not update read state." };
  }
}

export type PortalMessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  fromAddress: string | null;
  createdAt: string;
  readAt: string | null;
  sentByPortalUserId: string | null;
  caseId: string | null;
};

/**
 * Load the claimant-visible message history for the active session. Filters to
 *   - outbound from firm with visibleToClient = true, OR
 *   - inbound from this portal user (via sentByPortalUserId).
 */
export async function loadPortalMessages(input?: {
  caseId?: string | null;
}): Promise<PortalMessageRow[]> {
  const session = await getSession();

  const sessionCaseIds = session.cases.map((c) => c.id);
  if (sessionCaseIds.length === 0) return [];

  const scopedCaseIds =
    input?.caseId && sessionCaseIds.includes(input.caseId)
      ? [input.caseId]
      : sessionCaseIds;

  try {
    const rows = await db
      .select({
        id: communications.id,
        direction: communications.direction,
        body: communications.body,
        fromAddress: communications.fromAddress,
        createdAt: communications.createdAt,
        readAt: communications.readAt,
        sentByPortalUserId: communications.sentByPortalUserId,
        caseId: communications.caseId,
        visibleToClient: communications.visibleToClient,
      })
      .from(communications)
      .where(
        and(
          inArray(communications.caseId, scopedCaseIds),
          or(
            and(
              eq(communications.direction, "outbound"),
              eq(communications.visibleToClient, true),
            ),
            and(
              eq(communications.direction, "inbound"),
              eq(communications.sentByPortalUserId, session.portalUser.id),
            ),
          ),
        ),
      )
      .orderBy(communications.createdAt);

    return rows.map((r) => ({
      id: r.id,
      direction: (r.direction === "inbound" ? "inbound" : "outbound") as
        | "inbound"
        | "outbound",
      body: r.body ?? "",
      fromAddress: r.fromAddress,
      createdAt: r.createdAt.toISOString(),
      readAt: r.readAt ? r.readAt.toISOString() : null,
      sentByPortalUserId: r.sentByPortalUserId,
      caseId: r.caseId,
    }));
  } catch (error) {
    logger.error("portal: failed to load messages", {
      portalUserId: session.portalUser.id,
      error,
    });
    return [];
  }
}
