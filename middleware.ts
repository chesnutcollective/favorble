import { updateSession } from "@/db/middleware";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// Allow public paths
	if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
		return await updateSession(request);
	}

	// Refresh session and check auth
	const response = await updateSession(request);

	// Check if user is authenticated by looking for Supabase auth cookies
	const hasAuthCookie = request.cookies
		.getAll()
		.some((cookie) => cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"));

	if (!hasAuthCookie) {
		const loginUrl = new URL("/login", request.url);
		loginUrl.searchParams.set("redirect", pathname);
		return NextResponse.redirect(loginUrl);
	}

	return response;
}

export const config = {
	matcher: [
		/*
		 * Match all request paths except:
		 * - _next/static (static files)
		 * - _next/image (image optimization)
		 * - favicon.ico, sitemap.xml, robots.txt
		 * - public files (images, etc.)
		 * - api routes (handled separately)
		 */
		"/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};
