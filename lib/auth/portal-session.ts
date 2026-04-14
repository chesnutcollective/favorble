import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/drizzle";
import {
  caseContacts,
  cases,
  contacts,
  portalUsers,
  users as staffUsers,
} from "@/db/schema";
import { logger } from "@/lib/logger/server";

const AUTH_ENABLED = process.env.ENABLE_CLERK_AUTH === "true";

export type PortalSessionContact = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredLocale: string;
};

export type PortalSessionCase = {
  id: string;
  caseNumber: string;
  currentStageId: string | null;
  status: string;
};

export type PortalSessionUser = {
  id: string;
  organizationId: string;
  contactId: string;
  authUserId: string;
  email: string;
  status: string;
  preferredLocale: string;
  loginCount: number;
  lastLoginAt: Date | null;
};

export type PortalSession = {
  portalUser: PortalSessionUser;
  contact: PortalSessionContact;
  cases: PortalSessionCase[];
  isImpersonating: boolean;
  /** When impersonating, this is the staff user's Clerk id. Null otherwise. */
  impersonatorClerkId: string | null;
};

const ONE_HOUR_MS = 60 * 60 * 1000;

type LoadResult =
  | { kind: "ok"; session: PortalSession }
  | { kind: "redirect"; to: string }
  | { kind: "forbidden" };

async function loadPortalUserByContactId(
  contactId: string,
): Promise<PortalSessionUser | null> {
  const [row] = await db
    .select({
      id: portalUsers.id,
      organizationId: portalUsers.organizationId,
      contactId: portalUsers.contactId,
      authUserId: portalUsers.authUserId,
      email: portalUsers.email,
      status: portalUsers.status,
      preferredLocale: portalUsers.preferredLocale,
      loginCount: portalUsers.loginCount,
      lastLoginAt: portalUsers.lastLoginAt,
    })
    .from(portalUsers)
    .where(eq(portalUsers.contactId, contactId))
    .limit(1);
  return row ?? null;
}

async function loadPortalUserByAuthId(
  authUserId: string,
): Promise<PortalSessionUser | null> {
  const [row] = await db
    .select({
      id: portalUsers.id,
      organizationId: portalUsers.organizationId,
      contactId: portalUsers.contactId,
      authUserId: portalUsers.authUserId,
      email: portalUsers.email,
      status: portalUsers.status,
      preferredLocale: portalUsers.preferredLocale,
      loginCount: portalUsers.loginCount,
      lastLoginAt: portalUsers.lastLoginAt,
    })
    .from(portalUsers)
    .where(eq(portalUsers.authUserId, authUserId))
    .limit(1);
  return row ?? null;
}

async function loadContact(contactId: string): Promise<PortalSessionContact | null> {
  const [row] = await db
    .select({
      id: contacts.id,
      organizationId: contacts.organizationId,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      preferredLocale: contacts.preferredLocale,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  return row ?? null;
}

async function loadCasesForContact(contactId: string): Promise<PortalSessionCase[]> {
  try {
    const rows = await db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        currentStageId: cases.currentStageId,
        status: cases.status,
      })
      .from(cases)
      .innerJoin(caseContacts, eq(caseContacts.caseId, cases.id))
      .where(
        and(eq(caseContacts.contactId, contactId), isNull(cases.deletedAt)),
      );
    return rows.map((r) => ({
      id: r.id,
      caseNumber: r.caseNumber,
      currentStageId: r.currentStageId,
      status: r.status,
    }));
  } catch (error) {
    logger.error("portal: failed to load cases for contact", {
      contactId,
      error,
    });
    return [];
  }
}

async function staffUserCanImpersonate(clerkUserId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: staffUsers.id, role: staffUsers.role })
      .from(staffUsers)
      .where(eq(staffUsers.authUserId, clerkUserId))
      .limit(1);
    if (!row) return false;
    return (
      row.role === "admin" ||
      row.role === "attorney" ||
      row.role === "case_manager" ||
      row.role === "intake_agent"
    );
  } catch {
    return false;
  }
}

