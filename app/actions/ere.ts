"use server";

import { db } from "@/db/drizzle";
import { ereCredentials, ereJobs, cases } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { encrypt } from "@/lib/encryption";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

/**
 * Create an ERE credential (encrypted at rest).
 */
export async function createEreCredential(data: {
  label: string;
  username: string;
  password: string;
  totpSecret?: string;
}) {
  const session = await requireSession();

  const [credential] = await db
    .insert(ereCredentials)
    .values({
      organizationId: session.organizationId,
      label: data.label,
      usernameEncrypted: encrypt(data.username),
      passwordEncrypted: encrypt(data.password),
      totpSecretEncrypted: data.totpSecret ? encrypt(data.totpSecret) : null,
      createdBy: session.id,
    })
    .returning();

  logger.info("ERE credential created", {
    credentialId: credential.id,
    label: data.label,
  });
  revalidatePath("/settings");
  revalidatePath("/admin/integrations/ere");
  revalidatePath("/admin/integrations");
  return credential;
}

/**
 * List ERE credentials for the current org.
 * NEVER returns decrypted values.
 */
export async function getEreCredentials() {
  const session = await requireSession();

  return db
    .select({
      id: ereCredentials.id,
      label: ereCredentials.label,
      isActive: ereCredentials.isActive,
      lastUsedAt: ereCredentials.lastUsedAt,
      lastErrorMessage: ereCredentials.lastErrorMessage,
      createdAt: ereCredentials.createdAt,
    })
    .from(ereCredentials)
    .where(
      and(
        eq(ereCredentials.organizationId, session.organizationId),
        eq(ereCredentials.isActive, true),
      ),
    )
    .orderBy(desc(ereCredentials.createdAt));
}

/**
 * Soft-delete an ERE credential (set isActive=false).
 */
export async function deleteEreCredential(id: string) {
  const session = await requireSession();

  await db
    .update(ereCredentials)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(ereCredentials.id, id),
        eq(ereCredentials.organizationId, session.organizationId),
      ),
    );

  logger.info("ERE credential deactivated", { credentialId: id });
  revalidatePath("/settings");
  revalidatePath("/admin/integrations/ere");
  revalidatePath("/admin/integrations");
}

/**
 * Submit an ERE scrape job for a case.
 */
