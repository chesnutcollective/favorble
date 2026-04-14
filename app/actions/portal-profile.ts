"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db/drizzle";
import { communications, contacts, portalUsers } from "@/db/schema";
import { ensurePortalSession } from "@/lib/auth/portal-session";
import { logPortalActivity } from "@/lib/services/portal-activity";

const ALLOWED_LOCALES = new Set(["en", "es"]);
const ALLOWED_CHANNELS = new Set(["email", "phone", "text"]);

const PORTAL_IMPERSONATE_COOKIE = "favorble_portal_impersonate";

async function readImpersonateCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;
}

/**
 * Update the current portal user's preferred locale.
 * Staff impersonating via ?impersonate=<contactId> cannot change this value —
 * the portal shows a read-only preview to staff.
 */
export async function setPortalLocale(
  locale: string,
): Promise<{ ok: boolean; error?: string }> {
  const normalized = locale.toLowerCase().slice(0, 2);
  if (!ALLOWED_LOCALES.has(normalized)) {
    return { ok: false, error: "Unsupported locale" };
  }

  const impersonateContactId = await readImpersonateCookie();
  const session = await ensurePortalSession({ impersonateContactId });
  if (session.isImpersonating) {
    return { ok: false, error: "Read-only preview" };
  }

  try {
    await Promise.all([
      db
        .update(contacts)
        .set({ preferredLocale: normalized })
        .where(eq(contacts.id, session.contact.id)),
      db
        .update(portalUsers)
        .set({ preferredLocale: normalized })
        .where(eq(portalUsers.id, session.portalUser.id)),
    ]);
  } catch {
    return { ok: false, error: "Failed to update" };
  }

  await logPortalActivity("set_locale", null, null, { locale: normalized });
  return { ok: true };
}

export type UpdatePortalProfileInput = {
  phone?: string | null;
  email?: string | null;
  preferredChannel?: "email" | "phone" | "text" | null;
};

/**
 * Let a claimant self-serve the fields Wave 2's welcome wizard exposes:
 * phone, email, and preferred communication channel.
 *
 *   - Name, DOB, SSN are not editable here — those require a staff attestation.
 *   - Staff previewing the portal (`isImpersonating`) cannot write.
 *   - `preferredChannel` lands on contacts.metadata.preferredChannel so we
 *     don't need a schema migration for this wave.
 */
export async function updateContactPortalProfile(
  input: UpdatePortalProfileInput,
): Promise<{ ok: boolean; error?: string }> {
  const impersonateContactId = await readImpersonateCookie();
  const session = await ensurePortalSession({ impersonateContactId });
  if (session.isImpersonating) {
    return { ok: false, error: "Read-only preview" };
  }

  const patch: Partial<{
    phone: string | null;
    email: string | null;
    metadata: Record<string, unknown>;
  }> = {};

  if (input.phone !== undefined) {
    const trimmed = input.phone?.trim() ?? "";
    patch.phone = trimmed.length > 0 ? trimmed : null;
  }
  if (input.email !== undefined) {
    const trimmed = input.email?.trim() ?? "";
    if (trimmed.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { ok: false, error: "Invalid email" };
    }
    patch.email = trimmed.length > 0 ? trimmed : null;
  }
  if (input.preferredChannel !== undefined && input.preferredChannel !== null) {
    if (!ALLOWED_CHANNELS.has(input.preferredChannel)) {
      return { ok: false, error: "Invalid channel" };
    }
    // Merge into the jsonb metadata blob so we don't need a new column.
    const currentMetadata =
      ((
        await db
          .select({ metadata: contacts.metadata })
          .from(contacts)
          .where(eq(contacts.id, session.contact.id))
          .limit(1)
      )[0]?.metadata as Record<string, unknown> | null) ?? {};
    patch.metadata = {
      ...currentMetadata,
      preferredChannel: input.preferredChannel,
    };
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true };
  }

  try {
    await db
      .update(contacts)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(contacts.id, session.contact.id));
  } catch {
    return { ok: false, error: "Failed to update" };
  }

  await logPortalActivity("update_profile", "contact", session.contact.id, {
    fields: Object.keys(patch),
  });
  return { ok: true };
}

/**
 * Store an outbound message drafted during the welcome wizard. The row lands
 * with `direction=outbound` and `deliveryStatus=pending_review` so the firm's
 * inbox can surface it for QA/triage before dispatch. Staff impersonating
 * cannot create messages on a claimant's behalf through this path.
 */
export async function submitWelcomeFirstMessage(
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, error: "Empty message" };
  if (trimmed.length > 4000) return { ok: false, error: "Message too long" };

  const impersonateContactId = await readImpersonateCookie();
  const session = await ensurePortalSession({ impersonateContactId });
  if (session.isImpersonating) {
    return { ok: false, error: "Read-only preview" };
  }

  const primaryCase = session.cases[0];
  if (!primaryCase) {
    return { ok: false, error: "No case linked" };
  }

  try {
    await db.insert(communications).values({
      organizationId: session.portalUser.organizationId,
      caseId: primaryCase.id,
      type: "message_inbound",
      direction: "inbound",
      subject: "Welcome: first message",
      body: trimmed,
      fromAddress: session.contact.email ?? session.portalUser.email ?? null,
      sourceSystem: "portal",
      sourceType: "portal_welcome",
      deliveryStatus: "pending_review",
      metadata: {
        portalUserId: session.portalUser.id,
        contactId: session.contact.id,
        origin: "welcome_wizard",
      },
    });
  } catch {
    return { ok: false, error: "Failed to save message" };
  }

  await logPortalActivity("send_message", "case", primaryCase.id, {
    origin: "welcome_wizard",
  });
  return { ok: true };
}
