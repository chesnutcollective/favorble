import { NextRequest, NextResponse } from "next/server";
import { and, gte, inArray } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { callRecordings } from "@/db/schema";
import { logger } from "@/lib/logger/server";
import { transcribeRecording } from "@/lib/services/call-transcription";

/**
 * Cron endpoint that retries failed / pending call transcriptions.
 *
 * A recording qualifies for retry when:
 * - status IN ('error', 'pending_transcription')
 * - createdAt > now - 7 days (give up after a week)
 *
 * Scheduled via vercel.json → runs every 15 minutes.
 * Authenticated via CRON_SECRET (same pattern as the other cron endpoints).
 */

const MAX_RECORDINGS_PER_RUN = 20;
const GIVE_UP_DAYS = 7;

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured — allow in dev, reject in prod
    return process.env.NODE_ENV !== "production";
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    logger.error("Cron transcription-retry unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const giveUpBefore = new Date(
    now.getTime() - GIVE_UP_DAYS * 24 * 60 * 60_000,
  );

  let candidates: { id: string; status: string }[] = [];
  try {
    candidates = await db
      .select({
        id: callRecordings.id,
        status: callRecordings.status,
      })
      .from(callRecordings)
      .where(
        and(
          inArray(callRecordings.status, ["error", "pending_transcription"]),
          gte(callRecordings.createdAt, giveUpBefore),
        ),
      )
      .limit(MAX_RECORDINGS_PER_RUN);
  } catch (err) {
    logger.error("Cron transcription-retry query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  logger.info("Cron transcription-retry sweep started", {
    candidateCount: candidates.length,
    giveUpBefore: giveUpBefore.toISOString(),
  });

  let swept = 0;
  let succeeded = 0;
  let failed = 0;

  for (const row of candidates) {
    swept++;
    try {
      await transcribeRecording(row.id);
      succeeded++;
    } catch (err) {
      failed++;
      logger.error("Cron transcription-retry transcribe threw", {
        recordingId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const summary = {
    candidateCount: candidates.length,
    swept,
    succeeded,
    failed,
  };
  logger.info("Cron transcription-retry sweep complete", summary);

  return NextResponse.json({ success: true, ...summary });
}
