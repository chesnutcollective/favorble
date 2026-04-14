import "server-only";

import crypto from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contacts, portalMagicLinks, portalUsers } from "@/db/schema";
import { logPhiModification } from "@/lib/services/hipaa-audit";
import { logger } from "@/lib/logger/server";

/**
 * Short-lived (15 min) single-use magic links used by the portal SMS
 * notification channel. Each link carries the raw 32-byte hex token in the
 * URL; the DB only ever sees the SHA-256 hash.
 *
 * Flow:
 *   1. `buildMagicLink({ contactId, path, campaign })`
 *       → mints a token, persists the hash, returns the full URL
 *       → HIPAA-audited (we log the creation with campaign + path).
 *   2. Claimant taps `/portal/link/<token>`.
 *   3. The route handler calls `consumeMagicLink(token)` which validates
 *      the hash, marks the row consumed, and returns the path + portalUserId.
 *
 * Tokens are single-use and expire 15 minutes after creation. Reusing a
 * consumed token is a hard failure (the handler treats it as a stale link).
 */

const DEFAULT_TTL_MS = 15 * 60 * 1000;

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export type BuildMagicLinkInput = {
  contactId: string;
  /** Relative portal path, e.g. '/portal/messages' or '/portal/appointments?id=…'. */
  path: string;
  /** Analytics tag, e.g. 'new_message', 'stage_change', 'appointment_reminder'. */
  campaign?: string;
  /** Override TTL (defaults to 15 minutes). */
  ttlMs?: number;
};

export type BuildMagicLinkResult = {
  ok: boolean;
  url?: string;
  error?: string;
  id?: string;
};

/**
 * Mint a magic-link URL for a given contact. Writes an audit entry so we
 * can reconstruct "why did we send a login link at 4:02 PM to claimant X?".
 *
 * Best-effort on errors — returns `{ ok: false }` so callers can still send
 * the SMS body without a link if the DB round-trip fails.
 */
export async function buildMagicLink(
  input: BuildMagicLinkInput,
): Promise<BuildMagicLinkResult> {
  if (!input.contactId) return { ok: false, error: "Missing contactId" };
  if (!input.path || !input.path.startsWith("/")) {
    return { ok: false, error: "Invalid path" };
  }

  try {
    const [contact] = await db
      .select({
        id: contacts.id,
        organizationId: contacts.organizationId,
      })
      .from(contacts)
      .where(eq(contacts.id, input.contactId))
      .limit(1);
    if (!contact) return { ok: false, error: "Contact not found" };

    const raw = randomToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS));

    const [row] = await db
      .insert(portalMagicLinks)
      .values({
        organizationId: contact.organizationId,
        contactId: contact.id,
        path: input.path,
        tokenHash,
        campaign: input.campaign ?? null,
        expiresAt,
      })
      .returning({ id: portalMagicLinks.id });

    await logPhiModification({
      organizationId: contact.organizationId,
      userId: null,
      entityType: "portal_magic_link",
      entityId: row.id,
      operation: "create",
      action: "portal_magic_link_issued",
      metadata: {
        contactId: contact.id,
        campaign: input.campaign ?? null,
        path: input.path,
        ttlMs: input.ttlMs ?? DEFAULT_TTL_MS,
      },
    });

    return {
      ok: true,
      id: row.id,
      url: `${appBaseUrl()}/portal/link/${raw}`,
    };
  } catch (error) {
    logger.error("portal: magic link creation failed", {
      contactId: input.contactId,
      error,
    });
    return { ok: false, error: "Failed to create magic link" };
  }
}

export type ConsumeMagicLinkResult =
  | {
      ok: true;
      path: string;
      contactId: string;
      organizationId: string;
      portalUserId: string | null;
      authUserId: string | null;
    }
  | { ok: false; reason: "invalid" | "expired" | "consumed" | "error" };

/**
 * Validate + consume a raw magic-link token. Returns enough information for
 * the route handler to establish a Clerk session and redirect.
 *
 * Idempotency: once consumed, a token cannot be reused. The route handler
 * must issue a clean 404 (or redirect to /login) so leaked tokens fail safe.
 */
export async function consumeMagicLink(
  rawToken: string,
): Promise<ConsumeMagicLinkResult> {
  if (!rawToken || rawToken.length < 32) return { ok: false, reason: "invalid" };
  const tokenHash = hashToken(rawToken);

  try {
    const now = new Date();
    const [row] = await db
      .select({
        id: portalMagicLinks.id,
        organizationId: portalMagicLinks.organizationId,
        contactId: portalMagicLinks.contactId,
        path: portalMagicLinks.path,
        expiresAt: portalMagicLinks.expiresAt,
        consumedAt: portalMagicLinks.consumedAt,
      })
      .from(portalMagicLinks)
      .where(eq(portalMagicLinks.tokenHash, tokenHash))
      .limit(1);
    if (!row) return { ok: false, reason: "invalid" };
    if (row.consumedAt) return { ok: false, reason: "consumed" };
    if (row.expiresAt.getTime() < now.getTime()) {
      return { ok: false, reason: "expired" };
    }

    // Atomic consume: only mark consumed if still unconsumed. Prevents
    // double-spend if two requests race (e.g. iMessage preview scraping).
    const [claimed] = await db
      .update(portalMagicLinks)
      .set({ consumedAt: now })
      .where(
        and(
          eq(portalMagicLinks.id, row.id),
          isNull(portalMagicLinks.consumedAt),
          gt(portalMagicLinks.expiresAt, now),
        ),
      )
      .returning({ id: portalMagicLinks.id });
    if (!claimed) return { ok: false, reason: "consumed" };

    // Look up the portal_users row (may be null if invite hasn't been
    // accepted yet — caller decides what to do).
    const [portalUser] = await db
      .select({
        id: portalUsers.id,
        authUserId: portalUsers.authUserId,
      })
      .from(portalUsers)
      .where(eq(portalUsers.contactId, row.contactId))
      .limit(1);

    await logPhiModification({
      organizationId: row.organizationId,
      userId: null,
      entityType: "portal_magic_link",
      entityId: row.id,
      operation: "update",
      action: "portal_magic_link_consumed",
      metadata: {
        contactId: row.contactId,
        portalUserId: portalUser?.id ?? null,
        path: row.path,
      },
    });

    return {
      ok: true,
      path: row.path,
      contactId: row.contactId,
      organizationId: row.organizationId,
      portalUserId: portalUser?.id ?? null,
      authUserId: portalUser?.authUserId ?? null,
    };
  } catch (error) {
    logger.error("portal: magic link consume failed", { error });
    return { ok: false, reason: "error" };
  }
}
