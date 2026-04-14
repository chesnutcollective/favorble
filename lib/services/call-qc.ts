import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { db } from "@/db/drizzle";
import { callRecordings, callTranscripts, callQcReviews } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import {
  buildCaseContext,
  formatCaseContextForPrompt,
} from "@/lib/services/case-context";

/**
 * QA-1 — Call transcript AI QC review.
 *
 * Reads the `callTranscripts` row for a recording, gathers case
 * context when available, and asks Claude for a structured quality
 * review. Writes the review into `callQcReviews` and flips
 * `callRecordings.status = 'reviewed'` (or 'flagged' when the review
 * raises concerns).
 *
 * Fire-and-forget via `enqueueCallQcReview`.
 */

export type CallQcSubScores = {
  quality: number;
  compliance: number;
  empathy: number;
  professionalism: number;
};

export type CallQcHighlight = {
  kind: "positive" | "negative";
  text: string;
  transcriptOffsetMs?: number;
};

export type CallQcFlag = {
  severity: "info" | "warn" | "critical";
  reason: string;
};

export type CallQcPayload = {
  overallScore: number;
  scores: CallQcSubScores;
  highlights: CallQcHighlight[];
  flags: CallQcFlag[];
  summary: string;
};

let anthropicClient: Anthropic | null = null;
function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

const MODEL = "claude-sonnet-4-20250514";

const SYSTEM_PROMPT = `You are a call-quality reviewer for a Social Security Disability law firm.
You will be given the transcript of a phone call between a staff member and a claimant (or third party like SSA).
Evaluate the call along four dimensions:
  - quality: clarity, completeness, actionability
  - compliance: HIPAA, no legal guarantees, proper disclosures, no medical advice
  - empathy: acknowledges the claimant's situation, patient, listening
  - professionalism: tone, language, representing the firm well

Return JSON only. Schema:
{
  "overallScore": number 0-100,
  "scores": {
    "quality": number 0-100,
    "compliance": number 0-100,
    "empathy": number 0-100,
    "professionalism": number 0-100
  },
  "highlights": [{"kind": "positive"|"negative", "text": string}],
  "flags": [{"severity": "info"|"warn"|"critical", "reason": string}],
  "summary": string (2-4 sentences)
}

If the transcript is missing or is a placeholder (e.g. "[STUB TRANSCRIPT]"),
return overallScore 0, all sub-scores 0, a single info flag noting the
missing transcript, and a summary that explains the placeholder.`;

function clampScore(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  const r = Math.round(value);
  if (r < 0) return 0;
  if (r > 100) return 100;
  return r;
}

function coerceHighlights(value: unknown): CallQcHighlight[] {
  if (!Array.isArray(value)) return [];
  const out: CallQcHighlight[] = [];
  for (const v of value) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const kind = r.kind === "positive" || r.kind === "negative" ? r.kind : null;
    const text = typeof r.text === "string" ? r.text : null;
    if (!kind || !text) continue;
    out.push({
      kind,
      text: text.slice(0, 500),
      transcriptOffsetMs:
        typeof r.transcriptOffsetMs === "number"
          ? r.transcriptOffsetMs
          : undefined,
    });
    if (out.length >= 20) break;
  }
  return out;
}

function coerceFlags(value: unknown): CallQcFlag[] {
  if (!Array.isArray(value)) return [];
  const out: CallQcFlag[] = [];
  for (const v of value) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const severity =
      r.severity === "info" ||
      r.severity === "warn" ||
      r.severity === "critical"
        ? r.severity
        : null;
    const reason = typeof r.reason === "string" ? r.reason : null;
    if (!severity || !reason) continue;
    out.push({ severity, reason: reason.slice(0, 500) });
    if (out.length >= 20) break;
  }
  return out;
}

