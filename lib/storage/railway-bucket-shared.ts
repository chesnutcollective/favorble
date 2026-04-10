/**
 * Pure, environment-agnostic helpers for Railway bucket storage paths.
 * Split out of `railway-bucket.ts` (which is `server-only`) so that CLI
 * scripts can reuse the same path-building logic without pulling in the
 * server-side Next.js guard.
 */

export const RAILWAY_STORAGE_PREFIX = "railway://";

export function railwayBucketConfigured(): boolean {
  return (
    !!process.env.RAILWAY_BUCKET_ENDPOINT &&
    !!process.env.RAILWAY_BUCKET_NAME &&
    !!process.env.RAILWAY_BUCKET_ACCESS_KEY_ID &&
    !!process.env.RAILWAY_BUCKET_SECRET_ACCESS_KEY
  );
}

/**
 * Build a bucket key for a document.
 * Format: {orgId}/{caseId}/{timestamp}-{sanitizedFilename}
 */
export function buildRailwayDocumentKey(
  organizationId: string,
  caseId: string,
  fileName: string,
): string {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = Date.now();
  return `${organizationId}/${caseId}/${timestamp}-${sanitized}`;
}

/**
 * Build the full storage_path string stored in the documents table.
 * Format: railway://{bucket-name}/{key}
 */
export function buildRailwayStoragePath(bucketName: string, key: string): string {
  return `${RAILWAY_STORAGE_PREFIX}${bucketName}/${key}`;
}

/**
 * Parse a railway://... storage_path back into its bucket/key pair.
 * Returns null if the path isn't a Railway-bucket URL.
 */
export function parseRailwayStoragePath(
  storagePath: string,
): { bucket: string; key: string } | null {
  if (!storagePath.startsWith(RAILWAY_STORAGE_PREFIX)) return null;
  const rest = storagePath.slice(RAILWAY_STORAGE_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
}
