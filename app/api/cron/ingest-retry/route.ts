import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { documents } from "@/db/schema";
import { and, or, sql, isNull, gte, lt } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import { ingestDocumentFromUrl } from "@/lib/services/document-ingest";
import {
  isExtractableDocument,
  pickExtractionTypeFromFileName,
} from "@/lib/services/extraction-type";
import { processDocument } from "@/lib/services/document-processor";

/**
 * Cron endpoint that re-ingests webhook documents whose original
 * after() callback failed (network blip, transient 5xx, Vercel instance
 * recycled mid-flight, etc.).
 *
 * A document qualifies for retry when:
 * - source IN ("ere", "chronicle", "case_status") — only webhook-ingested sources
 * - storage_path is still an http(s) URL or a pending/ placeholder
 *   (anything already at railway:// was successfully ingested)
 * - created_at is between 5 minutes and 7 days ago — give the original
 *   after() callback a chance to finish before retrying, and stop
 *   hammering dead URLs after a week
 * - deleted_at IS NULL
 *
 * A row is retryable only if we can find a candidate source URL:
 * - storage_path itself if it's http(s)://
 * - else metadata.downloadUrl (stored by the webhook handlers)
 *
 * Idempotent by construction: `ingestDocumentFromUrl` uses a
 * deterministic bucket key derived from the document id, so re-running
 * the same retry overwrites the existing blob.
 *
 * Scheduled via vercel.json → cron runs every 15 minutes.
 * Authenticated via the `CRON_SECRET` env var compared against the
 * Authorization header (Vercel Cron's native pattern).
 */

const MAX_DOCS_PER_RUN = 50;
const RETRY_DELAY_MINUTES = 5;
const RETRY_GIVEUP_DAYS = 7;

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured — allow in dev, reject in prod
    return process.env.NODE_ENV !== "production";
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${secret}`;
}

type RetryableRow = {
  id: string;
  organizationId: string;
  caseId: string | null;
  fileName: string;
  fileType: string | null;
  storagePath: string;
  metadata: unknown;
  source: string;
};

function extractSourceUrl(row: RetryableRow): string | null {
  if (
    row.storagePath.startsWith("http://") ||
    row.storagePath.startsWith("https://")
  ) {
    return row.storagePath;
  }
  // Webhook handlers stash the original downloadUrl in metadata so we
  // can recover it when storage_path is a pending/ placeholder.
  if (
    row.metadata &&
    typeof row.metadata === "object" &&
    "downloadUrl" in row.metadata
  ) {
    const url = (row.metadata as { downloadUrl?: unknown }).downloadUrl;
    if (typeof url === "string" && url.length > 0) return url;
  }
  return null;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    logger.error("Cron ingest-retry unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const retryAfter = new Date(now.getTime() - RETRY_DELAY_MINUTES * 60_000);
  const giveUpBefore = new Date(
    now.getTime() - RETRY_GIVEUP_DAYS * 24 * 60 * 60_000,
  );

  let candidates: RetryableRow[] = [];
  try {
    candidates = await db
      .select({
        id: documents.id,
        organizationId: documents.organizationId,
        caseId: documents.caseId,
        fileName: documents.fileName,
        fileType: documents.fileType,
        storagePath: documents.storagePath,
        metadata: documents.metadata,
        source: documents.source,
      })
      .from(documents)
      .where(
        and(
          isNull(documents.deletedAt),
          sql`${documents.source} IN ('ere', 'chronicle', 'case_status')`,
          or(
            sql`${documents.storagePath} LIKE 'http://%'`,
            sql`${documents.storagePath} LIKE 'https://%'`,
            sql`${documents.storagePath} LIKE 'pending/%'`,
          ),
          lt(documents.createdAt, retryAfter),
          gte(documents.createdAt, giveUpBefore),
        ),
      )
      .limit(MAX_DOCS_PER_RUN);
  } catch (err) {
    logger.error("Cron ingest-retry query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  logger.info("Cron ingest-retry sweep started", {
    candidateCount: candidates.length,
    retryAfter: retryAfter.toISOString(),
    giveUpBefore: giveUpBefore.toISOString(),
  });

  let swept = 0;
  let ingested = 0;
  let ingestFailed = 0;
  let extracted = 0;
  let extractFailed = 0;
  let skipped = 0;

  for (const row of candidates) {
    swept++;

    const sourceUrl = extractSourceUrl(row);
    if (!sourceUrl) {
      logger.info("Cron ingest-retry skipped (no source URL)", {
        documentId: row.id,
        storagePath: row.storagePath,
      });
      skipped++;
      continue;
    }

    if (!row.caseId) {
      logger.info("Cron ingest-retry skipped (no caseId)", {
        documentId: row.id,
      });
      skipped++;
      continue;
    }

    // 1. Re-ingest
    try {
      const result = await ingestDocumentFromUrl({
        documentId: row.id,
        organizationId: row.organizationId,
        caseId: row.caseId,
        fileName: row.fileName,
        contentType: row.fileType,
        sourceUrl,
        source: `cron_retry_${row.source}`,
      });
      if (!result.success) {
        ingestFailed++;
        continue;
      }
      ingested++;
    } catch (err) {
      logger.error("Cron ingest-retry ingest threw", {
        documentId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
      ingestFailed++;
      continue;
    }

    // 2. Re-run extraction (only if extractable)
    if (!isExtractableDocument(row.fileName, row.fileType)) {
      continue;
    }
    try {
      const extractionType = pickExtractionTypeFromFileName(row.fileName);
      const processResult = await processDocument({
        documentId: row.id,
        organizationId: row.organizationId,
        extractionType,
      });
      if (processResult.success) {
        extracted++;
      } else {
        extractFailed++;
        logger.warn("Cron ingest-retry extraction failed", {
          documentId: row.id,
          error: processResult.error,
        });
      }
    } catch (err) {
      extractFailed++;
      logger.error("Cron ingest-retry extraction threw", {
        documentId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const summary = {
    candidateCount: candidates.length,
    swept,
    ingested,
    ingestFailed,
    extracted,
    extractFailed,
    skipped,
  };
  logger.info("Cron ingest-retry sweep complete", summary);

  return NextResponse.json({
    success: true,
    ...summary,
  });
}
