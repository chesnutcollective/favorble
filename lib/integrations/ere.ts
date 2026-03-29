import "server-only";

import { decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EreCredentials {
  username: string;
  password: string;
  totpSecret?: string;
}

export interface EreScrapeResult {
  success: boolean;
  jobId?: string;
  error?: string;
}

export interface EreDocument {
  id: string;
  title: string;
  category: string;
  dateReceived: string | null;
  pageCount: number | null;
  downloadUrl: string | null;
}

export interface EreScrapeStatus {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  documentsFound?: number;
  documentsDownloaded?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getScraperUrl(): string {
  const url = process.env.ERE_SCRAPER_URL;
  if (!url) {
    throw new Error("ERE_SCRAPER_URL environment variable is not set");
  }
  return url;
}

function getScraperApiKey(): string {
  const key = process.env.ERE_SCRAPER_API_KEY;
  if (!key) {
    throw new Error("ERE_SCRAPER_API_KEY environment variable is not set");
  }
  return key;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether the ERE scraper environment variables are configured.
 */
export function isConfigured(): boolean {
  return !!(process.env.ERE_SCRAPER_URL && process.env.ERE_SCRAPER_API_KEY);
}

/**
 * Decrypt stored ERE credentials.
 */
export function decryptCredentials(encrypted: {
  usernameEncrypted: string;
  passwordEncrypted: string;
  totpSecretEncrypted?: string | null;
}): EreCredentials {
  return {
    username: decrypt(encrypted.usernameEncrypted),
    password: decrypt(encrypted.passwordEncrypted),
    totpSecret: encrypted.totpSecretEncrypted
      ? decrypt(encrypted.totpSecretEncrypted)
      : undefined,
  };
}

/**
 * Submit a new scrape job to the ERE scraper service.
 */
export async function submitScrapeJob(params: {
  credentials: EreCredentials;
  ssaClaimNumber: string;
  caseId: string;
  jobType?: string;
}): Promise<EreScrapeResult> {
  try {
    const baseUrl = getScraperUrl();
    const apiKey = getScraperApiKey();

    const response = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        username: params.credentials.username,
        password: params.credentials.password,
        totpSecret: params.credentials.totpSecret,
        ssaClaimNumber: params.ssaClaimNumber,
        caseId: params.caseId,
        jobType: params.jobType ?? "full_scrape",
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error("ERE scrape job submission failed", undefined, {
        status: response.status,
        body: errorBody,
      });
      return {
        success: false,
        error: `Scraper returned ${response.status}: ${errorBody}`,
      };
    }

    const data = (await response.json()) as { jobId: string };
    logger.info("ERE scrape job submitted", {
      jobId: data.jobId,
      caseId: params.caseId,
    });

    return { success: true, jobId: data.jobId };
  } catch (error) {
    logger.error("ERE scrape job submission error", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown error submitting job",
    };
  }
}

/**
 * Cancel a running scrape job.
 */
export async function cancelScrapeJob(
  jobId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const baseUrl = getScraperUrl();
    const apiKey = getScraperApiKey();

    const response = await fetch(`${baseUrl}/jobs/${jobId}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error("ERE cancel job failed", undefined, {
        jobId,
        status: response.status,
        body: errorBody,
      });
      return {
        success: false,
        error: `Scraper returned ${response.status}: ${errorBody}`,
      };
    }

    logger.info("ERE scrape job cancelled", { jobId });
    return { success: true };
  } catch (error) {
    logger.error("ERE cancel job error", error, { jobId });
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown error cancelling job",
    };
  }
}

/**
 * Get the current status of a scrape job.
 */
export async function getScrapeStatus(
  jobId: string,
): Promise<EreScrapeStatus | null> {
  try {
    const baseUrl = getScraperUrl();
    const apiKey = getScraperApiKey();

    const response = await fetch(`${baseUrl}/jobs/${jobId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      logger.error("ERE get job status failed", undefined, {
        jobId,
        status: response.status,
      });
      return null;
    }

    const data = (await response.json()) as EreScrapeStatus;
    return data;
  } catch (error) {
    logger.error("ERE get job status error", error, { jobId });
    return null;
  }
}
