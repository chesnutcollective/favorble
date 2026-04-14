"use server";

import { clerkClient } from "@clerk/nextjs/server";
import {
  acceptPortalInvitation,
  findActiveInvitationByToken,
} from "@/app/actions/portal-invites";
import { insertPortalActivity } from "@/lib/services/portal-activity";
import { logger } from "@/lib/logger/server";

const AUTH_ENABLED = process.env.ENABLE_CLERK_AUTH === "true";

/**
 * Server action invoked by the accept-invite card.
 *
 * When Clerk is live (ENABLE_CLERK_AUTH=true) this:
 *   1. Looks up the invitation by raw token
 *   2. Creates (or reuses) a Clerk user with publicMetadata.role = 'client'
 *   3. Marks the invitation accepted + portal_users.status = 'active'
 *   4. Emits an activated portal_activity event
 *
 * When Clerk is NOT enabled (staging / local demo) we still flip the
 * invitation to accepted and write a sentinel auth id so Wave 2 can test
 * the accepted-state flow without a real Clerk session.
 */
export async function acceptInvitationAction(params: {
  token: string;
  email: string;
}): Promise<{ ok: boolean; error?: string }> {
  const invite = await findActiveInvitationByToken(params.token);
  if (!invite) return { ok: false, error: "This link is invalid or expired." };

  const normalizedEmail = params.email.trim().toLowerCase();
  if (!normalizedEmail.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  let clerkUserId: string | null = null;
  if (AUTH_ENABLED) {
    try {
      const clerk = await clerkClient();
      const existing = await clerk.users.getUserList({
        emailAddress: [normalizedEmail],
        limit: 1,
      });
      const alreadyExists = existing.data[0];
      if (alreadyExists) {
        clerkUserId = alreadyExists.id;
        // Make sure the role metadata is set on the existing user.
        await clerk.users.updateUserMetadata(alreadyExists.id, {
          publicMetadata: {
            role: "client",
            portalUserId: invite.id,
          },
        });
      } else {
        const created = await clerk.users.createUser({
          emailAddress: [normalizedEmail],
          publicMetadata: {
            role: "client",
            portalUserId: invite.id,
          },
          skipPasswordRequirement: true,
        });
        clerkUserId = created.id;
      }
    } catch (error) {
      logger.error("portal: failed to create clerk user on accept", {
        error,
        email: normalizedEmail,
      });
      return {
        ok: false,
        error: "We couldn't create your account. Please contact your attorney.",
      };
    }
  } else {
    clerkUserId = `demo_client_${invite.contactId}`;
  }

  const result = await acceptPortalInvitation({
    token: params.token,
    clerkUserId,
    email: normalizedEmail,
  });

  if (!result.ok || !result.portalUserId) {
    return { ok: false, error: result.error ?? "Failed to activate account" };
  }

  await insertPortalActivity({
    organizationId: invite.organizationId,
    portalUserId: result.portalUserId,
    caseId: invite.caseId,
    eventType: "portal_activated",
    metadata: { fromInvitationId: invite.id },
  });

  return { ok: true };
}
