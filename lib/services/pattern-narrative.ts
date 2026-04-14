import "server-only";
import { askClaude } from "@/lib/ai/client";
import { logger } from "@/lib/logger/server";
import type { Classification } from "@/lib/services/pattern-analysis";

/**
 * RP-3 — pattern narrative generator.
 *
 * Takes a Classification produced by classifyProblem() and asks Claude
 * to write a single plain-English sentence explaining the verdict for
 * a non-analyst dashboard reader. The narrative is a sibling to the
 * classification badge — humans see "Process problem" plus a short
 * sentence telling them what that actually means for this team and
 * metric.
 *
 * Cached in-memory because dashboards re-render frequently and the
 * underlying classification rarely changes between requests. Cache key
 * is `${role}:${metricKey}:${kind}` so a flip from "process" to
 * "people" forces a regeneration.
 */

type PatternNarrativeInput = {
  role: string;
  metricKey: string;
  metricLabel: string;
  classification: Classification;
  /** Optional extra stats the prompt can mention (target, current avg). */
  stats?: {
    target?: number;
    currentAverage?: number;
  };
};

const cache = new Map<string, { narrative: string; expiresAt: number }>();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

function cacheKey(input: PatternNarrativeInput): string {
  return `${input.role}:${input.metricKey}:${input.classification.kind}`;
}

function fallbackNarrative(input: PatternNarrativeInput): string {
  const { metricLabel, classification } = input;
  if (classification.kind === "process") {
    return `Most of the ${input.role.replace(/_/g, " ")} team is missing the target on ${metricLabel} — this looks like a workflow issue, not an individual one.`;
  }
  if (classification.kind === "people") {
    return `Only a small group of ${input.role.replace(/_/g, " ")} are below target on ${metricLabel} — coaching the named outliers is likely enough.`;
  }
  return `Results for ${metricLabel} on the ${input.role.replace(/_/g, " ")} team are mixed — needs human review before acting.`;
}

export async function generatePatternNarrative(
  input: PatternNarrativeInput,
): Promise<string> {
  const key = cacheKey(input);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.narrative;
  }

  const { role, metricLabel, classification, stats } = input;
  const friendlyRole = role.replace(/_/g, " ");

  const statsLine =
    stats && (stats.target !== undefined || stats.currentAverage !== undefined)
      ? `Target: ${stats.target ?? "—"}. Team average: ${stats.currentAverage ?? "—"}.`
      : "";

  const prompt = `You are writing a one-sentence summary for a management dashboard. The metric "${metricLabel}" for role "${friendlyRole}" is classified as a ${classification.kind} problem: ${classification.reason}. ${statsLine}

Write a single sentence (max 28 words) explaining what this means to a non-analyst reader. Specific. No jargon. No statistics unless they're already in the reason. Do not start with "This means" or "In other words". Just the sentence — no preamble, no quotes.`;

  try {
    const text = await askClaude(prompt);
    const cleaned = text
      .trim()
      .replace(/^["']|["']$/g, "")
      .split("\n")[0]
      .trim();

    // If askClaude bailed out (no API key) or returned an error sentinel,
    // fall back to a deterministic local string.
    const looksLikeError =
      cleaned.length === 0 ||
      cleaned.toLowerCase().startsWith("ai features are not configured") ||
      cleaned.toLowerCase().startsWith("ai request failed");

    const narrative = looksLikeError ? fallbackNarrative(input) : cleaned;

    cache.set(key, { narrative, expiresAt: Date.now() + TTL_MS });
    return narrative;
  } catch (err) {
    logger.error("generatePatternNarrative failed", {
      role,
      metricKey: input.metricKey,
      error: err instanceof Error ? err.message : String(err),
    });
    const narrative = fallbackNarrative(input);
    cache.set(key, { narrative, expiresAt: Date.now() + TTL_MS });
    return narrative;
  }
}
