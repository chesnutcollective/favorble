import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { runComplianceScan } from "@/lib/services/compliance-scanner";

/**
 * Daily compliance sweep (PR-2). Scheduled via vercel.json
 * (`30 3 * * *`). Runs every enabled rule in `complianceRules` and
 * inserts `complianceFindings` for new violations.
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
    logger.error("Cron compliance-scan unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("Cron compliance-scan started");
  const result = await runComplianceScan();
  logger.info("Cron compliance-scan complete", result);
  return NextResponse.json({ success: true, ...result });
}
