import "server-only";

import { logger } from "@/lib/logger/server";

/**
 * Chronicle integration client.
 *
 * Chronicle is the SSA data sync tool that handles:
 * - Pulling documents from Social Security Administration
 * - Uploading documents to SSA's ERE system
 * - Daily data refresh across cases
 * - 2FA management for SSA access
 *
 * Currently, Chronicle has NO API integration with case management.
 * Integration is limited to:
 * 1. Deep linking (clicking a URL to open Chronicle for a claimant)
 * 2. A future browser extension for "Save to Favorble"
 * 3. Potential future API if Chronicle vendor provides one
 */

/**
 * Build a Chronicle deep link URL for a claimant.
 * This is the primary integration mechanism today.
 */
export function buildChronicleUrl(claimantId: string): string {
  // The actual Chronicle URL pattern will need to be confirmed with the client
  // For now, use a placeholder pattern
  return `https://chronicle.app/claimants/${claimantId}`;
}

/**
 * Validate a Chronicle URL format.
 */
export function isValidChronicleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("chronicle");
  } catch {
    return false;
  }
}

/**
 * Extract claimant ID from a Chronicle URL, if possible.
 */
export function extractClaimantId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/");
    const claimantIndex = pathParts.indexOf("claimants");
    if (claimantIndex >= 0 && claimantIndex + 1 < pathParts.length) {
      return pathParts[claimantIndex + 1];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Future: Sync documents from Chronicle for a claimant.
 * This will be implemented when Chronicle provides an API.
 */
export async function syncDocuments(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  claimantId: string,
): Promise<{ synced: number; errors: number }> {
  logger.info("Chronicle document sync not yet available (no API)");
  return { synced: 0, errors: 0 };
}
