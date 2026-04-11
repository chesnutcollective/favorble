import "server-only";
import { after } from "next/server";
import { db } from "@/db/drizzle";
import { callRecordings, callTranscripts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import { enqueueCallQcReview } from "@/lib/services/call-qc";

/**
 * QA-1 — Call transcription (STUB).
 *
 * This is a stub. Connect Deepgram or Whisper by implementing
 * `transcribeRecording` against their API. Current behavior inserts a
 * placeholder transcript so the pipeline is runnable end-to-end.
 *
 * ──────────────────────────────────────────────────────────────
 * PRODUCTION EXTENSION POINTS
 * ──────────────────────────────────────────────────────────────
 *
 * To turn this into a real transcription worker:
 *
 * 1. DEEPGRAM (recommended — fastest + best SSDI/medical accuracy):
 *    - npm i @deepgram/sdk
 *    - import { createClient } from "@deepgram/sdk";
 *    - const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);
 *    - Fetch the audio bytes from `audioStoragePath` (or pass the URL
 *      directly when the provider allows it — Deepgram accepts a URL).
 *    - Call:
 *        const { result } = await deepgram.listen.prerecorded.transcribeUrl(
 *          { url: audioUrl },
 *          { model: "nova-2", diarize: true, smart_format: true, punctuate: true }
 *        );
 *    - Map result.results.channels[0].alternatives[0] → fullText,
 *      paragraphs/utterances → `segments` array of
 *      `{ speaker, startMs, endMs, text }`.
 *    - confidence = alt.confidence
 *
 * 2. WHISPER (OpenAI, cheaper but no diarization out of the box):
 *    - POST the audio file to
 *      https://api.openai.com/v1/audio/transcriptions
 *      with model=whisper-1, response_format=verbose_json, timestamp_granularities[]=segment.
 *    - Map response.text → fullText, response.segments → segments
 *      with `speaker: "unknown"`.
 *
 * 3. AUDIO FETCH:
 *    - Current `audioStoragePath` from the CallTools webhook is a
 *      short-lived signed URL. For durability, first fetch the bytes
 *      and re-persist them to Railway Object Storage (see
 *      `lib/services/document-ingest.ts` for the pattern), then point
 *      the transcription provider at the durable path.
 *
 * 4. ERRORS:
 *    - On any provider failure, set `callRecordings.status = 'error'`
 *      and log with `recordingId` + `externalRecordingId`. The cron
 *      scanner mentioned in `db/schema/call-qc.ts` can retry.
 *
 * 5. AFTER SUCCESS:
 *    - Always `enqueueCallQcReview({ recordingId })` so the AI QC
 *      stage picks the new transcript up. The stub already does this.
 */

const STUB_TEXT = "[STUB TRANSCRIPT — connect Deepgram]";

/**
 * Transcribe a recording. STUB implementation — always writes a
 * placeholder transcript and marks the recording `transcribed`.
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

    if (recording.status !== "pending_transcription") {
      logger.info("call-transcription: recording not in pending state", {
        recordingId,
        status: recording.status,
      });
      // Don't bail — callers may be retrying after an error. Fall
      // through and overwrite.
    }

    // TODO(QA-1): replace this block with a real Deepgram/Whisper call.
    // See the big comment block at the top of the file for exact API
    // shapes. For now, we insert a clearly-labeled placeholder so the
    // downstream AI QC reviewer has a non-null row to read.
    const stubSegments = [
      {
        speaker: "agent",
        startMs: 0,
        endMs: 0,
        text: STUB_TEXT,
      },
    ];

    // Upsert by recording id — the call_transcripts table has a
    // unique index on call_recording_id.
    const existing = await db
      .select({ id: callTranscripts.id })
      .from(callTranscripts)
      .where(eq(callTranscripts.callRecordingId, recordingId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(callTranscripts)
        .set({
          provider: "stub",
          fullText: STUB_TEXT,
          segments: stubSegments,
          confidence: "0.000",
          wordCount: STUB_TEXT.split(/\s+/).length,
        })
        .where(eq(callTranscripts.callRecordingId, recordingId));
    } else {
      await db.insert(callTranscripts).values({
        callRecordingId: recordingId,
        provider: "stub",
        fullText: STUB_TEXT,
        segments: stubSegments,
        confidence: "0.000",
        wordCount: STUB_TEXT.split(/\s+/).length,
      });
    }

    await db
      .update(callRecordings)
      .set({ status: "transcribed", updatedAt: new Date() })
      .where(eq(callRecordings.id, recordingId));

    logger.info("call-transcription: stub transcript written", {
      recordingId,
    });

    // Kick the QC reviewer off now that we have a transcript row.
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
