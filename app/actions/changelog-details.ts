"use server";

import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { changelogSummaries } from "@/db/schema/changelog-summaries";
import { logger } from "@/lib/logger/server";

const REPO = "chesnutcollective/favorble";
const MODEL = "claude-haiku-4-5-20251001";
const PROMPT_VERSION = "v1";

/* ─── Public types returned to the client ─── */

export interface CommitDetails {
  sha: string;
  status: "ready" | "pending" | "skipped" | "error";
  summary: string | null;
  details: string | null;
  userImpact: string | null;
  riskNotes: string | null;
  bullets: string[] | null;
  filesChanged:
    | Array<{
        path: string;
        status: string;
        additions: number;
        deletions: number;
      }>
    | null;
  additions: number | null;
  deletions: number | null;
  prNumber: number | null;
  errorMessage: string | null;
}

/* ─── GitHub fetch ─── */

interface GitHubCommitFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface GitHubCommitDetailResponse {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  files?: GitHubCommitFile[];
  stats?: { additions: number; deletions: number; total: number };
}

const NOISE_FILE_PATTERNS = [
  /^pnpm-lock\.yaml$/,
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^\.next\//,
  /\.snap$/,
  /^supabase\/migrations\/meta\//,
  /^tsconfig\.tsbuildinfo$/,
];

const SECRET_FILE_PATTERNS = [/^\.env/, /\.pem$/, /\.key$/];

function isNoise(path: string): boolean {
  return NOISE_FILE_PATTERNS.some((p) => p.test(path));
}

function isSecret(path: string): boolean {
  return SECRET_FILE_PATTERNS.some((p) => p.test(path));
}

async function fetchGitHubCommit(
  sha: string,
): Promise<GitHubCommitDetailResponse | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/commits/${sha}`,
    { headers },
  );
  if (!res.ok) {
    logger.warn("GitHub commit fetch failed", { sha, status: res.status });
    return null;
  }
  return (await res.json()) as GitHubCommitDetailResponse;
}

function truncatePatch(patch: string, maxLines = 200): string {
  const lines = patch.split("\n");
  if (lines.length <= maxLines) return patch;
  return (
    lines.slice(0, maxLines).join("\n") +
    `\n... (${lines.length - maxLines} more lines truncated)`
  );
}

function parsePrNumber(subject: string): number | null {
  const match = subject.match(/\(#(\d+)\)/);
  return match ? Number(match[1]) : null;
}

function parseCommitType(message: string): string {
  const match = message.match(
    /^(feat|fix|chore|docs|refactor|test|ci|style|perf)(\(.+?\))?:/,
  );
  return match ? match[1] : "other";
}

/* ─── Claude generation ─── */

const SYSTEM_PROMPT = `You write thorough, reader-friendly explanations of git commits for a product changelog. Your audience is law-firm staff (paralegals, attorneys, case managers) who use the product daily — most are not engineers.

For each commit, you receive: the commit message, the type prefix (feat/fix/chore/etc), the list of changed files with stats, and truncated patches for the most relevant files.

Return a JSON object via the record_changelog_entry tool with these fields:

- summary: ONE sentence (under 30 words) in plain language describing what changed. No jargon. Lead with the user-visible impact when there is one.
- details: 2–4 short paragraphs explaining what was done and why. Reference specific behavior changes, not implementation. Avoid file paths unless they help a non-engineer understand. Markdown allowed (lists, **bold**).
- userImpact: 1–2 sentences specifically answering "what does this change for me as a user?" If purely internal (refactor, build config, dependency bump), say "No user-visible change — internal improvement." and explain why it still matters (faster, safer, cleaner).
- riskNotes: Short notes about anything to watch for: new behavior to verify, deprecations, breaking changes, things that touch shared state. Empty string "" if none.
- bullets: 2–5 short bullet strings highlighting the concrete changes. Keep each under 15 words.

Tone: confident, specific, no hedging, no apology. Don't restate the commit subject verbatim — expand on it.

If the commit is pure noise (e.g. lockfile bump, formatter run, comment-only change with no behavior delta), still return the JSON but make summary honest ("Updated dependency lockfile" / "Reformatted code") and userImpact "No user-visible change — internal maintenance." Don't invent significance that isn't there.`;

const TOOL_DEFINITION = {
  name: "record_changelog_entry",
  description:
    "Record the structured changelog entry for the commit. Always call this exactly once.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" },
      details: { type: "string" },
      userImpact: { type: "string" },
      riskNotes: { type: "string" },
      bullets: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["summary", "details", "userImpact", "riskNotes", "bullets"],
  },
};

interface GeneratedEntry {
  summary: string;
  details: string;
  userImpact: string;
  riskNotes: string;
  bullets: string[];
}

interface GenerateResult {
  entry: GeneratedEntry;
  inputTokens: number;
  outputTokens: number;
}

let anthropicClient: Anthropic | null = null;

function getAnthropic(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

async function generateEntry(input: {
  subject: string;
  body: string | null;
  type: string;
  files: GitHubCommitFile[];
}): Promise<GenerateResult | null> {
  const client = getAnthropic();
  if (!client) {
    logger.warn("ANTHROPIC_API_KEY not set — skipping changelog generation");
    return null;
  }

  const relevantFiles = input.files
    .filter((f) => !isNoise(f.filename) && !isSecret(f.filename))
    .slice(0, 25);

  const fileSection = relevantFiles
    .map((f) => {
      const head = `--- ${f.filename} (${f.status}, +${f.additions} -${f.deletions})`;
      if (!f.patch) return head;
      return `${head}\n${truncatePatch(f.patch)}`;
    })
    .join("\n\n");

  const allFilesSummary = input.files
    .map((f) => `${f.filename} (+${f.additions} -${f.deletions})`)
    .join("\n");

  const userMessage = `Commit type: ${input.type}
