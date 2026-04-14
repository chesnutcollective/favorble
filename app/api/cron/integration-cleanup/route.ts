import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import { integrationEvents } from "@/db/schema";
import { lt } from "drizzle-orm";

/**
 * TTL cleanup cron — deletes integration_events rows older than 30 days.
 *
 * Schedule: 0 5 * * * (daily at 5am UTC)
 * Auth: CRON_SECRET Bearer token
 */

const TTL_DAYS = 30;

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
    logger.error("Cron integration-cleanup unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoff = new Date(Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000);

    const result = await db
      .delete(integrationEvents)
      .where(lt(integrationEvents.createdAt, cutoff))
      .returning({ id: integrationEvents.id });

    const deletedCount = result.length;

    logger.info("Cron integration-cleanup complete", {
      deletedCount,
      cutoff: cutoff.toISOString(),
    });

    return NextResponse.json({ success: true, deletedCount });
  } catch (err) {
    logger.error("Cron integration-cleanup failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
