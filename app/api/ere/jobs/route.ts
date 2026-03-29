import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import { ereJobs, ereCredentials, cases } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { submitScrapeJob, decryptCredentials } from "@/lib/integrations/ere";

/**
 * POST /api/ere/jobs — Create a new ERE scrape job.
 */
export async function POST(request: NextRequest) {
	try {
		const session = await requireSession();
		const body = await request.json();

		const { caseId, credentialId, jobType } = body;

		if (!caseId || !credentialId) {
			return NextResponse.json(
				{ error: "caseId and credentialId are required" },
				{ status: 400 },
			);
		}

		// Verify the case belongs to the user's organization
		const [caseRow] = await db
			.select({
				id: cases.id,
				ssaClaimNumber: cases.ssaClaimNumber,
			})
			.from(cases)
			.where(
				and(
					eq(cases.id, caseId),
					eq(cases.organizationId, session.organizationId),
				),
			)
			.limit(1);

		if (!caseRow) {
			return NextResponse.json(
				{ error: "Case not found" },
				{ status: 404 },
			);
		}

		// Verify the credential belongs to the user's organization and is active
		const [credential] = await db
			.select()
			.from(ereCredentials)
			.where(
				and(
					eq(ereCredentials.id, credentialId),
					eq(ereCredentials.organizationId, session.organizationId),
					eq(ereCredentials.isActive, true),
				),
			)
			.limit(1);

		if (!credential) {
			return NextResponse.json(
				{ error: "Credential not found or inactive" },
				{ status: 404 },
			);
		}

		// Create the job record
		const [job] = await db
			.insert(ereJobs)
			.values({
				organizationId: session.organizationId,
				caseId,
				credentialId,
				jobType: jobType ?? "full_scrape",
				status: "pending",
				ssaClaimNumber: caseRow.ssaClaimNumber,
				createdBy: session.id,
			})
			.returning();

		// Submit the job to the scraper service
		const decrypted = decryptCredentials(credential);
		const result = await submitScrapeJob({
			credentials: decrypted,
			ssaClaimNumber: caseRow.ssaClaimNumber ?? "",
			caseId,
			jobType: jobType ?? "full_scrape",
		});

		if (result.success) {
			// Update job to running
			await db
				.update(ereJobs)
				.set({
					status: "running",
					startedAt: new Date(),
					metadata: { externalJobId: result.jobId },
				})
				.where(eq(ereJobs.id, job.id));

			// Update credential lastUsedAt
			await db
				.update(ereCredentials)
				.set({ lastUsedAt: new Date(), updatedAt: new Date() })
				.where(eq(ereCredentials.id, credentialId));

			// Update case ERE status
			await db
				.update(cases)
				.set({
					ereLastScrapeStatus: "running",
					updatedAt: new Date(),
				})
				.where(eq(cases.id, caseId));
		} else {
			// Mark job as failed
			await db
				.update(ereJobs)
				.set({
					status: "failed",
					errorMessage: result.error ?? "Failed to submit job",
					completedAt: new Date(),
				})
				.where(eq(ereJobs.id, job.id));
		}

		logger.info("ERE job created", {
			jobId: job.id,
			caseId,
			submitted: result.success,
		});

		return NextResponse.json({
			success: result.success,
			job: {
				id: job.id,
				caseId: job.caseId,
				credentialId: job.credentialId,
				jobType: job.jobType,
				status: result.success ? "running" : "failed",
				errorMessage: result.success ? null : result.error,
				createdAt: job.createdAt,
			},
		});
	} catch (error) {
		logger.error("ERE job creation error", { error });
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

/**
 * GET /api/ere/jobs?caseId=... — List ERE jobs for a case.
 */
export async function GET(request: NextRequest) {
	try {
		const session = await requireSession();
		const caseId = request.nextUrl.searchParams.get("caseId");

		if (!caseId) {
			return NextResponse.json(
				{ error: "caseId query parameter is required" },
				{ status: 400 },
			);
		}

		const jobs = await db
			.select({
				id: ereJobs.id,
				caseId: ereJobs.caseId,
				credentialId: ereJobs.credentialId,
				jobType: ereJobs.jobType,
				status: ereJobs.status,
				ssaClaimNumber: ereJobs.ssaClaimNumber,
				documentsFound: ereJobs.documentsFound,
				documentsDownloaded: ereJobs.documentsDownloaded,
				errorMessage: ereJobs.errorMessage,
				startedAt: ereJobs.startedAt,
				completedAt: ereJobs.completedAt,
				createdAt: ereJobs.createdAt,
			})
			.from(ereJobs)
			.where(
				and(
					eq(ereJobs.caseId, caseId),
					eq(ereJobs.organizationId, session.organizationId),
				),
			)
			.orderBy(desc(ereJobs.createdAt));

		return NextResponse.json({ jobs });
	} catch (error) {
		logger.error("ERE jobs list error", { error });
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