Subject: ${input.subject}
${input.body ? `\nFull message body:\n${input.body}\n` : ""}
All changed files (${input.files.length} total):
${allFilesSummary}

Selected diffs:
${fileSection || "(no significant non-noise files)"}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    tools: [TOOL_DEFINITION],
    tool_choice: { type: "tool", name: TOOL_DEFINITION.name },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    logger.warn("Claude returned no tool_use block", { sha: input.subject });
    return null;
  }

  return {
    entry: toolUse.input as GeneratedEntry,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/* ─── Persistence helpers ─── */

function rowToDetails(
  row: typeof changelogSummaries.$inferSelect,
): CommitDetails {
  return {
    sha: row.sha,
    status: row.status as CommitDetails["status"],
    summary: row.summary,
    details: row.details,
    userImpact: row.userImpact,
    riskNotes: row.riskNotes,
    bullets: row.bullets,
    filesChanged: row.filesChanged,
    additions: row.additions,
    deletions: row.deletions,
    prNumber: row.prNumber,
    errorMessage: row.errorMessage,
  };
}

/* ─── Public entry points ─── */

/**
 * Get the detailed AI-generated changelog entry for a commit. On miss,
 * fetches the diff from GitHub, asks Claude to write a thorough explanation,
 * and persists it. SHAs are immutable so the row never needs invalidation.
 */
export async function getCommitDetails(
  sha: string,
): Promise<CommitDetails | null> {
  const existing = await db
    .select()
    .from(changelogSummaries)
    .where(eq(changelogSummaries.sha, sha))
    .limit(1);

  if (existing[0] && existing[0].status === "ready") {
    return rowToDetails(existing[0]);
  }

  return generateAndStore(sha);
}

/**
 * Force-generate (or re-generate) a commit summary. Used by the backfill
 * script and the cron route. Safe to call on existing rows.
 */
export async function generateAndStore(
  sha: string,
): Promise<CommitDetails | null> {
  const ghCommit = await fetchGitHubCommit(sha);
  if (!ghCommit) {
    return persistError(sha, "GitHub commit not found");
  }

  const fullMessage = ghCommit.commit.message;
  const [firstLine, ...bodyLines] = fullMessage.split("\n");
  const body = bodyLines.filter((l) => l.trim()).join("\n") || null;
  const subject = firstLine.replace(
    /^(feat|fix|chore|docs|refactor|test|ci|style|perf)(\(.+?\))?:\s*/,
    "",
  );
  const type = parseCommitType(firstLine);
  const files = ghCommit.files ?? [];
  const filesChanged = files.map((f) => ({
    path: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
  }));
  const additions = ghCommit.stats?.additions ?? 0;
  const deletions = ghCommit.stats?.deletions ?? 0;
  const prNumber = parsePrNumber(firstLine);

  let entry: GeneratedEntry | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  try {
    const result = await generateEntry({ subject, body, type, files });
    if (result) {
      entry = result.entry;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
    }
  } catch (err) {
    logger.error("Claude generation failed for commit", { sha, error: err });
    return persistError(
      sha,
      err instanceof Error ? err.message : "Generation failed",
    );
  }

  const status: CommitDetails["status"] = entry ? "ready" : "skipped";

  const inserted = await db
    .insert(changelogSummaries)
    .values({
      sha: ghCommit.sha,
      shortHash: ghCommit.sha.substring(0, 7),
      subject,
      type,
      author: ghCommit.commit.author.name,
      committedAt: new Date(ghCommit.commit.author.date),
      summary: entry?.summary ?? null,
      details: entry?.details ?? null,
      userImpact: entry?.userImpact ?? null,
      riskNotes: entry?.riskNotes ?? null,
      bullets: entry?.bullets ?? null,
      filesChanged,
      additions,
      deletions,
      prNumber,
      model: entry ? MODEL : null,
      promptVersion: entry ? PROMPT_VERSION : null,
      inputTokens,
      outputTokens,
      generatedAt: entry ? new Date() : null,
      status,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: changelogSummaries.sha,
      set: {
        summary: entry?.summary ?? null,
        details: entry?.details ?? null,
        userImpact: entry?.userImpact ?? null,
        riskNotes: entry?.riskNotes ?? null,
        bullets: entry?.bullets ?? null,
        filesChanged,
        additions,
        deletions,
        prNumber,
        model: entry ? MODEL : null,
        promptVersion: entry ? PROMPT_VERSION : null,
        inputTokens,
        outputTokens,
        generatedAt: entry ? new Date() : null,
        status,
        errorMessage: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return inserted[0] ? rowToDetails(inserted[0]) : null;
}

async function persistError(
  sha: string,
  message: string,
): Promise<CommitDetails | null> {
  const ghCommit = await fetchGitHubCommit(sha).catch(() => null);
  const subject = ghCommit?.commit.message.split("\n")[0] ?? sha;
  const author = ghCommit?.commit.author.name ?? "unknown";
  const committedAt = ghCommit?.commit.author.date
    ? new Date(ghCommit.commit.author.date)
    : new Date();

  const inserted = await db
    .insert(changelogSummaries)
    .values({
      sha,
      shortHash: sha.substring(0, 7),
      subject,
      type: parseCommitType(subject),
      author,
      committedAt,
      status: "error",
      errorMessage: message,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: changelogSummaries.sha,
      set: {
        status: "error",
        errorMessage: message,
        updatedAt: new Date(),
      },
    })
    .returning();

  return inserted[0] ? rowToDetails(inserted[0]) : null;
}
