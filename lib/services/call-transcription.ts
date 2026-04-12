import "server-only";
import { after } from "next/server";
import { db } from "@/db/drizzle";
import { callRecordings, callTranscripts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import { enqueueCallQcReview } from "@/lib/services/call-qc";

/**
 * Call transcription service.
 *
 * Real Deepgram integration — set DEEPGRAM_API_KEY to enable.
 * Without the key, falls back to a stub placeholder transcript so the
 * pipeline is still runnable end-to-end in dev.
 *
 * Deepgram setup:
 * 1. Sign up at https://console.deepgram.com/
 * 2. Create an API key
 * 3. Add DEEPGRAM_API_KEY to .env.local and Vercel env vars
 *
 * Cost note: nova-2 is ~$0.0043/minute. 1000 calls × 5 min avg = $21.50.
 */

const STUB_TEXT = "[STUB TRANSCRIPT — set DEEPGRAM_API_KEY to enable real transcription]";

const DEEPGRAM_ENDPOINT =
  "https://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&diarize=true&smart_format=true&utterances=true";

type Utterance = {
  start?: number;
  end?: number;
  transcript?: string;
  speaker?: number;
  confidence?: number;
};

type DeepgramResponse = {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        confidence?: number;
      }>;
    }>;
    utterances?: Utterance[];
  };
};

type TranscriptionResult = {
  fullText: string;
  segments: Array<{
    speaker: string;
    startMs: number;
    endMs: number;
    text: string;
    confidence: number;
  }>;
  confidence: number;
  wordCount: number;
};

/**
 * Call Deepgram's pre-recorded transcription endpoint with diarization
 * enabled. Groups consecutive same-speaker utterances into segments so
 * the UI can render speaker-separated turns.
 */
