import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { changelogSummaries } from "@/db/schema/changelog-summaries";
import { getChangelogCommits } from "@/app/actions/changelog";
import { generateAndStore } from "@/app/actions/changelog-details";
import { logger } from "@/lib/logger/server";

/**
 * Nightly safety net for changelog summary generation. Looks at the most
 * recent commits and generates summaries for any that don't have a
 * 'ready' row yet. The expected primary path is on-demand generation
 * when a user expands an accordion, but this catches anything missed.
 *
 * Scheduled via vercel.json — once daily.
 */

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${secret}`;
}

const MAX_PER_RUN = 25;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    logger.error("Cron changelog-backfill unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("Cron changelog-backfill started");

  const { commits } = await getChangelogCommits(1, 100);

  let generated = 0;
  let skipped = 0;
  let errored = 0;

  for (const commit of commits) {
    if (generated + errored >= MAX_PER_RUN) break;

    const existing = await db
      .select({ status: changelogSummaries.status })
      .from(changelogSummaries)
      .where(eq(changelogSummaries.sha, commit.hash))
      .limit(1);

    if (existing[0]?.status === "ready") {
      skipped++;
      continue;
    }

    try {
      const result = await generateAndStore(commit.hash);
      if (result?.status === "ready") generated++;
      else if (result?.status === "skipped") skipped++;
      else errored++;
    } catch (err) {
      logger.error("Backfill commit failed", { sha: commit.hash, error: err });
      errored++;
    }
  }

  const result = {
    success: true,
    inspected: commits.length,
    generated,
    skipped,
    errored,
  };
  logger.info("Cron changelog-backfill complete", result);
  return NextResponse.json(result);
}
