import "server-only";
import { askClaude } from "@/lib/ai/client";
import { logger } from "@/lib/logger/server";
import {
  buildCaseContext,
  formatCaseContextForPrompt,
} from "@/lib/services/case-context";

/**
 * SM-3 — per-case next-action suggestion for stagnant SSD cases.
 *
 * Called from the stagnant-scan cron for every case that has gone
 * silent. Pulls the standard buildCaseContext bundle and asks Claude
 * for ONE concrete next action including a person (by role), an
 * action, and a timeframe. Always returns a string — falls back to a
 * generic "review with case manager" line on any failure so the cron
 * can keep moving.
 */

const FALLBACK = "Review case with case manager and assign next action.";

export async function suggestStagnantCaseNextAction(input: {
  caseId: string;
  daysStagnant: number;
}): Promise<string> {
  const { caseId, daysStagnant } = input;

  let contextBlob = "";
  try {
    const ctx = await buildCaseContext(caseId, {
      communicationsLimit: 10,
      chronologyLimit: 5,
      documentsLimit: 5,
      stageHistoryLimit: 5,
    });
    if (!ctx) {
      logger.warn("stagnant-suggestions: no case context", { caseId });
      return FALLBACK;
    }
    contextBlob = formatCaseContextForPrompt(ctx, { maxBodyChars: 300 });
  } catch (err) {
    logger.error("stagnant-suggestions: buildCaseContext failed", {
      caseId,
      error: err instanceof Error ? err.message : String(err),
    });
    return FALLBACK;
  }

  const prompt = `You are a legal operations assistant. This SSD case has been stagnant for ${daysStagnant} days. Based on the case context below, recommend ONE specific next action for the responsible team member. Be concrete. Include a person (by role), an action, and a timeframe. 2 sentences max. No preamble — just the recommendation.

${contextBlob}`;

  try {
    const text = await askClaude(prompt);
    const cleaned = text.trim().replace(/^["']|["']$/g, "");
    if (
      cleaned.length === 0 ||
      cleaned.toLowerCase().startsWith("ai features are not configured") ||
      cleaned.toLowerCase().startsWith("ai request failed")
    ) {
      return FALLBACK;
    }
    // Hard cap in case Claude ignores the 2-sentence rule.
    return cleaned.length > 400 ? `${cleaned.slice(0, 397)}...` : cleaned;
  } catch (err) {
    logger.error("stagnant-suggestions: askClaude failed", {
      caseId,
      error: err instanceof Error ? err.message : String(err),
    });
    return FALLBACK;
  }
}
