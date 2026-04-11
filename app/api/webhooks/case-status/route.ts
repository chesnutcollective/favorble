import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import { communications, documents, cases, caseStages } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { enqueueIngestAndProcessing } from "@/lib/services/enqueue-processing";
import crypto from "node:crypto";

const isDev = process.env.NODE_ENV === "development";

/**
 * Verify the X-Signature header from Case Status webhooks.
 * Uses HMAC-SHA256 with the webhook secret.
 */
function verifySignature(signature: string | null, rawBody: string): boolean {
  const secret = process.env.CASE_STATUS_WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured — skip verification in dev, reject in prod
    if (isDev) {
      logger.warn(
        "Case Status webhook secret not configured, skipping verification (dev mode)",
      );
      return true;
    }
    return false;
  }

  if (!signature) return false;

  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

/**
 * Look up the internal case ID from a Case Status external ID.
 */
async function resolveCaseId(
  caseExternalId: string,
): Promise<{ caseId: string; organizationId: string } | null> {
  const [caseRow] = await db
    .select({
      id: cases.id,
      organizationId: cases.organizationId,
    })
    .from(cases)
    .where(eq(cases.caseStatusExternalId, caseExternalId))
    .limit(1);

  return caseRow
    ? { caseId: caseRow.id, organizationId: caseRow.organizationId }
    : null;
}

/**
 * Webhook receiver for Case Status events.
 *
 * Handles:
 * - Inbound client messages -> communications table
 * - Document uploads from clients -> documents table
 * - Status updates -> case stage mapping
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-casestatus-signature");

    // Verify webhook signature
    try {
      if (!verifySignature(signature, rawBody)) {
        logger.error("Case Status webhook signature verification failed");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 },
        );
      }
    } catch (verifyError) {
      if (isDev) {
        logger.warn(
          "Case Status signature verification error (ignoring in dev)",
          {
            error: verifyError,
          },
        );
      } else {
        logger.error("Case Status signature verification error", {
          error: verifyError,
        });
        return NextResponse.json(
          { error: "Signature verification failed" },
          { status: 401 },
        );
      }
    }

    const body = JSON.parse(rawBody);
    const eventType = body.event ?? body.type;

    switch (eventType) {
      case "message.received": {
        logger.info("Case Status message received", {
          caseExternalId: body.caseId,
          from: body.from,
        });

        const resolved = await resolveCaseId(body.caseId);
        if (!resolved) {
          logger.warn("Case Status message for unknown case", {
            caseExternalId: body.caseId,
          });
          break;
        }

        await db.insert(communications).values({
          organizationId: resolved.organizationId,
          caseId: resolved.caseId,
          type: "message_inbound",
          direction: "inbound",
          body: body.content ?? body.body ?? null,
          fromAddress: body.from ?? body.sender ?? null,
          subject: body.subject ?? null,
          externalMessageId: body.messageId ?? body.id ?? null,
          sourceSystem: "case_status",
          metadata: {
            rawEvent: eventType,
            receivedAt: new Date().toISOString(),
          },
        });

        logger.info("Case Status message persisted", {
          caseId: resolved.caseId,
        });
        break;
      }

      case "document.uploaded": {
        logger.info("Case Status document uploaded", {
          caseExternalId: body.caseId,
          fileName: body.fileName,
        });

        const resolved = await resolveCaseId(body.caseId);
        if (!resolved) {
          logger.warn("Case Status document for unknown case", {
            caseExternalId: body.caseId,
          });
          break;
        }

        const fileName = body.fileName ?? body.name ?? "untitled";
        const fileType =
          body.fileType ??
          body.contentType ??
          body.mimeType ??
          "application/octet-stream";

        const [insertedDoc] = await db
          .insert(documents)
          .values({
            organizationId: resolved.organizationId,
            caseId: resolved.caseId,
            fileName,
            fileType,
            fileSizeBytes: body.fileSize ?? body.size ?? null,
            storagePath:
              body.downloadUrl ??
              body.url ??
              `pending/case-status/${body.documentId ?? body.id ?? "unknown"}`,
            source: "case_status",
            sourceExternalId: body.documentId ?? body.id ?? null,
            category: body.category ?? null,
            description: body.description ?? null,
            metadata: {
              rawEvent: eventType,
              downloadUrl: body.downloadUrl ?? body.url ?? null,
              receivedAt: new Date().toISOString(),
            },
          })
          .returning({ id: documents.id });

        logger.info("Case Status document persisted", {
          caseId: resolved.caseId,
          fileName,
        });

        // Schedule ingest (download + persist to Railway bucket) +
        // extraction after the webhook responds. The helper skips
        // non-extractable mime types automatically, so client-uploaded
        // images/receipts won't burn LLM tokens.
        if (insertedDoc) {
          enqueueIngestAndProcessing({
            documentId: insertedDoc.id,
            organizationId: resolved.organizationId,
            caseId: resolved.caseId,
            fileName,
            fileType,
            sourceUrl: body.downloadUrl ?? body.url ?? null,
            source: "case_status_webhook",
          });
        }
        break;
      }

      case "status.updated": {
        logger.info("Case Status update", {
          caseExternalId: body.caseId,
          status: body.status,
        });

        const resolved = await resolveCaseId(body.caseId);
        if (!resolved) {
          logger.warn("Case Status status update for unknown case", {
            caseExternalId: body.caseId,
          });
          break;
        }

        // Map Case Status stage names to internal stage codes
        const statusToStageCode: Record<string, string> = {
          application_filed: "APP_FILED",
          initial_review: "INIT_REVIEW",
          reconsideration: "RECON",
          hearing_requested: "HEAR_REQ",
          hearing_scheduled: "HEAR_SCHED",
          decision_pending: "DEC_PEND",
          approved: "APPROVED",
          denied: "DENIED",
          appeal: "APPEAL",
        };

        const stageCode =
          statusToStageCode[body.status] ?? statusToStageCode[body.newStatus];
        if (stageCode) {
          const [stage] = await db
            .select({ id: caseStages.id })
            .from(caseStages)
            .where(
              and(
                eq(caseStages.organizationId, resolved.organizationId),
                eq(caseStages.code, stageCode),
              ),
            )
            .limit(1);

          if (stage) {
            await db
              .update(cases)
              .set({
                currentStageId: stage.id,
                stageEnteredAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(cases.id, resolved.caseId));

            logger.info("Case stage updated from Case Status webhook", {
              caseId: resolved.caseId,
              stageCode,
            });
          } else {
            logger.warn("No matching stage found for Case Status status", {
              status: body.status ?? body.newStatus,
              stageCode,
            });
          }
        } else {
          logger.info("No stage mapping for Case Status status", {
            status: body.status ?? body.newStatus,
          });
        }
        break;
      }

      default: {
        logger.warn("Unknown Case Status event type", { eventType });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Case Status webhook error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "case-status-webhook" });
}
