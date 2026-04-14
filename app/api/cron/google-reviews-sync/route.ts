import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { googleOauthConnections } from "@/db/schema";
import { syncGoogleReviews } from "@/lib/services/google-reviews-sync";
import { logger } from "@/lib/logger/server";

/**
 * GET /api/cron/google-reviews-sync
 *
 * Protected by CRON_SECRET. Iterates every org with a completed Google
 * Business Profile connection and syncs reviews for each.
 *
 * NOTE: Vercel Hobby plan caps the project to daily crons — this endpoint
 * is safe to wire into vercel.json when the plan upgrades. Until then it
 * can be triggered manually (curl w/ Bearer header) or from the admin
 * "Refresh reviews" button.
 */
function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await db
    .select({ organizationId: googleOauthConnections.organizationId })
    .from(googleOauthConnections);

  let ok = 0;
  let failed = 0;
  const errors: Array<{ organizationId: string; reason: string }> = [];

  for (const c of connections) {
    try {
      const result = await syncGoogleReviews(c.organizationId);
      if (result.ok) {
        ok++;
      } else {
        failed++;
        errors.push({ organizationId: c.organizationId, reason: result.reason });
      }
    } catch (err) {
      failed++;
      errors.push({
        organizationId: c.organizationId,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("Cron google-reviews-sync complete", {
    total: connections.length,
    ok,
    failed,
  });

  return NextResponse.json({
    success: true,
    total: connections.length,
    ok,
    failed,
    errors: errors.slice(0, 10),
  });
}
