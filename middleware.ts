import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Set ENABLE_CLERK_AUTH=true to enforce real Clerk auth.
// When false (default), the middleware initializes Clerk context but
// does not require auth — pages fall back to a demo user via session.ts.
// This is the temporary setup until a real custom domain is added to
// Clerk (Clerk doesn't allow *.vercel.app domains).
const AUTH_ENABLED = process.env.ENABLE_CLERK_AUTH === "true";

const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/intake(.*)",
  "/api/intake(.*)",
  // Invite accept flow must be reachable without a Clerk session — that's
  // the whole point: the claimant lands here before they have an account.
  "/portal/invite/(.*)",
  // Magic-link redemption arrives from an SMS before the claimant has a
  // session cookie. The handler itself establishes one (or redirects to
  // /login) after validating the token.
  "/portal/link/(.*)",
  // Phase 6 — suspended portal users are redirected here. Must live outside
  // the `(client)` layout / auth gate so the landing explanation actually
  // renders instead of looping through ensurePortalSession.
  "/portal/paused",
]);

const isPortalRoute = createRouteMatcher(["/portal(.*)"]);

/**
 * Role-aware routing (Wave 1 of client portal).
 *
 * sessionClaims.metadata mirrors the Clerk user's `publicMetadata`:
 *   { role: 'client' | 'staff', portalUserId?: string, canImpersonate?: boolean }
 *
 * Rules:
 *   - role === 'client'                 → may only visit /portal/* and public
 *                                         routes. Everything else bounces to
 *                                         /portal.
 *   - role !== 'client' (staff/admin)   → /portal/* normally redirects to
 *                                         /dashboard, EXCEPT when the URL
 *                                         carries ?impersonate=<contactId>
 *                                         and the staff user is allowed to
 *                                         impersonate (admin role OR
 *                                         publicMetadata.canImpersonate).
 *   - Unauthenticated + /portal/invite  → allowed (accept-invite flow).
 */
export default clerkMiddleware(async (auth, request) => {
  const { searchParams } = request.nextUrl;

  // Public routes (incl. /portal/invite/:token) always bypass auth.
  if (isPublicRoute(request)) {
    return NextResponse.next();
  }

  if (!AUTH_ENABLED) {
    // Demo mode — let every request through; session.ts falls back to a
    // demo admin. The portal shell still gates on portal_users lookup so
    // we don't leak client-only pages to a staff demo user.
    const onPortalDemo = isPortalRoute(request);
    const impersonateDemo = searchParams.get("impersonate");
    if (onPortalDemo && impersonateDemo) {
      const response = NextResponse.next();
      response.cookies.set("favorble_portal_impersonate", impersonateDemo, {
        httpOnly: true,
        sameSite: "lax",
        path: "/portal",
        maxAge: 60 * 60,
      });
      return response;
    }
    return NextResponse.next();
  }

  const { userId, sessionClaims } = await auth();
  if (!userId) {
    await auth.protect();
    return NextResponse.next();
  }

  const metadata =
    (sessionClaims?.metadata as
      | { role?: string; canImpersonate?: boolean }
      | undefined) ?? {};
  const role = metadata.role;
  const canImpersonate =
    metadata.canImpersonate === true ||
    (sessionClaims?.org_role as string | undefined) === "admin";

  const isClient = role === "client";
  const onPortal = isPortalRoute(request);

  if (isClient) {
    // Client users: portal only. Everything else rewrites to /portal.
    if (!onPortal) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Staff user hitting the portal: only allowed via impersonation.
  if (onPortal) {
    const impersonate = searchParams.get("impersonate");
    if (impersonate && canImpersonate) {
      // Stash on a cookie the layout can read — layouts don't receive
      // searchParams in app router, so this is the reliable channel.
      const response = NextResponse.next();
      response.cookies.set("favorble_portal_impersonate", impersonate, {
        httpOnly: true,
        sameSite: "lax",
        path: "/portal",
        maxAge: 60 * 60, // 1 hour preview window
        secure: process.env.NODE_ENV === "production",
      });
      return response;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Client is leaving the portal → scrub any stale impersonation cookie.
  if (!onPortal) {
    const response = NextResponse.next();
    if (request.cookies.has("favorble_portal_impersonate")) {
      response.cookies.delete("favorble_portal_impersonate");
    }
    return response;
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
