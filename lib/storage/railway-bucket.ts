import "server-only";

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  RAILWAY_STORAGE_PREFIX,
  buildRailwayDocumentKey,
  buildRailwayStoragePath,
  parseRailwayStoragePath,
  railwayBucketConfigured,
} from "./railway-bucket-shared";

/**
 * Railway S3-compatible bucket adapter (server-only wrapper around the AWS
 * SDK). Pure path helpers live in `railway-bucket-shared.ts` so CLI scripts
 * can reuse them without pulling in `server-only`.
 *
 * Storage-path convention used in the `documents` table:
 *   railway://{bucket-name}/{key}
 */

export {
  RAILWAY_STORAGE_PREFIX,
  buildRailwayDocumentKey,
  buildRailwayStoragePath,
  parseRailwayStoragePath,
};

/**
 * Lazy getter so callers that run dotenv.config() after the module is
 * imported (e.g. CLI scripts) still see the env vars. Reading at module
 * load time would capture undefined values before dotenv runs.
 */
export function isRailwayBucketConfigured(): boolean {
  return railwayBucketConfigured();
}

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!railwayBucketConfigured()) {
    throw new Error(
      "Railway bucket env vars missing (RAILWAY_BUCKET_ENDPOINT, _NAME, _ACCESS_KEY_ID, _SECRET_ACCESS_KEY)",
    );
  }
  if (!client) {
    client = new S3Client({
      endpoint: process.env.RAILWAY_BUCKET_ENDPOINT,
      region: process.env.RAILWAY_BUCKET_REGION ?? "auto",
      credentials: {
        accessKeyId: process.env.RAILWAY_BUCKET_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.RAILWAY_BUCKET_SECRET_ACCESS_KEY as string,
      },
      forcePathStyle: false,
    });
  }
  return client;
}

/**
 * Upload a buffer to the Railway bucket.
 * Returns the full railway://... storage_path to store in the DB.
 *
 * Uses a timestamp-based key — safe for manual uploads and one-off
 * seed runs. For webhook ingestion that may retry, prefer
 * `uploadRailwayDocumentAtKey()` with a deterministic key built from
 * the document id so retries overwrite the same object.
 */
export async function uploadRailwayDocument(
  organizationId: string,
  caseId: string,
  fileName: string,
  buffer: Buffer | Uint8Array,
  contentType: string,
): Promise<{ storagePath: string; key: string }> {
  const key = buildRailwayDocumentKey(organizationId, caseId, fileName);
  return uploadRailwayDocumentAtKey(key, buffer, contentType);
}

/**
 * Upload a buffer to the Railway bucket at an explicit key. Callers
 * build the key themselves, so a retry of the same operation produces
 * the same key and overwrites the existing object instead of creating
 * a duplicate. Use this for any ingest-from-external-source flow where
 * the source event may be delivered more than once.
 */
export async function uploadRailwayDocumentAtKey(
  key: string,
  buffer: Buffer | Uint8Array,
  contentType: string,
): Promise<{ storagePath: string; key: string }> {
  const bucketName = process.env.RAILWAY_BUCKET_NAME as string;
  const input: PutObjectCommandInput = {
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "private, max-age=3600",
  };
  await getClient().send(new PutObjectCommand(input));
  return {
    storagePath: buildRailwayStoragePath(bucketName, key),
    key,
  };
}

/**
 * Build a deterministic Railway bucket key for a specific document row.
 * Because the key is derived from the documentId (which is stable
 * across retries of the same webhook event), re-ingesting the same
 * document overwrites the existing blob rather than creating a
 * duplicate.
 *
 * Format: `{orgId}/{caseId}/{documentId}-{sanitizedFilename}`
 */
export function buildDeterministicDocumentKey(
  organizationId: string,
  caseId: string,
  documentId: string,
  fileName: string,
): string {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${organizationId}/${caseId}/${documentId}-${sanitized}`;
}

/**
 * Generate a short-lived signed download URL for a document stored in the
 * Railway bucket. Accepts either the full railway://... storage_path or a
 * bare bucket key.
 */
export async function getRailwaySignedUrl(
  storagePathOrKey: string,
  expiresInSeconds = 3600,
): Promise<string> {
  let key: string;
  const parsed = parseRailwayStoragePath(storagePathOrKey);
  if (parsed) {
    key = parsed.key;
  } else {
    key = storagePathOrKey;
  }
  const command = new GetObjectCommand({
    Bucket: process.env.RAILWAY_BUCKET_NAME as string,
    Key: key,
  });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}
