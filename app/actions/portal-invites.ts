"use server";

import crypto from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db/drizzle";
import {
  caseContacts,
  clientInvitations,
  contacts,
  portalUsers,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { logPhiModification } from "@/lib/services/hipaa-audit";
import { logger } from "@/lib/logger/server";

const AUTH_ENABLED = process.env.ENABLE_CLERK_AUTH === "true";
const INVITE_TTL_DAYS = 7;

type AllowedInviteRole =
  | "admin"
  | "attorney"
  | "case_manager"
  | "intake_agent";

function canSendInvites(role: string): role is AllowedInviteRole {
  return (
    role === "admin" ||
    role === "attorney" ||
    role === "case_manager" ||
    role === "intake_agent"
  );
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export type SendPortalInviteResult = {
  ok: boolean;
  error?: string;
  inviteUrl?: string;
  portalUserId?: string;
  invitationId?: string;
  clerkInvitationId?: string | null;
};

/**
 * Resolve the primary case for a contact (first linked case).
 * Returns null if the contact isn't linked to any case — invites are
 * always case-scoped per the schema FK.
 */
async function resolvePrimaryCaseIdForContact(
  contactId: string,
): Promise<string | null> {
  try {
    const [row] = await db
      .select({ caseId: caseContacts.caseId })
      .from(caseContacts)
      .where(eq(caseContacts.contactId, contactId))
      .limit(1);
    return row?.caseId ?? null;
  } catch {
    return null;
  }
}

async function tryCreateClerkInvitation(
  email: string,
  portalUserId: string,
  organizationId: string,
  inviteUrl: string,
): Promise<string | null> {
  if (!AUTH_ENABLED) return null;
  try {
    const clerk = await clerkClient();
    const invitation = await clerk.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: inviteUrl,
      publicMetadata: {
        role: "client",
        portalUserId,
        organizationId,
      },
      notify: true,
      ignoreExisting: true,
    });
    return invitation.id ?? null;
  } catch (error) {
    logger.error("portal: clerk invite creation failed", {
      email,
      portalUserId,
      error,
    });
    return null;
  }
}

/**
 * Create (or reuse) a portal_users row for the given contact, then mint a
 * fresh client_invitations token. Returns an inviteUrl the staff user can
 * share if Clerk email delivery isn't available yet.
 *
 * Permission: admin, attorney, case_manager, intake_agent.
 */
export async function sendPortalInvite(
  contactId: string,
): Promise<SendPortalInviteResult> {
  if (!contactId) return { ok: false, error: "Missing contactId" };
  const actor = await requireSession();
  if (!canSendInvites(actor.role)) {
    return { ok: false, error: "Not allowed to send portal invites" };
  }

  // Load + authorize the contact (must belong to the same org).
  const [contact] = await db
    .select({
      id: contacts.id,
      organizationId: contacts.organizationId,
      email: contacts.email,
      phone: contacts.phone,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!contact) return { ok: false, error: "Contact not found" };
  if (contact.organizationId !== actor.organizationId) {
    return { ok: false, error: "Contact belongs to a different organization" };
  }
  if (!contact.email) {
    return { ok: false, error: "Contact has no email on file" };
  }

  const caseId = await resolvePrimaryCaseIdForContact(contact.id);
  if (!caseId) {
    return { ok: false, error: "Contact is not linked to any case yet" };
  }

  // Reuse or create the portal_users row. auth_user_id is a placeholder
  // sentinel until the claimant accepts the invite.
  const [existingPortalUser] = await db
    .select({ id: portalUsers.id, status: portalUsers.status })
    .from(portalUsers)
    .where(eq(portalUsers.contactId, contact.id))
    .limit(1);

  let portalUserId: string;
  if (existingPortalUser) {
    portalUserId = existingPortalUser.id;
    // Refresh invited_at so the UI can order pending invites.
    await db
      .update(portalUsers)
      .set({ invitedAt: new Date(), status: "invited" })
      .where(eq(portalUsers.id, portalUserId));
  } else {
    const placeholderAuthId = `pending_${crypto.randomBytes(12).toString("hex")}`;
    const [inserted] = await db
      .insert(portalUsers)
      .values({
        organizationId: contact.organizationId,
        contactId: contact.id,
        authUserId: placeholderAuthId,
        email: contact.email,
        phone: contact.phone,
        status: "invited",
        invitedAt: new Date(),
      })
      .returning({ id: portalUsers.id });
    portalUserId = inserted.id;
  }

  const rawToken = randomToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  const inviteUrl = `${appBaseUrl()}/portal/invite/${rawToken}`;

  const clerkInvitationId = await tryCreateClerkInvitation(
    contact.email,
    portalUserId,
    contact.organizationId,
    inviteUrl,
  );

  const [invitation] = await db
    .insert(clientInvitations)
    .values({
      organizationId: contact.organizationId,
      caseId,
      contactId: contact.id,
      channel: "email",
      tokenHash,
      expiresAt,
      sentAt: clerkInvitationId ? new Date() : null,
      sentBy: actor.id,
      clerkInvitationId,
    })
    .returning({ id: clientInvitations.id });

  await logPhiModification({
    organizationId: contact.organizationId,
    userId: actor.id,
    entityType: "client_invitation",
    entityId: invitation.id,
    caseId,
    operation: "create",
    metadata: {
      contactId: contact.id,
      portalUserId,
      clerkInvitationId,
      deliveredViaClerk: Boolean(clerkInvitationId),
    },
  });

  if (!clerkInvitationId) {
    logger.warn("portal: clerk invitation skipped — falling back to URL", {
      portalUserId,
      contactId: contact.id,
      authEnabled: AUTH_ENABLED,
    });
  }

  return {
    ok: true,
    inviteUrl,
    portalUserId,
    invitationId: invitation.id,
    clerkInvitationId,
  };
}

/**
 * Revoke any pending invites for a contact and issue a fresh one.
 */
export async function resendPortalInvite(
  contactId: string,
): Promise<SendPortalInviteResult> {
  if (!contactId) return { ok: false, error: "Missing contactId" };
  const actor = await requireSession();
  if (!canSendInvites(actor.role)) {
    return { ok: false, error: "Not allowed to send portal invites" };
  }

  // Revoke pending invitations for this contact before minting a new one.
  try {
    await db
      .update(clientInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(clientInvitations.contactId, contactId),
          isNull(clientInvitations.acceptedAt),
          isNull(clientInvitations.revokedAt),
        ),
      );
  } catch (error) {
    logger.error("portal: failed to revoke pending invites", {
      contactId,
      error,
    });
  }

  return sendPortalInvite(contactId);
}

