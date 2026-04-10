import "server-only";
import { cookies } from "next/headers";
import { getSession, type SessionUser } from "@/lib/auth/session";
import {
  PERSONA_CONFIG,
  type PersonaConfig,
  type PersonaId,
  getPersonaConfig,
} from "./config";

const VIEW_AS_COOKIE = "favorble_view_as_persona";

export type EffectivePersona = {
  /** The actual signed-in user (never changed by view-as) */
  actor: SessionUser;
  /** The persona currently driving the UX — either actor's role or the view-as override */
  personaId: PersonaId;
  /** Config for the effective persona */
  config: PersonaConfig;
  /** True when super admin is actively viewing as another persona */
  isViewingAs: boolean;
  /** The actor's real persona (same as personaId unless isViewingAs) */
  actorPersonaId: PersonaId;
};

/**
 * Resolve the effective persona for the current request.
 *
 * Read order:
 * 1. Session user (real signed-in user — always the actor)
 * 2. `favorble_view_as_persona` cookie (only honored when actor.role === "admin")
 *
 * When an admin has the view-as cookie set to a valid persona, the UI (nav,
 * landing page, dashboard widgets) renders as if the user were that persona.
 * Audit logs and server actions still use the actor's real identity.
 */
export async function getEffectivePersona(): Promise<EffectivePersona | null> {
  const actor = await getSession();
  if (!actor) return null;

  const actorPersonaId = normalizePersonaId(actor.role);

  // Only admins can view as other personas
  if (actorPersonaId === "admin") {
    const cookieStore = await cookies();
    const viewAsCookie = cookieStore.get(VIEW_AS_COOKIE);
    const viewAsValue = viewAsCookie?.value;

    if (viewAsValue && isValidPersonaId(viewAsValue)) {
      return {
        actor,
        personaId: viewAsValue,
        config: PERSONA_CONFIG[viewAsValue],
        isViewingAs: viewAsValue !== actorPersonaId,
        actorPersonaId,
      };
    }
  }

  return {
    actor,
    personaId: actorPersonaId,
    config: getPersonaConfig(actorPersonaId),
    isViewingAs: false,
    actorPersonaId,
  };
}

/**
 * Require an effective persona — throws if no session (for use in server
 * components that are already behind auth middleware).
 */
export async function requireEffectivePersona(): Promise<EffectivePersona> {
  const persona = await getEffectivePersona();
  if (!persona) {
    throw new Error("No session — requireEffectivePersona called without auth");
  }
  return persona;
}

function normalizePersonaId(role: string): PersonaId {
  if (isValidPersonaId(role)) return role;
  return "viewer";
}

function isValidPersonaId(value: string): value is PersonaId {
  return value in PERSONA_CONFIG;
}

export const VIEW_AS_COOKIE_NAME = VIEW_AS_COOKIE;