async function getRequestIp(): Promise<string | null> {
  try {
    const h = await headers();
    return (
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null
    );
  } catch {
    return null;
  }
}

async function getRequestUserAgent(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("user-agent");
  } catch {
    return null;
  }
}

async function debouncedTouchLogin(user: PortalSessionUser): Promise<void> {
  const now = Date.now();
  const last = user.lastLoginAt ? user.lastLoginAt.getTime() : 0;
  if (now - last < ONE_HOUR_MS) {
    return;
  }

  try {
    await db
      .update(portalUsers)
      .set({
        lastLoginAt: new Date(now),
        loginCount: user.loginCount + 1,
      })
      .where(eq(portalUsers.id, user.id));
  } catch (error) {
    logger.error("portal: failed to touch last_login_at", {
      portalUserId: user.id,
      error,
    });
  }
}

/**
 * Shared loader used by both page/layout server components and server actions.
 * Returns a structured result so callers can choose between redirect/403/render.
 */
async function loadPortalSession(opts?: {
  impersonateContactId?: string | null;
}): Promise<LoadResult> {
  if (!AUTH_ENABLED) {
    // Demo mode: surface the seed portal user if it exists. Staff
    // demo admins can still run the portal locally by passing
    // ?impersonate=<contactId>.
    const targetContactId = opts?.impersonateContactId ?? null;
    if (targetContactId) {
      const [contact, portalUser] = await Promise.all([
        loadContact(targetContactId),
        loadPortalUserByContactId(targetContactId),
      ]);
      if (!contact || !portalUser) return { kind: "forbidden" };
      const caseList = await loadCasesForContact(contact.id);
      return {
        kind: "ok",
        session: {
          portalUser,
          contact,
          cases: caseList,
          isImpersonating: true,
          impersonatorClerkId: "demo-admin",
        },
      };
    }

    // Fall back to the seed portal user.
    const [seed] = await db
      .select({
        id: portalUsers.id,
        organizationId: portalUsers.organizationId,
        contactId: portalUsers.contactId,
        authUserId: portalUsers.authUserId,
        email: portalUsers.email,
        status: portalUsers.status,
        preferredLocale: portalUsers.preferredLocale,
        loginCount: portalUsers.loginCount,
        lastLoginAt: portalUsers.lastLoginAt,
      })
      .from(portalUsers)
      .limit(1);
    if (!seed) return { kind: "forbidden" };
    const contact = await loadContact(seed.contactId);
    if (!contact) return { kind: "forbidden" };
    const caseList = await loadCasesForContact(contact.id);
    return {
      kind: "ok",
      session: {
        portalUser: seed,
        contact,
        cases: caseList,
        isImpersonating: false,
        impersonatorClerkId: null,
      },
    };
  }

  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return { kind: "redirect", to: "/login" };
  }

  const metadata =
    (sessionClaims?.metadata as { role?: string } | undefined) ?? {};
  const role = metadata.role;

  // Staff impersonation path.
  if (role !== "client") {
    const targetContactId = opts?.impersonateContactId ?? null;
    if (!targetContactId) {
      return { kind: "redirect", to: "/dashboard" };
    }
    const canImpersonate = await staffUserCanImpersonate(userId);
    if (!canImpersonate) return { kind: "forbidden" };

    const [contact, portalUser] = await Promise.all([
      loadContact(targetContactId),
      loadPortalUserByContactId(targetContactId),
    ]);
    if (!contact) return { kind: "forbidden" };
    // When the client hasn't been invited yet we still let staff preview the
    // portal against a synthetic portal_user bag so Wave 2 pages don't crash.
    const effectivePortalUser: PortalSessionUser =
      portalUser ??
      ({
        id: "impersonation-shim",
        organizationId: contact.organizationId,
        contactId: contact.id,
        authUserId: "impersonation",
        email: contact.email ?? "",
        status: "invited",
        preferredLocale: contact.preferredLocale,
        loginCount: 0,
        lastLoginAt: null,
      } satisfies PortalSessionUser);
    const caseList = await loadCasesForContact(contact.id);
    return {
      kind: "ok",
      session: {
        portalUser: effectivePortalUser,
        contact,
        cases: caseList,
        isImpersonating: true,
        impersonatorClerkId: userId,
      },
    };
  }

  // Real client user path.
  const portalUser = await loadPortalUserByAuthId(userId);
  if (!portalUser) {
    // Clerk says role=client but we have no portal_users row. Fall back to
    // matching by email so a fresh Clerk account can still reconcile.
    const clerkUser = await currentUser();
    const clerkEmail = clerkUser?.emailAddresses?.[0]?.emailAddress ?? null;
    if (clerkEmail) {
      const [byEmail] = await db
        .select({
          id: portalUsers.id,
          organizationId: portalUsers.organizationId,
          contactId: portalUsers.contactId,
          authUserId: portalUsers.authUserId,
          email: portalUsers.email,
          status: portalUsers.status,
          preferredLocale: portalUsers.preferredLocale,
          loginCount: portalUsers.loginCount,
          lastLoginAt: portalUsers.lastLoginAt,
        })
        .from(portalUsers)
        .where(eq(portalUsers.email, clerkEmail))
        .limit(1);
      if (byEmail) {
        try {
          await db
            .update(portalUsers)
            .set({ authUserId: userId })
            .where(eq(portalUsers.id, byEmail.id));
        } catch {
          // swallow — reconciliation is best-effort
        }
        const contact = await loadContact(byEmail.contactId);
        if (!contact) return { kind: "forbidden" };
        const caseList = await loadCasesForContact(contact.id);
        return {
          kind: "ok",
          session: {
            portalUser: { ...byEmail, authUserId: userId },
            contact,
            cases: caseList,
            isImpersonating: false,
            impersonatorClerkId: null,
          },
        };
      }
    }
    return { kind: "forbidden" };
  }

  if (portalUser.status === "suspended" || portalUser.status === "deactivated") {
    return { kind: "forbidden" };
  }

  const contact = await loadContact(portalUser.contactId);
  if (!contact) return { kind: "forbidden" };
  const caseList = await loadCasesForContact(contact.id);
  await debouncedTouchLogin(portalUser);

  return {
    kind: "ok",
    session: {
      portalUser,
      contact,
      cases: caseList,
      isImpersonating: false,
      impersonatorClerkId: null,
    },
  };
}

/**
 * Strict loader for portal pages. Use this at the top of any server
 * component / server action that should only be reachable by a portal user
 * (or an impersonating staff user).
 *
 *   - No Clerk session → redirect to /login
 *   - Staff without ?impersonate → redirect to /dashboard
 *   - Staff with impersonate=<contactId> but not allowed → 403
 *   - Client without a portal_users row → 403
 *   - Suspended/deactivated portal user → 403
 */
export async function ensurePortalSession(opts?: {
  impersonateContactId?: string | null;
}): Promise<PortalSession> {
  const result = await loadPortalSession(opts);
  if (result.kind === "redirect") redirect(result.to);
  if (result.kind === "forbidden") notFound();
  return result.session;
}

/** Non-throwing variant for UI bits that want to optionally render things. */
export async function tryGetPortalSession(opts?: {
  impersonateContactId?: string | null;
}): Promise<PortalSession | null> {
  const result = await loadPortalSession(opts);
  return result.kind === "ok" ? result.session : null;
}

export async function getPortalRequestContext(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  const [ip, userAgent] = await Promise.all([
    getRequestIp(),
    getRequestUserAgent(),
  ]);
  return { ip, userAgent };
}
