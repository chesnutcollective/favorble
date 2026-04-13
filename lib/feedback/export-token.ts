import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

const TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

function getSecret(): string {
  return (
    process.env.FEEDBACK_EXPORT_SECRET ?? "fb-export-dev-secret-do-not-use-in-prod"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/**
 * Generate a 48-hour HMAC token bound to an organization. Used by external
 * tools (Claude Code, CI) to call the feedback API without a Clerk session.
 *
 * Format: base64url("{orgId}:{expiresAt}.{signature}")
 */
export function generateExportToken(organizationId: string): string {
  const expiresAt = Date.now() + TTL_MS;
  const payload = `${organizationId}:${expiresAt}`;
  const sig = sign(payload);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export type VerifiedToken = {
  organizationId: string;
  expiresAt: number;
};

export function verifyExportToken(token: string): VerifiedToken | null {
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf-8");
  } catch {
    return null;
  }

  const dotIdx = decoded.lastIndexOf(".");
  if (dotIdx === -1) return null;

  const payload = decoded.slice(0, dotIdx);
  const presentedSig = decoded.slice(dotIdx + 1);

  const expectedSig = sign(payload);
  const a = Buffer.from(presentedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const colonIdx = payload.indexOf(":");
  if (colonIdx === -1) return null;
  const organizationId = payload.slice(0, colonIdx);
  const expiresAt = Number(payload.slice(colonIdx + 1));
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  return { organizationId, expiresAt };
}

/**
 * Pull the bearer token out of an Authorization header and verify it.
 * Returns the decoded token or null.
 */
export function verifyAuthHeader(
  authHeader: string | null,
): VerifiedToken | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/.exec(authHeader.trim());
  if (!match) return null;
  return verifyExportToken(match[1]);
}
