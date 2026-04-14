"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import {
  PERSONA_CONFIG,
  VIEW_AS_PERSONAS,
  type PersonaConfig,
  type PersonaId,
} from "@/lib/personas/config";
import { VIEW_AS_COOKIE_NAME } from "@/lib/personas/effective-persona";
import { NAV_ITEM_REGISTRY } from "@/lib/personas/nav-items";

const EIGHT_HOURS_SECONDS = 60 * 60 * 8;

function isValidViewAsTarget(value: string): value is PersonaId {
  return (VIEW_AS_PERSONAS as string[]).includes(value);
}

/**
 * Decide where the persona-switching admin should land.
 *
 * Behaviour: if the admin's current path is already accessible under the
 * target persona's nav (or is a universal page like /admin/* / /dashboard),
 * stay put — only the nav rail filters out unavailable items, the page
 * itself still renders. Otherwise fall back to the persona's defaultRoute
 * so the admin always lands somewhere sensible.
 */
function chooseLandingPath(
  config: PersonaConfig,
  currentPath: string | null,
): string {
  if (!currentPath) return config.defaultRoute;

  // Always allow the dashboard and any admin-prefixed page (admins keep
  // settings access while previewing other personas).
  if (currentPath === "/dashboard" || currentPath.startsWith("/dashboard/")) {
    return currentPath;
  }
  if (currentPath.startsWith("/admin/")) return currentPath;

  // Allow if the path falls under any of the persona's nav-item hrefs.
  const allowed = config.nav.some((id) => {
    const item = NAV_ITEM_REGISTRY[id];
    if (!item) return false;
    return currentPath === item.href || currentPath.startsWith(item.href + "/");
  });
  return allowed ? currentPath : config.defaultRoute;
}

/**
 * Set the `favorble_view_as_persona` cookie for the current admin session.
 * Stays on the current page when the new persona has access, otherwise
 * redirects to the target persona's default route.
 */
export async function setViewAsPersona(
  personaId: string,
  currentPath?: string,
): Promise<void> {
  const actor = await getSession();
  if (!actor || actor.role !== "admin") {
    throw new Error("Only admins may use the View As toggle");
  }
  if (!isValidViewAsTarget(personaId)) {
    throw new Error(`Invalid persona: ${personaId}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(VIEW_AS_COOKIE_NAME, personaId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: EIGHT_HOURS_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });

  redirect(chooseLandingPath(PERSONA_CONFIG[personaId], currentPath ?? null));
}

/**
 * Clear the view-as cookie. Stays on the current page when admin has
 * access there (admin sees everything), otherwise falls back to the
 * admin default route.
 */
export async function exitViewAs(currentPath?: string): Promise<void> {
  const actor = await getSession();
  if (!actor || actor.role !== "admin") {
    throw new Error("Only admins may use the View As toggle");
  }

  const cookieStore = await cookies();
  cookieStore.delete(VIEW_AS_COOKIE_NAME);

  redirect(chooseLandingPath(PERSONA_CONFIG.admin, currentPath ?? null));
}