export async function reviewCallTranscript(
  recordingId: string,
): Promise<CallQcPayload | null> {
  const client = getClient();
  if (!client) {
    logger.info("call-qc: skipping (ANTHROPIC_API_KEY not set)", {
      recordingId,
    });
    return null;
  }

  try {
    const [recording] = await db
      .select({
        id: callRecordings.id,
        caseId: callRecordings.caseId,
        counterpartyName: callRecordings.counterpartyName,
        direction: callRecordings.direction,
      })
      .from(callRecordings)
      .where(eq(callRecordings.id, recordingId))
      .limit(1);

    if (!recording) {
      logger.warn("call-qc: recording not found", { recordingId });
      return null;
    }

    const [transcript] = await db
      .select({
        fullText: callTranscripts.fullText,
        segments: callTranscripts.segments,
        provider: callTranscripts.provider,
      })
      .from(callTranscripts)
      .where(eq(callTranscripts.callRecordingId, recordingId))
      .limit(1);

    if (!transcript) {
      logger.warn("call-qc: transcript not found", { recordingId });
      return null;
    }

    let contextBlock = "(no case context — call is not linked to a case)";
    if (recording.caseId) {
      const ctx = await buildCaseContext(recording.caseId, {
        communicationsLimit: 8,
        chronologyLimit: 6,
        documentsLimit: 6,
      });
      if (ctx) {
        contextBlock = formatCaseContextForPrompt(ctx, { maxBodyChars: 400 });
      }
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${contextBlock}\n\n# Call metadata\nDirection: ${recording.direction}\nCounterparty: ${recording.counterpartyName ?? "unknown"}\nTranscript provider: ${transcript.provider}\n\n# Full transcript\n${transcript.fullText.slice(0, 30000)}\n\nReturn JSON only.`,
        },
      ],
    });

    const block = response.content.find((c) => c.type === "text");
    if (!block || block.type !== "text") {
      logger.warn("call-qc: model returned no text block", { recordingId });
      return null;
    }

    const raw = block.text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.warn("call-qc: failed to parse model JSON", {
        recordingId,
        rawSample: raw.slice(0, 200),
      });
      await db
        .update(callRecordings)
        .set({ status: "error", updatedAt: new Date() })
        .where(eq(callRecordings.id, recordingId));
      return null;
    }

    const p = parsed as Record<string, unknown>;
    const subs = (p.scores ?? {}) as Record<string, unknown>;

    const payload: CallQcPayload = {
      overallScore: clampScore(p.overallScore),
      scores: {
        quality: clampScore(subs.quality),
        compliance: clampScore(subs.compliance),
        empathy: clampScore(subs.empathy),
        professionalism: clampScore(subs.professionalism),
      },
      highlights: coerceHighlights(p.highlights),
      flags: coerceFlags(p.flags),
      summary: typeof p.summary === "string" ? p.summary.slice(0, 2000) : "",
    };

    await db.insert(callQcReviews).values({
      callRecordingId: recordingId,
      overallScore: payload.overallScore,
      scores: payload.scores,
      highlights: payload.highlights,
      flags: payload.flags,
      summary: payload.summary,
      model: MODEL,
    });

    const hasCritical = payload.flags.some((f) => f.severity === "critical");
    await db
      .update(callRecordings)
      .set({
        status: hasCritical ? "flagged" : "reviewed",
        updatedAt: new Date(),
      })
      .where(eq(callRecordings.id, recordingId));

    logger.info("call-qc: review persisted", {
      recordingId,
      overallScore: payload.overallScore,
      flagged: hasCritical,
    });

    return payload;
  } catch (err) {
    logger.error("call-qc: review failed", {
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
    return null;
  }
}

export function enqueueCallQcReview(input: { recordingId: string }): void {
  logger.info("call-qc: enqueued", { recordingId: input.recordingId });
  after(async () => {
    try {
      await reviewCallTranscript(input.recordingId);
    } catch (err) {
      logger.error("call-qc: enqueued review threw", {
        recordingId: input.recordingId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
