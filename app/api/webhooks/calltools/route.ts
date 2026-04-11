import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { callRecordings, cases } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import { enqueueTranscription } from "@/lib/services/call-transcription";
import crypto from "node:crypto";

/**
 * CallTools webhook receiver.
 *
 * Accepts POST events from CallTools (or a compatible provider) when a
 * phone call recording finishes. Lands a `callRecordings` row with
 * `status='pending_transcription'`, then enqueues the transcription
 * worker via `after()` so the webhook can 200 fast.
 *
 * Signature verification mirrors the other internal webhooks (ERE,
 * Chronicle, case-status): HMAC-SHA256 over the raw body with the
 * `CALLTOOLS_WEBHOOK_SECRET`. In dev, missing secret is a warning
 * instead of a 401 so smoke tests stay easy.
 */

const isDev = process.env.NODE_ENV === "development";

function verifySignature(signature: string | null, rawBody: string): boolean {
  const secret = process.env.CALLTOOLS_WEBHOOK_SECRET;
  if (!secret) {
    if (isDev) {
      logger.warn(
        "CallTools webhook secret not configured, skipping verification (dev mode)",
      );
      return true;
    }
    return false;
  }
  if (!signature) return false;
  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

async function resolveCaseId(
  caseExternalId: string | null | undefined,
): Promise<{ caseId: string; organizationId: string } | null> {
  if (!caseExternalId) return null;
  const [row] = await db
    .select({
      id: cases.id,
      organizationId: cases.organizationId,
    })
    .from(cases)
    .where(eq(cases.caseStatusExternalId, caseExternalId))
    .limit(1);
  return row
    ? { caseId: row.id, organizationId: row.organizationId }
    : null;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-calltools-signature");

    if (!verifySignature(signature, rawBody)) {
      logger.error("CallTools webhook signature verification failed");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 },
      );
    }

    const body = JSON.parse(rawBody) as {
      event?: string;
      type?: string;
      recordingId?: string;
      id?: string;
      caseId?: string;
      recordingUrl?: string;
      audioUrl?: string;
      direction?: "inbound" | "outbound" | string;
      fromNumber?: string;
      toNumber?: string;
      counterpartyName?: string;
      counterpartyPhone?: string;
      agentUserId?: string;
      startedAt?: string;
      durationSeconds?: number;
      organizationId?: string;
    };

    const eventType = body.event ?? body.type;

    // Only recording-complete-ish events create a row. Everything else
    // is acknowledged and ignored.
    if (
      eventType !== "recording.completed" &&
      eventType !== "call.completed" &&
      eventType !== "recording.available"
    ) {
      logger.info("CallTools webhook ignored (unhandled event)", {
        eventType,
      });
      return NextResponse.json({ success: true, ignored: true });
    }

    const externalId = body.recordingId ?? body.id ?? null;
    const audioUrl = body.recordingUrl ?? body.audioUrl ?? null;
    if (!audioUrl) {
      logger.warn("CallTools webhook missing audio URL", { externalId });
      return NextResponse.json(
        { error: "recordingUrl required" },
        { status: 400 },
      );
    }

    // Try to resolve the case + org. If we can't resolve a case we
    // still need an org id — fall back to the first org in the db only
    // when one is explicitly provided on the payload.
    const resolved = await resolveCaseId(body.caseId);
    if (!resolved && !body.organizationId) {
      logger.warn("CallTools webhook cannot resolve case or org", {
        externalId,
        caseExternalId: body.caseId,
      });
      return NextResponse.json(
        { error: "Unknown case and no organizationId" },
        { status: 404 },
      );
    }

    const orgId = resolved?.organizationId ?? body.organizationId!;

    const direction =
      body.direction === "inbound" || body.direction === "outbound"
        ? body.direction
        : "inbound";

    const [inserted] = await db
      .insert(callRecordings)
      .values({
        organizationId: orgId,
        caseId: resolved?.caseId ?? null,
        userId: body.agentUserId ?? null,
        counterpartyName: body.counterpartyName ?? null,
        counterpartyPhone:
          body.counterpartyPhone ?? body.fromNumber ?? body.toNumber ?? null,
        direction,
        externalRecordingId: externalId,
        audioStoragePath: audioUrl,
        durationSeconds: body.durationSeconds ?? null,
        startedAt: body.startedAt ? new Date(body.startedAt) : null,
        status: "pending_transcription",
      })
      .returning({ id: callRecordings.id });

    logger.info("CallTools recording persisted", {
      recordingId: inserted?.id,
      externalId,
      caseId: resolved?.caseId ?? null,
    });

    // Fire-and-forget — transcription runs via `after()`, returns 200
    // immediately so CallTools doesn't retry.
    if (inserted) {
      enqueueTranscription({ recordingId: inserted.id });
    }

    return NextResponse.json({ success: true, recordingId: inserted?.id });
  } catch (error) {
    logger.error("CallTools webhook error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "calltools-webhook" });
}
