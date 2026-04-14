/**
 * Bulk-import pre-generated changelog summaries from a JSON file into the
 * changelog_summaries table. Used to seed the table with explanations
 * authored by Claude Code (via the dev assistant) instead of paying for
 * Anthropic API calls.
 *
 * Usage:
 *   pnpm tsx scripts/seed-changelog-summaries.ts seed-data/changelog/batch-01.json
 *
 * Input JSON shape — array of:
 *   {
 *     "sha": "f582cff...",            // full SHA, required
 *     "summary": "...",               // 1-sentence overview
 *     "details": "...",               // 2-4 paragraphs (markdown allowed)
 *     "userImpact": "...",            // 1-2 sentences for end users
 *     "riskNotes": "" | "...",        // empty string for no risks
 *     "bullets": ["...", "...", ...]  // 2-5 short strings
 *   }
 *
 * Git metadata (subject, author, committed_at, type) is read from `git show`
 * locally — the JSON only needs the SHA + AI-authored fields. File stats
 * are computed via `git show --numstat`.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
// Dynamic-imported below so dotenv lands before db client init
type DbModule = typeof import("../db/drizzle");
type SchemaModule = typeof import("../db/schema/changelog-summaries");
let db: DbModule["db"];
let changelogSummaries: SchemaModule["changelogSummaries"];

const MODEL_TAG = "claude-code-opus-4.6";
const PROMPT_VERSION = "claude-code-v1";

interface SeedRecord {
  sha: string;
  summary: string;
  details: string;
  userImpact: string;
  riskNotes: string;
  bullets: string[];
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf-8" }).trim();
}

function parseCommitType(subject: string): string {
  const match = subject.match(
    /^(feat|fix|chore|docs|refactor|test|ci|style|perf)(\(.+?\))?:/,
  );
  return match ? match[1] : "other";
}

function stripPrefix(subject: string): string {
  return subject.replace(
    /^(feat|fix|chore|docs|refactor|test|ci|style|perf)(\(.+?\))?:\s*/,
    "",
  );
}

function parsePr(subject: string): number | null {
  const m = subject.match(/\(#(\d+)\)/);
  return m ? Number(m[1]) : null;
}

interface GitMeta {
  subject: string;
  type: string;
  author: string;
  committedAt: Date;
  prNumber: number | null;
  filesChanged: Array<{
    path: string;
    status: string;
    additions: number;
    deletions: number;
  }>;
  additions: number;
  deletions: number;
}

function readGitMeta(sha: string): GitMeta {
  // Subject + author + ISO date in one call
  const meta = git([
    "show",
    "--no-patch",
    "--format=%s%n%an%n%aI",
    sha,
  ]).split("\n");
  const subject = meta[0];
  const author = meta[1];
  const committedAt = new Date(meta[2]);

  // Numstat: "additions\tdeletions\tpath" per file (binary files show as -\t-)
  const numstatRaw = git(["show", "--numstat", "--format=", sha]);
  const filesChanged: GitMeta["filesChanged"] = [];
  let additions = 0;
  let deletions = 0;
  for (const line of numstatRaw.split("\n")) {
    if (!line.trim()) continue;
    const [a, d, ...rest] = line.split("\t");
    const path = rest.join("\t");
    const aNum = a === "-" ? 0 : Number(a);
    const dNum = d === "-" ? 0 : Number(d);
    additions += aNum;
    deletions += dNum;
    filesChanged.push({
      path,
      status: "modified",
      additions: aNum,
      deletions: dNum,
    });
  }

  return {
    subject: stripPrefix(subject),
    type: parseCommitType(subject),
    author,
    committedAt,
    prNumber: parsePr(subject),
    filesChanged,
    additions,
    deletions,
  };
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: tsx scripts/seed-changelog-summaries.ts <json-file>");
    process.exit(1);
  }

  ({ db } = await import("../db/drizzle"));
  ({ changelogSummaries } = await import("../db/schema/changelog-summaries"));

  const records: SeedRecord[] = JSON.parse(readFileSync(file, "utf-8"));
  console.log(`Importing ${records.length} records from ${file}\n`);

  let inserted = 0;
  let updated = 0;
  let errored = 0;

  for (const [i, rec] of records.entries()) {
    const prefix = `[${i + 1}/${records.length}] ${rec.sha.slice(0, 7)}`;
    try {
      const meta = readGitMeta(rec.sha);
      const result = await db
        .insert(changelogSummaries)
        .values({
          sha: rec.sha,
          shortHash: rec.sha.substring(0, 7),
          subject: meta.subject,
          type: meta.type,
          author: meta.author,
          committedAt: meta.committedAt,
          summary: rec.summary,
          details: rec.details,
          userImpact: rec.userImpact,
          riskNotes: rec.riskNotes,
          bullets: rec.bullets,
          filesChanged: meta.filesChanged,
          additions: meta.additions,
          deletions: meta.deletions,
          prNumber: meta.prNumber,
          model: MODEL_TAG,
          promptVersion: PROMPT_VERSION,
          inputTokens: null,
          outputTokens: null,
          generatedAt: new Date(),
          status: "ready",
          errorMessage: null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: changelogSummaries.sha,
          set: {
            summary: rec.summary,
            details: rec.details,
            userImpact: rec.userImpact,
            riskNotes: rec.riskNotes,
            bullets: rec.bullets,
            filesChanged: meta.filesChanged,
            additions: meta.additions,
            deletions: meta.deletions,
            prNumber: meta.prNumber,
            model: MODEL_TAG,
            promptVersion: PROMPT_VERSION,
            generatedAt: new Date(),
            status: "ready",
            errorMessage: null,
            updatedAt: new Date(),
          },
        })
        .returning({ sha: changelogSummaries.sha });
      if (result[0]) {
        console.log(`${prefix} ✓ ${rec.summary.slice(0, 70)}`);
        inserted++;
      }
    } catch (err) {
      const cause = (err as { cause?: { code?: string; message?: string; detail?: string } }).cause;
      console.error(
        `${prefix} ✗ code=${cause?.code ?? "?"} detail=${cause?.detail ?? "?"} msg=${cause?.message?.slice(0, 200) ?? "?"}`,
      );
      errored++;
    }
  }

  console.log(
    `\nDone. Inserted/updated: ${inserted}, Updated: ${updated}, Errored: ${errored}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