async function transcribeWithDeepgram(
  audioUrlOrBuffer: string | Buffer,
  opts: { apiKey: string; contentType?: string },
): Promise<TranscriptionResult> {
  let body: BodyInit;
  let headers: Record<string, string>;

  if (typeof audioUrlOrBuffer === "string") {
    body = JSON.stringify({ url: audioUrlOrBuffer });
    headers = {
      Authorization: `Token ${opts.apiKey}`,
      "Content-Type": "application/json",
    };
  } else {
    // Wrap Buffer in a fresh Uint8Array so TS's BodyInit is happy even
    // when the underlying buffer is SharedArrayBuffer-typed.
    const copy = new Uint8Array(audioUrlOrBuffer);
    body = new Blob([copy], { type: opts.contentType ?? "audio/mpeg" });
    headers = {
      Authorization: `Token ${opts.apiKey}`,
      "Content-Type": opts.contentType ?? "audio/mpeg",
    };
  }

  const response = await fetch(DEEPGRAM_ENDPOINT, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Deepgram returned HTTP ${response.status}: ${text.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as DeepgramResponse;
  const alt = data.results?.channels?.[0]?.alternatives?.[0];
  const fullText = alt?.transcript ?? "";
  const topConfidence = alt?.confidence ?? 0;
  const utterances = data.results?.utterances ?? [];

  // Group consecutive same-speaker utterances into segments.
  const segments: TranscriptionResult["segments"] = [];
  let current: TranscriptionResult["segments"][number] | null = null;
  for (const u of utterances) {
    const speaker = `Speaker ${(u.speaker ?? 0) + 1}`;
    const startMs = Math.round((u.start ?? 0) * 1000);
    const endMs = Math.round((u.end ?? 0) * 1000);
    const text = (u.transcript ?? "").trim();
    const confidence = u.confidence ?? 0;
    if (!text) continue;
    if (current && current.speaker === speaker) {
      current.endMs = endMs;
      current.text += " " + text;
      // Running average confidence
      current.confidence = (current.confidence + confidence) / 2;
    } else {
      if (current) segments.push(current);
      current = { speaker, startMs, endMs, text, confidence };
    }
  }
  if (current) segments.push(current);

  return {
    fullText,
    segments,
    confidence: topConfidence,
    wordCount: fullText.split(/\s+/).filter(Boolean).length,
  };
}

/**
 * Upsert a transcript row for a given recording. Clamps confidence to
 * fit the numeric(4,3) column.
 */
async function upsertTranscript(input: {
  recordingId: string;
  provider: string;
  fullText: string;
  segments: unknown;
  confidence: number;
  wordCount: number;
}): Promise<void> {
  const confidenceStr = Math.max(0, Math.min(0.999, input.confidence))
    .toFixed(3);

  const existing = await db
    .select({ id: callTranscripts.id })
    .from(callTranscripts)
    .where(eq(callTranscripts.callRecordingId, input.recordingId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(callTranscripts)
      .set({
        provider: input.provider,
        fullText: input.fullText,
        segments: input.segments as never,
        confidence: confidenceStr,
        wordCount: input.wordCount,
      })
      .where(eq(callTranscripts.callRecordingId, input.recordingId));
  } else {
    await db.insert(callTranscripts).values({
      callRecordingId: input.recordingId,
      provider: input.provider,
      fullText: input.fullText,
      segments: input.segments as never,
      confidence: confidenceStr,
      wordCount: input.wordCount,
    });
  }
}

/**
 * Transcribe a recording. Routes to Deepgram when DEEPGRAM_API_KEY is
 * set; otherwise falls back to a clearly-labeled stub so downstream
 * stages still have a transcript row to work with.
 */
export async function transcribeRecording(recordingId: string): Promise<void> {
  try {
    const [recording] = await db
      .select({
        id: callRecordings.id,
        audioStoragePath: callRecordings.audioStoragePath,
        status: callRecordings.status,
      })
      .from(callRecordings)
      .where(eq(callRecordings.id, recordingId))
      .limit(1);

    if (!recording) {
      logger.warn("call-transcription: recording not found", { recordingId });
      return;
    }

    const apiKey = process.env.DEEPGRAM_API_KEY;

    if (!apiKey) {
      logger.info(
        "call-transcription: DEEPGRAM_API_KEY not set, writing stub",
        { recordingId },
      );
      await upsertTranscript({
        recordingId,
        provider: "stub_no_api_key",
        fullText: STUB_TEXT,
        segments: [
          { speaker: "Speaker 1", startMs: 0, endMs: 0, text: STUB_TEXT, confidence: 0 },
        ],
        confidence: 0,
        wordCount: STUB_TEXT.split(/\s+/).length,
      });
      await db
        .update(callRecordings)
        .set({ status: "transcribed", updatedAt: new Date() })
        .where(eq(callRecordings.id, recordingId));
      enqueueCallQcReview({ recordingId });
      return;
    }

    if (!recording.audioStoragePath) {
      logger.warn("call-transcription: no audio storage path", { recordingId });
      await db
        .update(callRecordings)
        .set({ status: "error", updatedAt: new Date() })
        .where(eq(callRecordings.id, recordingId));
      return;
    }

    // Real Deepgram call. The current webhook stores a pre-signed URL
    // directly; if/when we move to durable Railway bucket storage,
    // swap this for a fetch of the bytes first.
    const result = await transcribeWithDeepgram(recording.audioStoragePath, {
      apiKey,
    });

    await upsertTranscript({
      recordingId,
      provider: "deepgram",
      fullText: result.fullText,
      segments: result.segments,
      confidence: result.confidence,
      wordCount: result.wordCount,
    });

    await db
      .update(callRecordings)
      .set({ status: "transcribed", updatedAt: new Date() })
      .where(eq(callRecordings.id, recordingId));

    logger.info("call-transcription: Deepgram transcript written", {
      recordingId,
      wordCount: result.wordCount,
      segmentCount: result.segments.length,
    });

    enqueueCallQcReview({ recordingId });
  } catch (err) {
    logger.error("call-transcription: transcribe failed", {
      recordingId,
      error: err instanceof Error ? err.message : String(err),
    });
    try {
      await db
        .update(callRecordings)
        .set({ status: "error", updatedAt: new Date() })
        .where(eq(callRecordings.id, recordingId));
    } catch {
      // best-effort
    }
  }
}

/**
 * Schedule transcription to run after the current request has
 * responded. Fire-and-forget.
 */
export function enqueueTranscription(input: { recordingId: string }): void {
  logger.info("call-transcription: enqueued", {
    recordingId: input.recordingId,
  });
  after(async () => {
    try {
      await transcribeRecording(input.recordingId);
    } catch (err) {
      logger.error("call-transcription: enqueued run threw", {
        recordingId: input.recordingId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
