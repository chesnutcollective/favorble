import "server-only";
import { after } from "next/server";
import { logger } from "@/lib/logger/server";
import { processDocument } from "@/lib/services/document-processor";
import { ingestDocumentFromUrl } from "@/lib/services/document-ingest";
import {
  isExtractableDocument,
  pickExtractionTypeFromFileName,
} from "@/lib/services/extraction-type";
import type { ExtractionType } from "@/lib/integrations/langextract";

export type EnqueueProcessingInput = {
  documentId: string;
  organizationId: string;
  fileName: string;
  fileType: string | null | undefined;
  /**
   * Override the auto-detected extraction type. If omitted, the type is
   * picked from the filename.
   */
  extractionType?: ExtractionType;
  /**
   * Optional context label for logs (e.g. "ere_webhook", "manual_upload",
   * "chronicle_webhook", "case_status_webhook"). Does not affect behavior.
   */
  source?: string;
};

/**
 * Enqueue a document for AI extraction after the current request finishes.
 *
 * Uses Next.js 16's `after()` to schedule work that runs inside the same
 * Lambda/worker execution but AFTER the HTTP response has been flushed to
 * the client. This is the correct way to do "fire-and-forget" in a
 * serverless environment — plain unawaited promises get killed when the
 * request handler returns and the Lambda freezes.
 *
 * Safe to call from route handlers and server actions. Silently skips
 * non-extractable file types (images, audio, video, binaries). Errors
 * are logged but not rethrown so a broken extraction never fails the
 * upstream mutation.
 *
 * Usage:
 *   const [doc] = await db.insert(documents).values({...}).returning();
 *   enqueueDocumentProcessing({
 *     documentId: doc.id,
 *     organizationId: doc.organizationId,
 *     fileName: doc.fileName,
 *     fileType: doc.fileType,
 *     source: "manual_upload",
 *   });
 */
export function enqueueDocumentProcessing(input: EnqueueProcessingInput): void {
  if (!isExtractableDocument(input.fileName, input.fileType)) {
    logger.info("Document skipped for extraction (not extractable)", {
      documentId: input.documentId,
      fileName: input.fileName,
      fileType: input.fileType,
      source: input.source,
    });
    return;
  }

  const extractionType =
    input.extractionType ?? pickExtractionTypeFromFileName(input.fileName);

  logger.info("Document enqueued for extraction", {
    documentId: input.documentId,
    fileName: input.fileName,
    extractionType,
    source: input.source,
  });

  after(async () => {
    try {
      const result = await processDocument({
        documentId: input.documentId,
        organizationId: input.organizationId,
        extractionType,
      });

      if (!result.success) {
        logger.error("Document extraction failed (async)", {
          documentId: input.documentId,
          fileName: input.fileName,
          source: input.source,
          error: result.error,
        });
        return;
      }

      logger.info("Document extraction completed (async)", {
        documentId: input.documentId,
        fileName: input.fileName,
        source: input.source,
        processingId: result.processingId,
      });
    } catch (err) {
      logger.error("Document extraction threw (async)", {
        documentId: input.documentId,
        fileName: input.fileName,
        source: input.source,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

export type EnqueueIngestInput = {
  documentId: string;
  organizationId: string;
  caseId: string;
  fileName: string;
  fileType: string | null | undefined;
  /**
   * External URL the source system gave us (e.g. a Chronicle/ERE
   * pre-signed URL). If null/undefined, ingest is skipped and only
   * extraction runs against whatever storage_path is already on the
   * row.
   */
  sourceUrl: string | null | undefined;
  extractionType?: ExtractionType;
  source?: string;
};

/**
 * Enqueue a webhook-ingested document for persistence + extraction.
 *
 * Unlike `enqueueDocumentProcessing`, which assumes the document is
 * already at a durable storage path, this helper is designed for
 * webhook events where the source system gives us a short-lived
 * pre-signed URL. After the HTTP response has flushed, the background
 * callback:
 *
 *   1. Fetches the bytes from `sourceUrl`
 *   2. Persists them to the Railway bucket at a deterministic key
 *   3. Updates the documents row's storage_path to the new railway:// path
 *   4. Runs the LangExtract pipeline against the now-durable location
 *
 * If ingest fails (expired URL, network issue, oversize doc), extraction
 * is still attempted against the pre-existing storage_path as a
 * best-effort fallback so the webhook gets *some* downstream work.
 *
 * Safe to call from route handlers and server actions. Non-extractable
 * file types (images, audio, video, binaries) skip both ingest and
 * extraction.
 */
export function enqueueIngestAndProcessing(input: EnqueueIngestInput): void {
  if (!isExtractableDocument(input.fileName, input.fileType)) {
    logger.info("Document skipped for ingest+extraction (not extractable)", {
      documentId: input.documentId,
      fileName: input.fileName,
      fileType: input.fileType,
      source: input.source,
    });
    return;
  }

  const extractionType =
    input.extractionType ?? pickExtractionTypeFromFileName(input.fileName);

  logger.info("Document enqueued for ingest+extraction", {
    documentId: input.documentId,
    fileName: input.fileName,
    extractionType,
    hasSourceUrl: !!input.sourceUrl,
    source: input.source,
  });

  after(async () => {
    // 1. Ingest from source URL (if provided)
    if (input.sourceUrl) {
      try {
        const ingestResult = await ingestDocumentFromUrl({
          documentId: input.documentId,
          organizationId: input.organizationId,
          caseId: input.caseId,
          fileName: input.fileName,
          contentType: input.fileType,
          sourceUrl: input.sourceUrl,
          source: input.source,
        });
        if (!ingestResult.success) {
          logger.warn(
            "Document ingest failed; extraction will still attempt against stored path",
            {
              documentId: input.documentId,
              fileName: input.fileName,
              source: input.source,
              error: ingestResult.error,
            },
          );
        }
      } catch (err) {
        logger.error("Document ingest threw (async)", {
          documentId: input.documentId,
          fileName: input.fileName,
          source: input.source,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 2. Extract against the (now ideally railway://) storage path
    try {
      const result = await processDocument({
        documentId: input.documentId,
        organizationId: input.organizationId,
        extractionType,
      });
      if (!result.success) {
        logger.error("Document extraction failed (async)", {
          documentId: input.documentId,
          fileName: input.fileName,
          source: input.source,
          error: result.error,
        });
        return;
      }
      logger.info("Document extraction completed (async)", {
        documentId: input.documentId,
        fileName: input.fileName,
        source: input.source,
        processingId: result.processingId,
      });
    } catch (err) {
      logger.error("Document extraction threw (async)", {
        documentId: input.documentId,
        fileName: input.fileName,
        source: input.source,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
