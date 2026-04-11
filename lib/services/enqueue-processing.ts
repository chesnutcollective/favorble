import "server-only";
import { after } from "next/server";
import { logger } from "@/lib/logger/server";
import { processDocument } from "@/lib/services/document-processor";
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
