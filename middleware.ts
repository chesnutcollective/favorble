import { type NextRequest, NextResponse } from "next/server";

export async function middleware(_request: NextRequest) {
	// Auth disabled for demo — all routes are public
	return NextResponse.next();
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
