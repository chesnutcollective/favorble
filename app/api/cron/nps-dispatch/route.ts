import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { dispatchPendingNpsSurveys } from "@/lib/services/nps-dispatch";

/**
 * Cron endpoint that sweeps pending `nps_responses` rows and sends them via
 * the campaign's channel (sms / email / portal-banner). Follows the same
 * CRON_SECRET bearer pattern as the other crons in app/api/cron.
 *
 * Scheduled via vercel.json. Safe to call ad-hoc for testing so long as the
 * bearer token matches CRON_SECRET.
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
    logger.error("Cron nps-dispatch unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await dispatchPendingNpsSurveys();
    logger.info("Cron nps-dispatch sweep complete", result);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    logger.error("Cron nps-dispatch sweep failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Sweep failed" },
      { status: 500 },
    );
  }
}
