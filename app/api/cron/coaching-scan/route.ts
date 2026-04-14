import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import {
  detectCoachingFlags,
  detectTrainingGaps,
} from "@/lib/services/coaching-detection";

/**
 * Daily coaching-scan cron (CC-1 + CC-3).
 *
 * Scheduled via vercel.json → `0 4 * * *` (4:00am UTC, chained after
 * the performance rollup so the latest snapshots are already in place).
 * Authenticated with the same CRON_SECRET pattern the other cron
 * routes use.
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
    logger.error("Cron coaching-scan unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("Cron coaching-scan started");

  let flagResult: Awaited<ReturnType<typeof detectCoachingFlags>> = {
    usersScanned: 0,
    flagsInserted: 0,
    flagsSkipped: 0,
  };
  let gapResult: Awaited<ReturnType<typeof detectTrainingGaps>> = {
    rolesScanned: 0,
    gapsInserted: 0,
  };

  try {
    flagResult = await detectCoachingFlags();
  } catch (err) {
    logger.error("Cron coaching-scan detectCoachingFlags failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    gapResult = await detectTrainingGaps();
  } catch (err) {
    logger.error("Cron coaching-scan detectTrainingGaps failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const summary = { ...flagResult, ...gapResult };
  logger.info("Cron coaching-scan complete", summary);
  return NextResponse.json({ success: true, ...summary });
}
