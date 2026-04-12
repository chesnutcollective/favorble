"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireSession } from "@/lib/auth/session";
import {
  buildCaseContext,
  formatCaseContextForPrompt,
} from "@/lib/services/case-context";
import { logger } from "@/lib/logger/server";

/**
 * QA-2 — Pre-send inline QA preview.
 *
 * Runs the same Claude QA prompt as `reviewOutboundMessage` but returns
 * the result synchronously to the caller instead of writing to the DB.
 * This lets the message thread UI show a pass/fail + score BEFORE the
 * message is actually sent.
 *
 * The post-send async QA (`enqueueOutboundMessageReview`) still runs
 * for permanent record-keeping.
 */

export type QaPreviewResult = {
  passed: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
};

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

let anthropicClient: Anthropic | null = null;
function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

/**
 * Pre-flight QA check for an outbound message. Returns the QA result
 * synchronously so the UI can display it before the user confirms send.
 * Does NOT write to the communications table.
 */
export async function previewOutboundQa(
  caseId: string,
  messageText: string,
): Promise<
  { ok: true; result: QaPreviewResult } | { ok: false; error: string }
> {
  await requireSession();

  const client = getClient();
  if (!client) {
    // If no API key, auto-pass so the send flow isn't blocked
    return {
      ok: true,
      result: { passed: true, score: 100, issues: [], suggestions: [] },
    };
  }

  const trimmed = messageText.trim();
  if (!trimmed) {
    return { ok: false, error: "Message is empty" };
  }

  try {
    let contextBlock = "(no case context available)";
    const ctx = await buildCaseContext(caseId, {
      communicationsLimit: 10,
      chronologyLimit: 8,
      documentsLimit: 8,
    });
    if (ctx) {
      contextBlock = formatCaseContextForPrompt(ctx, { maxBodyChars: 400 });
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${contextBlock}\n\n# Outbound message under review\n\n${trimmed.slice(0, 8000)}\n\nReturn JSON only.`,
        },
      ],
    });

    const block = response.content.find((c) => c.type === "text");
    if (!block || block.type !== "text") {
      return { ok: false, error: "QA model returned no text" };
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
      return { ok: false, error: "Failed to parse QA response" };
    }

    const p = parsed as Record<string, unknown>;
    const score = clampScore(p.score);
    const passed = typeof p.passed === "boolean" ? p.passed : null;
    const issues = coerceArray(p.issues);
    const suggestions = coerceArray(p.suggestions);

    if (score === null || passed === null) {
      return { ok: false, error: "Invalid QA response shape" };
    }

    return {
      ok: true,
      result: { passed, score, issues, suggestions },
    };
  } catch (err) {
    logger.error("previewOutboundQa failed", {
      caseId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      error: "QA review failed — you can still send the message",
    };
  }
}
