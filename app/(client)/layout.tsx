import type { ReactNode } from "react";
import { cookies } from "next/headers";
import {
  ensurePortalSession,
  getPortalRequestContext,
} from "@/lib/auth/portal-session";
import { insertPortalActivity } from "@/lib/services/portal-activity";
import { PortalImpersonationProvider } from "@/components/portal/portal-impersonation-context";
import { PortalImpersonationBanner } from "@/components/portal/impersonation-banner";
import { PortalShell } from "@/components/portal/portal-shell";

export const PORTAL_IMPERSONATE_COOKIE = "favorble_portal_impersonate";

/**
 * Route group layout for the claimant-facing portal.
 *
 * Responsibilities:
 *   - require an authenticated portal session (or staff impersonation)
 *   - bump last_login_at + login_count (debounced >1hr, handled in
 *     ensurePortalSession)
 *   - append a 'login' event to portal_activity_events
 *   - expose the impersonation context so Wave 2 components can disable
 *     write actions when a staff user is previewing the portal
 *
 * Public sibling: /portal/invite/:token lives at app/portal/invite/[token]
 * (outside this route group) precisely so it can bypass this layout.
 */
export default async function ClientRouteGroupLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Middleware stashed the ?impersonate=<contactId> target on a cookie it set
  // scoped to /portal. If a non-staff user somehow has the cookie set, the
  // ensurePortalSession check below still re-verifies the actor's role.
  const cookieStore = await cookies();
  const impersonateContactId =
    cookieStore.get(PORTAL_IMPERSONATE_COOKIE)?.value ?? null;

  const session = await ensurePortalSession({
    impersonateContactId,
  });

  // Login activity event — suppressed while impersonating so we don't
  // pollute the claimant's real timeline with staff browsing.
  if (!session.isImpersonating) {
    const { ip, userAgent } = await getPortalRequestContext();
    await insertPortalActivity({
      organizationId: session.portalUser.organizationId,
      portalUserId: session.portalUser.id,
      caseId: session.cases[0]?.id ?? null,
      eventType: "login",
      ip,
      userAgent,
    });
  }

  const claimantName =
    `${session.contact.firstName} ${session.contact.lastName}`.trim();
  const caseNumber = session.cases[0]?.caseNumber ?? null;
  const locale = session.contact.preferredLocale || "en";

  return (
    <PortalImpersonationProvider
      value={{
        isImpersonating: session.isImpersonating,
        impersonatorClerkId: session.impersonatorClerkId,
        viewingName: claimantName || session.contact.email || "Claimant",
      }}
    >
      <div data-locale={locale}>
        <PortalImpersonationBanner />
        <PortalShell
          claimantName={claimantName || "Claimant"}
          caseNumber={caseNumber}
          locale={locale}
        >
          {children}
        </PortalShell>
      </div>
    </PortalImpersonationProvider>
  );
}

