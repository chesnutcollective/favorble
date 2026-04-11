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
 */
export async function uploadRailwayDocument(
  organizationId: string,
  caseId: string,
  fileName: string,
  buffer: Buffer | Uint8Array,
  contentType: string,
): Promise<{ storagePath: string; key: string }> {
  const key = buildRailwayDocumentKey(organizationId, caseId, fileName);
  const input: PutObjectCommandInput = {
    Bucket: process.env.RAILWAY_BUCKET_NAME as string,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "private, max-age=3600",
  };
  await getClient().send(new PutObjectCommand(input));
  return {
    storagePath: buildRailwayStoragePath(
      process.env.RAILWAY_BUCKET_NAME as string,
      key,
    ),
    key,
  };
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
