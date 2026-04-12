import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { db } from "@/db/drizzle";
import { communications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

/**
 * QA-3 — Sentiment analysis on inbound client communications.
 *
 * Fetches a communications row, runs the body through Claude with a
 * sentiment-tuned prompt, then writes the score/label/reasoning back
 * onto the same row. Kicks off from the case-status webhook after
 * `message.received` events via `enqueueCommunicationAnalysis`.
 *
 * The analyzer is defensive:
 *   - Missing API key → no-op (we still want the pipeline to run in dev)
 *   - Malformed JSON from the model → no-op, leaves columns null
 *   - Network / DB failures → logged, never rethrown (never block the
 *     upstream webhook/action)
 */

type SentimentLabel =
  | "positive"
  | "neutral"
  | "confused"
  | "frustrated"
  | "angry"
  | "churn_risk";

export type SentimentResult = {
  score: number;
  label: SentimentLabel;
  reasoning: string;
};

const ALLOWED_LABELS: SentimentLabel[] = [
  "positive",
  "neutral",
  "confused",
  "frustrated",
  "angry",
  "churn_risk",
];

let anthropicClient: Anthropic | null = null;
function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

const SYSTEM_PROMPT = `You are a sentiment analyst for a Social Security Disability law firm's client-communications inbox.
Your job is to classify how the claimant is feeling in a single inbound message so the supervisor can flag at-risk cases.

Return JSON only, no prose. Schema:
{
  "score": number between -1 and 1 (negative = unhappy, positive = happy),
  "label": one of "positive" | "neutral" | "confused" | "frustrated" | "angry" | "churn_risk",
  "reasoning": one sentence explaining the score/label
}

Label guidelines:
- "positive" — gratitude, excitement, clear forward-motion
- "neutral" — straightforward status update or administrative question
- "confused" — asking what's going on, lost in the process, needs clarity
- "frustrated" — impatient, repeating themselves, annoyed but still engaged
- "angry" — hostile tone, threats, profanity, direct complaints about the firm
- "churn_risk" — talking about hiring a different firm, withdrawing, giving up`;

function clampScore(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (value < -1) return -1;
  if (value > 1) return 1;
  return Math.round(value * 1000) / 1000;
}

function coerceLabel(value: unknown): SentimentLabel | null {
  if (typeof value !== "string") return null;
  return ALLOWED_LABELS.includes(value as SentimentLabel)
    ? (value as SentimentLabel)
    : null;
}

/**
 * Run sentiment analysis on a single communications row. Updates the row
 * in place. Returns the parsed result or null on any failure.
 */
export async function analyzeCommunicationSentiment(
  communicationId: string,
): Promise<SentimentResult | null> {
  const client = getClient();
  if (!client) {
    logger.info("sentiment: skipping (ANTHROPIC_API_KEY not set)", {
      communicationId,
    });
    return null;
  }

  try {
    const [row] = await db
      .select({
        id: communications.id,
        body: communications.body,
        subject: communications.subject,
        direction: communications.direction,
        type: communications.type,
      })
      .from(communications)
      .where(eq(communications.id, communicationId))
      .limit(1);

    if (!row) {
      logger.warn("sentiment: communication not found", { communicationId });
      return null;
    }

    const text = [row.subject, row.body].filter(Boolean).join("\n\n").trim();
    if (!text) {
      logger.info("sentiment: empty body — skipping", { communicationId });
      return null;
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Message from claimant:\n\n${text.slice(0, 6000)}`,
        },
      ],
    });

    const block = response.content.find((c) => c.type === "text");
    if (!block || block.type !== "text") {
      logger.warn("sentiment: model returned no text block", {
        communicationId,
      });
      return null;
    }

    // Strip ```json fences if the model got cute.
    const raw = block.text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.warn("sentiment: failed to parse model JSON", {
        communicationId,
        rawSample: raw.slice(0, 200),
      });
      return null;
    }

    const p = parsed as Record<string, unknown>;
    const score = clampScore(p.score);
    const label = coerceLabel(p.label);
    const reasoning =
      typeof p.reasoning === "string" ? p.reasoning.slice(0, 500) : null;

    if (score === null || label === null) {
      logger.warn("sentiment: invalid shape from model", {
        communicationId,
        parsed,
      });
      return null;
    }

    await db
      .update(communications)
      .set({
        sentimentScore: score.toFixed(3),
        sentimentLabel: label,
        sentimentAnalyzedAt: new Date(),
      })
      .where(eq(communications.id, communicationId));

    logger.info("sentiment: analyzed", {
      communicationId,
      label,
      score,
    });

    return { score, label, reasoning: reasoning ?? "" };
  } catch (err) {
    logger.error("sentiment: analysis failed", {
      communicationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Schedule sentiment analysis after the current request has flushed a
 * response. Safe to call from webhooks / server actions — uses Next.js
 * `after()` so the Lambda stays alive through the analysis without
 * blocking the caller.
 */
export function enqueueCommunicationAnalysis(input: {
  communicationId: string;
}): void {
  logger.info("sentiment: enqueued", {
    communicationId: input.communicationId,
  });

  after(async () => {
    try {
      await analyzeCommunicationSentiment(input.communicationId);
    } catch (err) {
      logger.error("sentiment: enqueued analysis threw", {
        communicationId: input.communicationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
