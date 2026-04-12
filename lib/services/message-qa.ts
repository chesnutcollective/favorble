import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { db } from "@/db/drizzle";
import { communications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import {
  buildCaseContext,
  formatCaseContextForPrompt,
} from "@/lib/services/case-context";

/**
 * QA-2 — Outbound message quality review.
 *
 * Runs every outbound client communication through Claude with the full
 * case context for grounding. The reviewer returns a pass/fail
 * judgment, a 0-100 score, an issues array and a suggestions array.
 * Writes the score + notes back onto the communications row via
 * `qaStatus` / `qaScore` / `qaNotes` / `qaReviewedAt`.
 *
 * Never blocks the send path — `enqueueOutboundMessageReview` fires the
 * review from a `next/server` `after()` callback.
 */

export type MessageQaResult = {
  passed: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
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

const SYSTEM_PROMPT = `You are a quality reviewer for a Social Security Disability law firm's client-facing communications.
Given the case context and a staff member's outbound message, decide whether the message is ready to go out.

Check:
- Accuracy: does the message match the current case state and stage?
- Tone: professional, empathetic, jargon-free
- Compliance: no medical advice, no legal guarantees, no PHI leaks to unrelated parties, no unauthorized commitments
- Clarity: can a non-lawyer client act on it?
- Completeness: does it answer the client's question or drive the case forward?

Return JSON only. Schema:
{
  "passed": boolean,          // true only if the message is safe to send as-is
  "score": number 0-100,      // 100 = exemplary, 60 = needs minor edits, <50 = rewrite
  "issues": string[],         // concrete problems; empty array if none
  "suggestions": string[]     // specific improvements; empty array if none
}`;

function coerceArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").slice(0, 10);
}

function clampScore(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0) return 0;
  if (rounded > 100) return 100;
  return rounded;
}

/**
 * Review a single outbound communication. Outbound-only — silently
 * no-ops for inbound rows. Updates qaStatus/qaScore/qaNotes in place.
 */
export async function reviewOutboundMessage(input: {
  communicationId: string;
}): Promise<MessageQaResult | null> {
  const client = getClient();
  if (!client) {
    logger.info("message-qa: skipping (ANTHROPIC_API_KEY not set)", {
      communicationId: input.communicationId,
    });
    return null;
  }

  try {
    const [row] = await db
      .select({
        id: communications.id,
        caseId: communications.caseId,
        body: communications.body,
        subject: communications.subject,
        direction: communications.direction,
        type: communications.type,
      })
      .from(communications)
      .where(eq(communications.id, input.communicationId))
      .limit(1);

    if (!row) {
      logger.warn("message-qa: communication not found", {
        communicationId: input.communicationId,
      });
      return null;
    }

    // Outbound-only
    if (row.direction !== "outbound" && !row.type?.endsWith("_outbound")) {
      logger.info("message-qa: skipping non-outbound", {
        communicationId: input.communicationId,
        direction: row.direction,
        type: row.type,
      });
      return null;
    }

    const messageText = [row.subject, row.body].filter(Boolean).join("\n\n");
    if (!messageText.trim()) {
      logger.info("message-qa: empty message — skipping", {
        communicationId: input.communicationId,
      });
      return null;
    }

    // Grab case context if we know the case
    let contextBlock = "(no case context available)";
    if (row.caseId) {
      const ctx = await buildCaseContext(row.caseId, {
        communicationsLimit: 10,
        chronologyLimit: 8,
        documentsLimit: 8,
      });
      if (ctx) {
        contextBlock = formatCaseContextForPrompt(ctx, { maxBodyChars: 400 });
      }
    }

    await db
      .update(communications)
      .set({ qaStatus: "pending" })
      .where(eq(communications.id, input.communicationId));

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${contextBlock}\n\n# Outbound message under review\n\n${messageText.slice(0, 8000)}\n\nReturn JSON only.`,
        },
      ],
    });

    const block = response.content.find((c) => c.type === "text");
    if (!block || block.type !== "text") {
      logger.warn("message-qa: model returned no text block", {
        communicationId: input.communicationId,
      });
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
      logger.warn("message-qa: failed to parse model JSON", {
        communicationId: input.communicationId,
        rawSample: raw.slice(0, 200),
      });
      await db
        .update(communications)
        .set({
          qaStatus: "error",
          qaReviewedAt: new Date(),
        })
        .where(eq(communications.id, input.communicationId));
      return null;
    }

    const p = parsed as Record<string, unknown>;
    const score = clampScore(p.score);
    const passed = typeof p.passed === "boolean" ? p.passed : null;
    const issues = coerceArray(p.issues);
    const suggestions = coerceArray(p.suggestions);

    if (score === null || passed === null) {
      logger.warn("message-qa: invalid shape from model", {
        communicationId: input.communicationId,
        parsed,
      });
      await db
        .update(communications)
        .set({
          qaStatus: "error",
          qaReviewedAt: new Date(),
        })
        .where(eq(communications.id, input.communicationId));
      return null;
    }

    const qaStatus = passed ? "passed" : score < 40 ? "blocked" : "needs_edit";

    const notes = JSON.stringify({ issues, suggestions });

    await db
      .update(communications)
      .set({
        qaStatus,
        qaScore: score,
        qaNotes: notes,
        qaReviewedAt: new Date(),
      })
      .where(eq(communications.id, input.communicationId));

    logger.info("message-qa: reviewed", {
      communicationId: input.communicationId,
      passed,
      score,
      status: qaStatus,
    });

    return { passed, score, issues, suggestions };
  } catch (err) {
    logger.error("message-qa: review failed", {
      communicationId: input.communicationId,
      error: err instanceof Error ? err.message : String(err),
    });
    try {
      await db
        .update(communications)
        .set({
          qaStatus: "error",
          qaReviewedAt: new Date(),
        })
        .where(eq(communications.id, input.communicationId));
    } catch {
      // best-effort
    }
    return null;
  }
}

/**
 * Schedule an outbound QA review after the current request has
 * responded. Fire-and-forget — the send path never waits.
 */
export function enqueueOutboundMessageReview(input: {
  communicationId: string;
}): void {
  logger.info("message-qa: enqueued", {
    communicationId: input.communicationId,
  });

  after(async () => {
    try {
      await reviewOutboundMessage(input);
    } catch (err) {
      logger.error("message-qa: enqueued review threw", {
        communicationId: input.communicationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

/**
 * Parse the JSON payload we wrote to `qaNotes` back into an object.
 * Returns null on any parse error.
 */
export function parseQaNotes(
  notes: string | null,
): { issues: string[]; suggestions: string[] } | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    return {
      issues: coerceArray(parsed?.issues),
      suggestions: coerceArray(parsed?.suggestions),
    };
  } catch {
    return null;
  }
}
