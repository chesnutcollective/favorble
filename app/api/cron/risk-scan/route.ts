import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { scoreAllActiveCases } from "@/lib/services/risk-scorer";

/**
 * Hourly case risk rescan (PR-1). Scheduled via vercel.json
 * (`15 * * * *`). The sweep rescores every active case so the UI stays
 * within the last hour of signal.
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
    logger.error("Cron risk-scan unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("Cron risk-scan started");
  const result = await scoreAllActiveCases();
  logger.info("Cron risk-scan complete", result);
  return NextResponse.json({ success: true, ...result });
}