/**
 * Look up an invite by its raw token. Returns `null` when the token is
 * unknown or the invite has been accepted/revoked/expired.
 *
 * Used by the /portal/invite/[token] accept page.
 */
export async function findActiveInvitationByToken(
  rawToken: string,
): Promise<{
  id: string;
  organizationId: string;
  contactId: string;
  caseId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  expiresAt: Date;
} | null> {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  try {
    const [row] = await db
      .select({
        id: clientInvitations.id,
        organizationId: clientInvitations.organizationId,
        contactId: clientInvitations.contactId,
        caseId: clientInvitations.caseId,
        expiresAt: clientInvitations.expiresAt,
        acceptedAt: clientInvitations.acceptedAt,
        revokedAt: clientInvitations.revokedAt,
        email: contacts.email,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(clientInvitations)
      .innerJoin(contacts, eq(contacts.id, clientInvitations.contactId))
      .where(eq(clientInvitations.tokenHash, tokenHash))
      .orderBy(desc(clientInvitations.createdAt))
      .limit(1);
    if (!row) return null;
    if (row.acceptedAt || row.revokedAt) return null;
    if (row.expiresAt.getTime() < Date.now()) return null;
    return {
      id: row.id,
      organizationId: row.organizationId,
      contactId: row.contactId,
      caseId: row.caseId,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      expiresAt: row.expiresAt,
    };
  } catch (error) {
    logger.error("portal: invitation lookup failed", { error });
    return null;
  }
}

/**
 * Phase 6 — pause a claimant's portal access. Sets portal_users.status to
 * 'suspended' and stamps suspended_at / suspended_by / suspended_reason. The
 * next time the claimant visits /portal they land on the "paused" page
 * (/app/(client)/layout.tsx consults status and bounces suspended users).
 *
 * Permission: admin, attorney, case_manager, intake_agent.
 * Idempotent — calling on an already-suspended user is a no-op return.
 */
export async function revokePortalAccess(
  contactId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string; portalUserId?: string }> {
  if (!contactId) return { ok: false, error: "Missing contactId" };
  const actor = await requireSession();
  if (!canSendInvites(actor.role)) {
    return { ok: false, error: "Not allowed to change portal access" };
  }

  const [portalUser] = await db
    .select({
      id: portalUsers.id,
      organizationId: portalUsers.organizationId,
      contactId: portalUsers.contactId,
      status: portalUsers.status,
    })
    .from(portalUsers)
    .where(eq(portalUsers.contactId, contactId))
    .limit(1);

  if (!portalUser) {
    return { ok: false, error: "Contact has no portal account" };
  }
  if (portalUser.organizationId !== actor.organizationId) {
    return {
      ok: false,
      error: "Contact belongs to a different organization",
    };
  }

  if (portalUser.status === "suspended") {
    return { ok: true, portalUserId: portalUser.id };
  }

  try {
    await db
      .update(portalUsers)
      .set({
        status: "suspended",
        suspendedAt: new Date(),
        suspendedReason: reason ?? null,
        suspendedBy: actor.id,
      })
      .where(eq(portalUsers.id, portalUser.id));
  } catch (error) {
    logger.error("portal: revoke access failed", {
      portalUserId: portalUser.id,
      error,
    });
    return { ok: false, error: "Failed to pause portal access" };
  }

  await logPhiModification({
    organizationId: portalUser.organizationId,
    userId: actor.id,
    entityType: "portal_user",
    entityId: portalUser.id,
    caseId: null,
    operation: "update",
    action: "portal_access_revoked",
    metadata: {
      contactId: portalUser.contactId,
      reason: reason ?? null,
    },
  });

  return { ok: true, portalUserId: portalUser.id };
}

/**
 * Phase 6 — re-enable a paused portal account. Flips status back to 'active'
 * (if the claimant had activated) or 'invited' (if they never did) and
 * clears the suspension audit columns.
 */
export async function restorePortalAccess(
  contactId: string,
): Promise<{ ok: boolean; error?: string; portalUserId?: string }> {
  if (!contactId) return { ok: false, error: "Missing contactId" };
  const actor = await requireSession();
  if (!canSendInvites(actor.role)) {
    return { ok: false, error: "Not allowed to change portal access" };
  }

  const [portalUser] = await db
    .select({
      id: portalUsers.id,
      organizationId: portalUsers.organizationId,
      activatedAt: portalUsers.activatedAt,
    })
    .from(portalUsers)
    .where(eq(portalUsers.contactId, contactId))
    .limit(1);

  if (!portalUser) {
    return { ok: false, error: "Contact has no portal account" };
  }
  if (portalUser.organizationId !== actor.organizationId) {
    return {
      ok: false,
      error: "Contact belongs to a different organization",
    };
  }

  const nextStatus = portalUser.activatedAt ? "active" : "invited";

  try {
    await db
      .update(portalUsers)
      .set({
        status: nextStatus,
        suspendedAt: null,
        suspendedReason: null,
        suspendedBy: null,
      })
      .where(eq(portalUsers.id, portalUser.id));
  } catch (error) {
    logger.error("portal: restore access failed", {
      portalUserId: portalUser.id,
      error,
    });
    return { ok: false, error: "Failed to restore portal access" };
  }

  await logPhiModification({
    organizationId: portalUser.organizationId,
    userId: actor.id,
    entityType: "portal_user",
    entityId: portalUser.id,
    caseId: null,
    operation: "update",
    action: "portal_access_restored",
    metadata: { contactId, nextStatus },
  });

  return { ok: true, portalUserId: portalUser.id };
}

/**
 * Called from the accept flow once Clerk confirms the new user. Marks the
 * portal_users row active and stamps the invitation as accepted.
 *
 * This is intentionally idempotent — re-running after a successful accept
 * is safe.
 */
export async function acceptPortalInvitation(params: {
  token: string;
  clerkUserId: string;
  email: string;
}): Promise<{ ok: boolean; error?: string; portalUserId?: string }> {
  const invite = await findActiveInvitationByToken(params.token);
  if (!invite) return { ok: false, error: "Invitation is invalid or expired" };

  // Look up the portal_users row by contact; the staff invite flow created
  // it with a placeholder auth id which we now replace with the real one.
  const [portalUser] = await db
    .select({ id: portalUsers.id, organizationId: portalUsers.organizationId })
    .from(portalUsers)
    .where(eq(portalUsers.contactId, invite.contactId))
    .limit(1);

  if (!portalUser) {
    return { ok: false, error: "Portal user record missing" };
  }
  if (portalUser.organizationId !== invite.organizationId) {
    return { ok: false, error: "Organization mismatch" };
  }

  try {
    await db
      .update(portalUsers)
      .set({
        authUserId: params.clerkUserId,
        email: params.email,
        status: "active",
        activatedAt: new Date(),
      })
      .where(eq(portalUsers.id, portalUser.id));
    await db
      .update(clientInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(clientInvitations.id, invite.id));
  } catch (error) {
    logger.error("portal: accept invitation failed", { error });
    return { ok: false, error: "Failed to activate portal account" };
  }

  await logPhiModification({
    organizationId: invite.organizationId,
    userId: null,
    entityType: "client_invitation",
    entityId: invite.id,
    caseId: invite.caseId,
    operation: "update",
    action: "portal_invitation_accepted",
    metadata: {
      portalUserId: portalUser.id,
      clerkUserId: params.clerkUserId,
    },
  });

  return { ok: true, portalUserId: portalUser.id };
}
