import "server-only";

import { createClient } from "@/db/server";
import {
  RAILWAY_STORAGE_PREFIX,
  getRailwaySignedUrl,
  uploadRailwayDocument,
} from "./railway-bucket";

const DOCUMENTS_BUCKET = "documents";
const TEMPLATES_BUCKET = "document-templates";

export type UploadResult = {
  path: string;
  fullPath: string;
};

/**
 * Build a storage path for a document.
 * Format: {orgId}/{caseId}/{timestamp}-{sanitizedFilename}
 */
function buildDocumentPath(
  organizationId: string,
  caseId: string,
  fileName: string,
): string {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = Date.now();
  return `${organizationId}/${caseId}/${timestamp}-${sanitized}`;
}

/**
 * Build a storage path for a template.
 * Format: {orgId}/templates/{timestamp}-{sanitizedFilename}
 */
function buildTemplatePath(organizationId: string, fileName: string): string {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = Date.now();
  return `${organizationId}/templates/${timestamp}-${sanitized}`;
}

/**
 * Upload a document file to Supabase Storage.
 */
export async function uploadDocument(
  organizationId: string,
  caseId: string,
  file: File,
): Promise<UploadResult> {
  const supabase = await createClient();
  const path = buildDocumentPath(organizationId, caseId, file.name);

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload document: ${error.message}`);
  }

  return {
    path: data.path,
    fullPath: data.fullPath,
  };
}

/**
 * Upload a document from a Buffer (e.g., from template generation).
 */
export async function uploadDocumentBuffer(
  organizationId: string,
  caseId: string,
  fileName: string,
  buffer: Buffer | Uint8Array,
  contentType: string,
): Promise<UploadResult> {
  const supabase = await createClient();
  const path = buildDocumentPath(organizationId, caseId, fileName);

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, {
      cacheControl: "3600",
      upsert: false,
      contentType,
    });

  if (error) {
    throw new Error(`Failed to upload document: ${error.message}`);
  }

  return {
    path: data.path,
    fullPath: data.fullPath,
  };
}

/**
 * Upload a template file to Supabase Storage.
 */
export async function uploadTemplate(
  organizationId: string,
  file: File,
): Promise<UploadResult> {
  const supabase = await createClient();
  const path = buildTemplatePath(organizationId, file.name);

  const { data, error } = await supabase.storage
    .from(TEMPLATES_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload template: ${error.message}`);
  }

  return {
    path: data.path,
    fullPath: data.fullPath,
  };
}

/**
 * Upload a document buffer to the default document storage backend.
 * Currently routes to the Railway S3-compatible bucket when configured
 * (staging/prod) and falls back to Supabase Storage otherwise (local dev).
 */
export async function uploadDocumentToDefaultBackend(
  organizationId: string,
  caseId: string,
  fileName: string,
  buffer: Buffer | Uint8Array,
  contentType: string,
): Promise<{ storagePath: string }> {
  if (process.env.RAILWAY_BUCKET_NAME) {
    const { storagePath } = await uploadRailwayDocument(
      organizationId,
      caseId,
      fileName,
      buffer,
      contentType,
    );
    return { storagePath };
  }
  const result = await uploadDocumentBuffer(
    organizationId,
    caseId,
    fileName,
    buffer,
    contentType,
  );
  return { storagePath: result.path };
}

/**
 * Generate a signed URL for downloading a document.
 * Default expiry: 1 hour (3600 seconds).
 *
 * Routes based on the storage_path prefix:
 *   railway://...     → Railway S3 bucket (signed)
 *   http(s)://...     → passed through as-is (webhook-ingested docs that
 *                        haven't been moved to Railway yet)
 *   pending/...       → throws (not yet ingested)
 *   chronicle://...   → throws (metadata-only stub, caller should detect
 *                        this at a higher level via getDocumentUrl)
 *   anything else     → Supabase Storage (legacy upload path)
 */
export async function getDocumentSignedUrl(
  storagePath: string,
  expiresIn = 3600,
): Promise<string> {
  if (storagePath.startsWith(RAILWAY_STORAGE_PREFIX)) {
    return getRailwaySignedUrl(storagePath, expiresIn);
  }

  // Webhook-ingested docs temporarily store the source system's raw
  // pre-signed URL as storage_path. A background ingest job downloads
  // and rewrites this to railway://. Until then, hand the URL straight
  // back to the client — it's already a valid download URL.
  if (
    storagePath.startsWith("http://") ||
    storagePath.startsWith("https://")
  ) {
    return storagePath;
  }

  // Placeholder paths written by webhooks when no downloadUrl was
  // provided by the source system. Nothing to sign — fail loudly so the
  // UI shows a clear "not yet ready" error.
  if (storagePath.startsWith("pending/")) {
    throw new Error(
      "Document is still being downloaded from the source system. Please refresh in a moment.",
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Generate a signed URL for downloading a template.
 */
export async function getTemplateSignedUrl(
  storagePath: string,
  expiresIn = 3600,
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from(TEMPLATES_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Delete a document from storage.
 */
export async function deleteDocumentFile(storagePath: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .remove([storagePath]);

  if (error) {
    throw new Error(`Failed to delete document: ${error.message}`);
  }
}

/**
 * Delete a template from storage.
 */
export async function deleteTemplateFile(storagePath: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(TEMPLATES_BUCKET)
    .remove([storagePath]);

  if (error) {
    throw new Error(`Failed to delete template: ${error.message}`);
  }
}

/**
 * List documents in a case directory.
 */
export async function listCaseDocuments(
  organizationId: string,
  caseId: string,
): Promise<
  Array<{ name: string; id: string; metadata: Record<string, string> }>
> {
  const supabase = await createClient();
  const prefix = `${organizationId}/${caseId}/`;

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .list(prefix, {
      sortBy: { column: "created_at", order: "desc" },
    });

  if (error) {
    throw new Error(`Failed to list documents: ${error.message}`);
  }

  return (data ?? []).map((item) => ({
    name: item.name,
    id: item.id ?? "",
    metadata: (item.metadata as Record<string, string>) ?? {},
  }));
}
