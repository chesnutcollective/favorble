import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import { documents, cases } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

const isDev = process.env.NODE_ENV === "development";

/**
 * Verify Chronicle webhook secret.
 * Expects Authorization header with Bearer token matching the webhook secret.
 */
function verifyWebhookSecret(request: NextRequest): boolean {
	const secret = process.env.CHRONICLE_WEBHOOK_SECRET;
	if (!secret) {
		if (isDev) {
			logger.warn(
				"Chronicle webhook secret not configured, skipping verification (dev mode)",
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
			return crypto.timingSafeEqual(
				Buffer.from(token),
				Buffer.from(secret),
			);
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
 * Look up the internal case by Chronicle claimant ID.
 */
async function resolveCaseByClaimantId(
	claimantId: string,
): Promise<{ caseId: string; organizationId: string } | null> {
	const [caseRow] = await db
		.select({
			id: cases.id,
			organizationId: cases.organizationId,
		})
		.from(cases)
		.where(eq(cases.chronicleClaimantId, claimantId))
		.limit(1);

	return caseRow
		? { caseId: caseRow.id, organizationId: caseRow.organizationId }
		: null;
}

/**
 * Webhook receiver for Chronicle (SSA data sync) events.
 *
 * Handles:
 * - New SSA documents available -> documents table
 * - Claim status changes -> case SSA fields
 * - Sync completion notifications -> case.chronicleLastSyncAt
 */
export async function POST(request: NextRequest) {
	try {
		// Verify webhook secret
		try {
			if (!verifyWebhookSecret(request)) {
				logger.error("Chronicle webhook secret verification failed");
				return NextResponse.json(
					{ error: "Unauthorized" },
					{ status: 401 },
				);
			}
		} catch (verifyError) {
			if (isDev) {
				logger.warn("Chronicle secret verification error (ignoring in dev)", {
					error: verifyError,
				});
			} else {
				logger.error("Chronicle secret verification error", {
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
			case "document.available": {
				logger.info("Chronicle document available", {
					claimantId: body.claimantId,
					documentType: body.documentType,
				});

				const resolved = await resolveCaseByClaimantId(body.claimantId);
				if (!resolved) {
					logger.warn("Chronicle document for unknown claimant", {
						claimantId: body.claimantId,
					});
					break;
				}

				const fileName =
					body.fileName ?? body.title ?? body.documentType ?? "SSA Document";
				const fileType =
					body.fileType ?? body.contentType ?? body.mimeType ?? "application/pdf";

				await db.insert(documents).values({
					organizationId: resolved.organizationId,
					caseId: resolved.caseId,
					fileName,
					fileType,
					fileSizeBytes: body.fileSize ?? body.size ?? null,
					storagePath: body.downloadUrl ?? body.url ?? `pending/chronicle/${body.documentId ?? body.id ?? "unknown"}`,
					source: "chronicle",
					sourceExternalId: body.documentId ?? body.id ?? null,
					category: body.documentType ?? body.category ?? "ssa_document",
					description: body.description ?? null,
					metadata: {
						rawEvent: eventType,
						claimantId: body.claimantId,
						downloadUrl: body.downloadUrl ?? body.url ?? null,
						documentType: body.documentType ?? null,
						receivedAt: new Date().toISOString(),
					},
				});

				// Update case chronicleLastSyncAt
				await db
					.update(cases)
					.set({
						chronicleLastSyncAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(cases.id, resolved.caseId));

				logger.info("Chronicle document persisted", {
					caseId: resolved.caseId,
					fileName,
				});
				break;
			}

			case "claim.status_changed": {
				logger.info("Chronicle claim status changed", {
					claimantId: body.claimantId,
					oldStatus: body.oldStatus,
					newStatus: body.newStatus,
				});

				const resolved = await resolveCaseByClaimantId(body.claimantId);
				if (!resolved) {
					logger.warn("Chronicle status change for unknown claimant", {
						claimantId: body.claimantId,
					});
					break;
				}

				// Update SSA-related fields on the case based on the status change
				const updateData: Record<string, unknown> = {
					updatedAt: new Date(),
					chronicleLastSyncAt: new Date(),
				};

				// Map Chronicle status fields to case SSA fields
				if (body.ssaClaimNumber) {
					updateData.ssaClaimNumber = body.ssaClaimNumber;
				}
				if (body.ssaOffice) {
					updateData.ssaOffice = body.ssaOffice;
				}
				if (body.hearingOffice) {
					updateData.hearingOffice = body.hearingOffice;
				}
				if (body.adminLawJudge || body.alj) {
					updateData.adminLawJudge = body.adminLawJudge ?? body.alj;
				}
				if (body.allegedOnsetDate) {
					updateData.allegedOnsetDate = new Date(body.allegedOnsetDate);
				}
				if (body.dateLastInsured) {
					updateData.dateLastInsured = new Date(body.dateLastInsured);
				}

				await db
					.update(cases)
					.set(updateData)
					.where(eq(cases.id, resolved.caseId));

				logger.info("Case SSA fields updated from Chronicle webhook", {
					caseId: resolved.caseId,
					newStatus: body.newStatus,
				});
				break;
			}

			case "sync.completed": {
				logger.info("Chronicle sync completed", {
					claimantId: body.claimantId,
					documentsFound: body.documentCount,
				});

				const resolved = await resolveCaseByClaimantId(body.claimantId);
				if (!resolved) {
					logger.warn("Chronicle sync completed for unknown claimant", {
						claimantId: body.claimantId,
					});
					break;
				}

				await db
					.update(cases)
					.set({
						chronicleLastSyncAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(cases.id, resolved.caseId));

				logger.info("Case chronicleLastSyncAt updated", {
					caseId: resolved.caseId,
				});
				break;
			}

			default: {
				logger.warn("Unknown Chronicle event type", { eventType });
			}
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		logger.error("Chronicle webhook error", { error });
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function GET() {
	return NextResponse.json({ status: "ok", endpoint: "chronicle-webhook" });
}
