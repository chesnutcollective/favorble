import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import {
  ereJobs,
  ereCredentials,
  documents,
  cases,
  scrapedCaseData,
} from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { processDocument } from "@/lib/services/document-processor";
import crypto from "node:crypto";

const isDev = process.env.NODE_ENV === "development";

/**
 * Verify ERE webhook secret.
 * Expects Authorization header with Bearer token matching the webhook secret.
 */
function verifyWebhookSecret(request: NextRequest): boolean {
  const secret = process.env.ERE_WEBHOOK_SECRET;
  if (!secret) {
    if (isDev) {
      logger.warn(
        "ERE webhook secret not configured, skipping verification (dev mode)",
      );
      return true;
    }
    return false;
  }

  // Check Authorization: Bearer <secret>
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    try {
      return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret));
    } catch {
      return false;
    }
  }

  // Also accept X-Webhook-Secret header
  const webhookSecret = request.headers.get("x-webhook-secret");
  if (webhookSecret) {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(webhookSecret),
        Buffer.from(secret),
      );
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Webhook receiver for ERE (Electronic Records Express) scraping events.
 *
 * Handles:
 * - scrape.completed -> Update job results and case ERE status
 * - document.downloaded -> Insert document with source "ere"
 * - scrape.failed -> Update job status to "failed"
 * - credentials.invalid -> Update credential error message
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret
    try {
      if (!verifyWebhookSecret(request)) {
        logger.error("ERE webhook secret verification failed");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } catch (verifyError) {
      if (isDev) {
        logger.warn("ERE secret verification error (ignoring in dev)", {
          error: verifyError,
        });
      } else {
        logger.error("ERE secret verification error", {
          error: verifyError,
        });
        return NextResponse.json(
          { error: "Verification failed" },
          { status: 401 },
        );
      }
    }

    const body = await request.json();
    const eventType = body.event ?? body.type;

    switch (eventType) {
      case "scrape.completed": {
        logger.info("ERE scrape completed", {
          jobId: body.jobId,
          documentsFound: body.documentsFound,
          documentsDownloaded: body.documentsDownloaded,
        });

        if (!body.jobId) {
          logger.warn("ERE scrape.completed missing jobId");
          break;
        }

        // Update the job row with results
        await db
          .update(ereJobs)
          .set({
            status: "completed",
            documentsFound: body.documentsFound ?? null,
            documentsDownloaded: body.documentsDownloaded ?? null,
            completedAt: new Date(),
            metadata: body.metadata ?? {},
          })
          .where(eq(ereJobs.id, body.jobId));

        // Look up the job to get the caseId
        const [job] = await db
          .select({ caseId: ereJobs.caseId })
          .from(ereJobs)
          .where(eq(ereJobs.id, body.jobId))
          .limit(1);

        if (job) {
          await db
            .update(cases)
            .set({
              ereLastScrapeAt: new Date(),
              ereLastScrapeStatus: "completed",
              updatedAt: new Date(),
            })
            .where(eq(cases.id, job.caseId));

          // Insert scraped data if present
          if (body.scrapedData) {
            const [jobRow] = await db
              .select({ organizationId: ereJobs.organizationId })
              .from(ereJobs)
              .where(eq(ereJobs.id, body.jobId))
              .limit(1);

            if (jobRow) {
              await db.insert(scrapedCaseData).values({
                organizationId: jobRow.organizationId,
                caseId: job.caseId,
                ereJobId: body.jobId,
                claimStatus: body.scrapedData.claimStatus ?? null,
                hearingDate: body.scrapedData.hearingDate
                  ? new Date(body.scrapedData.hearingDate)
                  : null,
                hearingOffice: body.scrapedData.hearingOffice ?? null,
                adminLawJudge: body.scrapedData.adminLawJudge ?? null,
                documentsOnFile: body.scrapedData.documentsOnFile ?? null,
                rawData: body.scrapedData,
              });

              // Reconcile: fill empty case fields from scraped data (additive only)
              await db
                .update(cases)
                .set({
                  hearingOffice: sql`COALESCE(${cases.hearingOffice}, ${body.scrapedData.hearingOffice ?? null})`,
                  adminLawJudge: sql`COALESCE(${cases.adminLawJudge}, ${body.scrapedData.adminLawJudge ?? null})`,
                  updatedAt: new Date(),
                })
                .where(eq(cases.id, job.caseId));

              // Mark scraped data as reconciled
              await db
                .update(scrapedCaseData)
                .set({ reconciledAt: new Date() })
                .where(
                  and(
                    eq(scrapedCaseData.caseId, job.caseId),
                    isNull(scrapedCaseData.reconciledAt),
                  ),
                );

              logger.info("Scraped data reconciled", {
                caseId: job.caseId,
              });
            }
          }

          logger.info("Case ERE status updated", {
            caseId: job.caseId,
          });
        }
        break;
      }

      case "document.downloaded": {
        logger.info("ERE document downloaded", {
          jobId: body.jobId,
          documentTitle: body.title ?? body.fileName,
        });

        if (!body.jobId) {
          logger.warn("ERE document.downloaded missing jobId");
          break;
        }

        // Look up the job to get case and org context
        const [job] = await db
          .select({
            caseId: ereJobs.caseId,
            organizationId: ereJobs.organizationId,
          })
          .from(ereJobs)
          .where(eq(ereJobs.id, body.jobId))
          .limit(1);

        if (!job) {
          logger.warn("ERE document for unknown job", {
            jobId: body.jobId,
          });
          break;
        }

        const fileName = body.fileName ?? body.title ?? "ERE Document";
        const fileType =
          body.fileType ??
          body.contentType ??
          body.mimeType ??
          "application/pdf";

        const [insertedDoc] = await db
          .insert(documents)
          .values({
            organizationId: job.organizationId,
            caseId: job.caseId,
            fileName,
            fileType,
            fileSizeBytes: body.fileSize ?? body.size ?? null,
            storagePath:
              body.downloadUrl ??
              body.url ??
              `pending/ere/${body.documentId ?? body.id ?? "unknown"}`,
            source: "ere",
            sourceExternalId: body.documentId ?? body.id ?? null,
            category: body.category ?? body.documentType ?? null,
            description: body.description ?? null,
            metadata: {
              rawEvent: eventType,
              jobId: body.jobId,
              downloadUrl: body.downloadUrl ?? body.url ?? null,
              documentType: body.documentType ?? null,
              receivedAt: new Date().toISOString(),
            },
          })
          .returning({ id: documents.id });

        logger.info("ERE document persisted", {
          caseId: job.caseId,
          fileName,
        });

        // Fire-and-forget: send to LangExtract for structured extraction.
        // Don't await — webhook should respond fast.
        if (insertedDoc) {
          processDocument({
            documentId: insertedDoc.id,
            organizationId: job.organizationId,
            extractionType: "medical_record",
          }).catch((err) => {
            logger.error("LangExtract processing failed", {
              documentId: insertedDoc.id,
              error: err,
            });
          });
        }
        break;
      }

      case "scrape.failed": {
        logger.info("ERE scrape failed", {
          jobId: body.jobId,
          error: body.error ?? body.errorMessage,
        });

        if (!body.jobId) {
          logger.warn("ERE scrape.failed missing jobId");
          break;
        }

        const errorMessage =
          body.error ?? body.errorMessage ?? "Unknown scrape failure";

        await db
          .update(ereJobs)
          .set({
            status: "failed",
            errorMessage,
            completedAt: new Date(),
          })
          .where(eq(ereJobs.id, body.jobId));

        // Also update the case ERE status
        const [job] = await db
          .select({ caseId: ereJobs.caseId })
          .from(ereJobs)
          .where(eq(ereJobs.id, body.jobId))
          .limit(1);

        if (job) {
          await db
            .update(cases)
            .set({
              ereLastScrapeStatus: "failed",
              updatedAt: new Date(),
            })
            .where(eq(cases.id, job.caseId));
        }

        logger.info("ERE job marked as failed", {
          jobId: body.jobId,
          errorMessage,
        });
        break;
      }

      case "credentials.invalid": {
        logger.info("ERE credentials invalid", {
          credentialId: body.credentialId,
          error: body.error ?? body.errorMessage,
        });

        if (!body.credentialId) {
          logger.warn("ERE credentials.invalid missing credentialId");
          break;
        }

        const errorMessage =
          body.error ?? body.errorMessage ?? "Credentials are invalid";

        await db
          .update(ereCredentials)
          .set({
            lastErrorMessage: errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(ereCredentials.id, body.credentialId));

        logger.info("ERE credential error updated", {
          credentialId: body.credentialId,
        });
        break;
      }

      default: {
        logger.warn("Unknown ERE event type", { eventType });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("ERE webhook error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "ere-webhook" });
}
