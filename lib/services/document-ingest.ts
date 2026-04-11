import "server-only";
import { db } from "@/db/drizzle";
import { documents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import {
  buildDeterministicDocumentKey,
  uploadRailwayDocumentAtKey,
} from "@/lib/storage/railway-bucket";

export type IngestFromUrlInput = {
  documentId: string;
  organizationId: string;
  caseId: string;
  fileName: string;
  contentType: string | null | undefined;
  sourceUrl: string;
  /**
   * Optional context label for logs (e.g. "ere_webhook", "chronicle_webhook").
   */
  source?: string;
};

export type IngestFromUrlResult =
  | { success: true; storagePath: string; bytes: number }
  | { success: false; error: string };

/**
 * Max size we'll download from an external source into memory. 50MB is
 * well above any single SSA document we've seen in practice and small
 * enough to fit comfortably in a Vercel Lambda's memory budget.
 */
const MAX_INGEST_BYTES = 50 * 1024 * 1024;

const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/**
 * Download a document from its source URL, persist it to the Railway
 * bucket at a deterministic key, and update the `documents.storage_path`
 * column to point at the new `railway://` location.
 *
 * The deterministic key (derived from documentId) means this operation
 * is idempotent: running it twice on the same document overwrites the
 * existing blob rather than creating a duplicate.
 *
 * Returns `{ success: false }` when:
 * - sourceUrl isn't an http(s) URL (nothing to download)
 * - the fetch fails or times out
 * - the response body exceeds MAX_INGEST_BYTES
 *
 * On failure, storage_path is left unchanged — the caller can still
 * render the row and the original URL remains as a best-effort
 * fallback.
 */
export async function ingestDocumentFromUrl(
  input: IngestFromUrlInput,
): Promise<IngestFromUrlResult> {
  const { documentId, organizationId, caseId, fileName, sourceUrl, source } =
    input;

  if (!sourceUrl) {
    return { success: false, error: "No source URL provided" };
  }

  const lower = sourceUrl.toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
    return {
      success: false,
      error: "Source URL is not an http(s) URL",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    DEFAULT_FETCH_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(sourceUrl, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Document ingest fetch failed", {
      documentId,
      fileName,
      source,
      error: message,
    });
    return { success: false, error: `fetch failed: ${message}` };
  }
  clearTimeout(timeout);

  if (!response.ok) {
    logger.error("Document ingest got non-OK status", {
      documentId,
      fileName,
      source,
      status: response.status,
    });
    return {
      success: false,
      error: `source returned HTTP ${response.status}`,
    };
  }

  // Prefer the content-length header so we can reject oversized docs
  // without buffering them. Fall back to buffering + post-check for
  // responses that don't advertise a length.
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const declared = Number.parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(declared) && declared > MAX_INGEST_BYTES) {
      logger.error("Document ingest rejected: advertised size too large", {
        documentId,
        fileName,
        source,
        contentLength: declared,
      });
      return {
        success: false,
        error: `document too large (${declared} bytes, max ${MAX_INGEST_BYTES})`,
      };
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_INGEST_BYTES) {
    logger.error("Document ingest rejected: body too large", {
      documentId,
      fileName,
      source,
      bytes: arrayBuffer.byteLength,
    });
    return {
      success: false,
      error: `document too large (${arrayBuffer.byteLength} bytes, max ${MAX_INGEST_BYTES})`,
    };
  }

  // Determine the final content type. Prefer the server's content-type
  // header if present, fall back to the caller's hint, then to a
  // generic octet-stream so S3 has *something*.
  const responseContentType = response.headers.get("content-type");
  const finalContentType =
    responseContentType ?? input.contentType ?? "application/octet-stream";

  const key = buildDeterministicDocumentKey(
    organizationId,
    caseId,
    documentId,
    fileName,
  );

  try {
    const { storagePath } = await uploadRailwayDocumentAtKey(
      key,
      Buffer.from(arrayBuffer),
      finalContentType,
    );

    await db
      .update(documents)
      .set({
        storagePath,
        fileSizeBytes: arrayBuffer.byteLength,
        fileType: finalContentType,
      })
      .where(eq(documents.id, documentId));

    logger.info("Document ingested from URL", {
      documentId,
      fileName,
      source,
      bytes: arrayBuffer.byteLength,
      contentType: finalContentType,
      storagePath,
    });

    return {
      success: true,
      storagePath,
      bytes: arrayBuffer.byteLength,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Document ingest upload/update failed", {
      documentId,
      fileName,
      source,
      error: message,
    });
    return { success: false, error: `persist failed: ${message}` };
  }
}
