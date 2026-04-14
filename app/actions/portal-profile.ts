"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contacts, portalUsers } from "@/db/schema";
import { ensurePortalSession } from "@/lib/auth/portal-session";
import { logPortalActivity } from "@/lib/services/portal-activity";

const ALLOWED_LOCALES = new Set(["en", "es"]);

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

  const session = await ensurePortalSession();
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
