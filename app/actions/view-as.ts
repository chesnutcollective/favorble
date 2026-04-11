"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import {
  PERSONA_CONFIG,
  VIEW_AS_PERSONAS,
  type PersonaId,
} from "@/lib/personas/config";
import { VIEW_AS_COOKIE_NAME } from "@/lib/personas/effective-persona";

const EIGHT_HOURS_SECONDS = 60 * 60 * 8;

function isValidViewAsTarget(value: string): value is PersonaId {
  return (VIEW_AS_PERSONAS as string[]).includes(value);
}

/**
 * Set the `favorble_view_as_persona` cookie for the current admin session.
 * No-op (throws) for non-admin actors. Redirects to the target persona's
 * default route so the admin immediately lands where the persona would.
 */
export async function setViewAsPersona(personaId: string): Promise<void> {
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

  redirect(PERSONA_CONFIG[personaId].defaultRoute);
}

/**
 * Clear the view-as cookie and return the admin to their own workspace.
 */
export async function exitViewAs(): Promise<void> {
  const actor = await getSession();
  if (!actor || actor.role !== "admin") {
    throw new Error("Only admins may use the View As toggle");
  }

  const cookieStore = await cookies();
  cookieStore.delete(VIEW_AS_COOKIE_NAME);

  redirect(PERSONA_CONFIG.admin.defaultRoute);
}
