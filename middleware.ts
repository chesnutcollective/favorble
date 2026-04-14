import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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
	"/collab(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
	if (AUTH_ENABLED && !isPublicRoute(request)) {
		await auth.protect();
	}
});

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};
