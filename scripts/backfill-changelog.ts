/**
 * One-time historical backfill of AI-generated changelog summaries.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-changelog.ts                 # backfill 200 most recent commits
 *   pnpm tsx scripts/backfill-changelog.ts --limit 50      # cap commits processed
 *   pnpm tsx scripts/backfill-changelog.ts --force         # regenerate even rows already 'ready'
 *
 * Skips commits already in the changelog_summaries table with status='ready'
 * unless --force is passed. Idempotent — safe to re-run.
 *
 * Requires DATABASE_URL, ANTHROPIC_API_KEY, and (optionally) GITHUB_TOKEN
 * in .env.local — load with `pnpm dotenv -e .env.local -- pnpm tsx ...` if
 * your shell doesn't auto-load them.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "../db/drizzle";
import { changelogSummaries } from "../db/schema/changelog-summaries";
import { generateAndStore } from "../app/actions/changelog-details";
import { getChangelogCommits } from "../app/actions/changelog";

interface CliArgs {
  limit: number;
  force: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let limit = 200;
  let force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = Number(args[i + 1]);
      i++;
    } else if (args[i] === "--force") {
      force = true;
    }
  }
  return { limit, force };
}

async function main() {
  const { limit, force } = parseArgs();
  console.log(
    `Backfill starting — limit=${limit}, force=${force ? "yes" : "no"}\n`,
  );

  // Fetch the most recent N commits via the existing GitHub-backed action.
  // pageSize cap is 100 per GitHub call.
  const perPage = 100;
  const pages = Math.ceil(limit / perPage);
  const commits: { hash: string; subject: string }[] = [];
  for (let page = 1; page <= pages; page++) {
    const { commits: batch } = await getChangelogCommits(page, perPage);
    if (batch.length === 0) break;
    for (const c of batch) commits.push({ hash: c.hash, subject: c.subject });
    if (batch.length < perPage) break;
  }
  const targets = commits.slice(0, limit);
  console.log(`Found ${targets.length} commits to consider\n`);

  let generated = 0;
  let skipped = 0;
  let errored = 0;

  for (const [i, c] of targets.entries()) {
    const prefix = `[${i + 1}/${targets.length}] ${c.hash.slice(0, 7)}`;

    if (!force) {
      const existing = await db
        .select({ status: changelogSummaries.status })
        .from(changelogSummaries)
        .where(eq(changelogSummaries.sha, c.hash))
        .limit(1);
      if (existing[0]?.status === "ready") {
        console.log(`${prefix} ↺ already ready, skipping`);
        skipped++;
        continue;
      }
    }

    try {
      const result = await generateAndStore(c.hash);
      if (result?.status === "ready") {
        console.log(`${prefix} ✓ ${result.summary?.slice(0, 80) ?? ""}`);
        generated++;
      } else if (result?.status === "skipped") {
        console.log(`${prefix} ⊘ skipped (no API key?)`);
        skipped++;
      } else {
        console.log(`${prefix} ✗ ${result?.errorMessage ?? "unknown error"}`);
        errored++;
      }
    } catch (err) {
      console.error(
        `${prefix} ✗ ${err instanceof Error ? err.message : String(err)}`,
      );
      errored++;
    }
  }

  console.log(
    `\nDone. Generated: ${generated}, Skipped: ${skipped}, Errored: ${errored}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