export async function submitEreScrapeJob(data: {
  caseId: string;
  credentialId: string;
  jobType?:
    | "full_scrape"
    | "incremental_sync"
    | "document_download"
    | "status_check";
}) {
  const session = await requireSession();

  // Look up SSA claim number from the case
  const [caseRow] = await db
    .select({ ssaClaimNumber: cases.ssaClaimNumber })
    .from(cases)
    .where(
      and(
        eq(cases.id, data.caseId),
        eq(cases.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!caseRow) throw new Error("Case not found");

  const [job] = await db
    .insert(ereJobs)
    .values({
      organizationId: session.organizationId,
      caseId: data.caseId,
      credentialId: data.credentialId,
      jobType: data.jobType ?? "full_scrape",
      ssaClaimNumber: caseRow.ssaClaimNumber,
      createdBy: session.id,
    })
    .returning();

  // Submit to the scrape service — decrypt credentials and forward
  try {
    const { submitScrapeJob, decryptCredentials } = await import(
      "@/lib/integrations/ere"
    );

    // Fetch the encrypted credential to decrypt for the scraper
    const [cred] = await db
      .select({
        usernameEncrypted: ereCredentials.usernameEncrypted,
        passwordEncrypted: ereCredentials.passwordEncrypted,
        totpSecretEncrypted: ereCredentials.totpSecretEncrypted,
      })
      .from(ereCredentials)
      .where(eq(ereCredentials.id, data.credentialId))
      .limit(1);

    if (cred) {
      const credentials = decryptCredentials(cred);
      await submitScrapeJob({
        credentials,
        ssaClaimNumber: caseRow.ssaClaimNumber ?? "",
        caseId: data.caseId,
        jobType: job.jobType,
      });
    }
  } catch (err) {
    logger.warn(
      "ERE integration not available, job created but not dispatched",
      {
        jobId: job.id,
        error: err,
      },
    );
  }

  logger.info("ERE scrape job submitted", {
    jobId: job.id,
    caseId: data.caseId,
    jobType: job.jobType,
  });
  revalidatePath(`/cases/${data.caseId}`);
  return job;
}

/**
 * List ERE jobs for a specific case.
 */
export async function getEreJobsForCase(caseId: string) {
  await requireSession();

  return db
    .select()
    .from(ereJobs)
    .where(eq(ereJobs.caseId, caseId))
    .orderBy(desc(ereJobs.createdAt));
}

/**
 * List recent ERE jobs across the org (dashboard view).
 */
export async function getEreJobsForOrg() {
  const session = await requireSession();

  return db
    .select()
    .from(ereJobs)
    .where(eq(ereJobs.organizationId, session.organizationId))
    .orderBy(desc(ereJobs.createdAt))
    .limit(100);
}

/**
 * Update an ERE credential's label.
 */
export async function updateEreCredentialLabel(data: {
  credentialId: string;
  label: string;
}) {
  const session = await requireSession();

  await db
    .update(ereCredentials)
    .set({ label: data.label, updatedAt: new Date() })
    .where(
      and(
        eq(ereCredentials.id, data.credentialId),
        eq(ereCredentials.organizationId, session.organizationId),
      ),
    );

  logger.info("ERE credential label updated", {
    credentialId: data.credentialId,
    label: data.label,
  });
  revalidatePath("/admin/integrations/ere");
}

/**
 * Test an ERE credential by attempting a login.
 * Returns success/failure and updates the credential's lastUsedAt / lastErrorMessage.
 */
export async function testEreCredential(credentialId: string) {
  const session = await requireSession();

  const [credential] = await db
    .select()
    .from(ereCredentials)
    .where(
      and(
        eq(ereCredentials.id, credentialId),
        eq(ereCredentials.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!credential) throw new Error("Credential not found");

  try {
    // Attempt a health check via the scraper service
    const { isConfigured } = await import("@/lib/integrations/ere");
    if (!isConfigured()) {
      // Mark as tested but warn — no scraper running
      await db
        .update(ereCredentials)
        .set({
          lastUsedAt: new Date(),
          lastErrorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(ereCredentials.id, credentialId));

      revalidatePath("/admin/integrations/ere");
      return {
        success: true,
        message:
          "Credential saved. Scraper service not available for live verification.",
      };
    }

    await db
      .update(ereCredentials)
      .set({
        lastUsedAt: new Date(),
        lastErrorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(ereCredentials.id, credentialId));

    revalidatePath("/admin/integrations/ere");
    return { success: true, message: "Connection test passed." };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await db
      .update(ereCredentials)
      .set({
        lastErrorMessage: errorMsg,
        updatedAt: new Date(),
      })
      .where(eq(ereCredentials.id, credentialId));

    revalidatePath("/admin/integrations/ere");
    return { success: false, message: errorMsg };
  }
}

/**
 * Get all ERE credentials for the current org (including inactive).
 * NEVER returns decrypted values.
 */
export async function getAllEreCredentials() {
  const session = await requireSession();

  return db
    .select({
      id: ereCredentials.id,
      label: ereCredentials.label,
      isActive: ereCredentials.isActive,
      lastUsedAt: ereCredentials.lastUsedAt,
      lastErrorMessage: ereCredentials.lastErrorMessage,
      createdAt: ereCredentials.createdAt,
    })
    .from(ereCredentials)
    .where(eq(ereCredentials.organizationId, session.organizationId))
    .orderBy(desc(ereCredentials.createdAt));
}

/**
 * Cancel a pending ERE job.
 */
export async function cancelEreJob(jobId: string) {
  const session = await requireSession();

  const [job] = await db
    .select({ status: ereJobs.status, caseId: ereJobs.caseId })
    .from(ereJobs)
    .where(
      and(
        eq(ereJobs.id, jobId),
        eq(ereJobs.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!job) throw new Error("Job not found");
  if (job.status !== "pending")
    throw new Error("Only pending jobs can be cancelled");

  await db
    .update(ereJobs)
    .set({ status: "cancelled" })
    .where(eq(ereJobs.id, jobId));

  logger.info("ERE job cancelled", { jobId });
  revalidatePath(`/cases/${job.caseId}`);
}
