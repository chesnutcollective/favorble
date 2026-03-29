import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import {
	medicalChronologyEntries,
	cases,
	documents,
} from "@/db/schema";
import { eq, and, gte, lte, asc, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ caseId: string }> };

/**
 * GET /api/chronology/[caseId] — Fetch chronology entries for a case.
 *
 * Query params:
 *   entryType    — filter by entry type
 *   providerName — filter by provider name (partial match)
 *   startDate    — filter entries on or after this date (ISO string)
 *   endDate      — filter entries on or before this date (ISO string)
 *   verified     — "true" or "false" to filter by verification status
 */
export async function GET(
	request: NextRequest,
	context: RouteContext,
) {
	try {
		const session = await requireSession();
		const { caseId } = await context.params;
		const searchParams = request.nextUrl.searchParams;

		// Verify the case belongs to the user's organization
		const [caseRow] = await db
			.select({ id: cases.id })
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

		// Build filter conditions
		const conditions = [
			eq(medicalChronologyEntries.caseId, caseId),
			eq(medicalChronologyEntries.organizationId, session.organizationId),
			eq(medicalChronologyEntries.isExcluded, false),
		];

		const entryType = searchParams.get("entryType");
		if (entryType) {
			conditions.push(
				sql`${medicalChronologyEntries.entryType} = ${entryType}`,
			);
		}

		const providerName = searchParams.get("providerName");
		if (providerName) {
			conditions.push(
				sql`${medicalChronologyEntries.providerName} ILIKE ${"%" + providerName + "%"}`,
			);
		}

		const startDate = searchParams.get("startDate");
		if (startDate) {
			conditions.push(
				gte(medicalChronologyEntries.eventDate, new Date(startDate)),
			);
		}

		const endDate = searchParams.get("endDate");
		if (endDate) {
			conditions.push(
				lte(medicalChronologyEntries.eventDate, new Date(endDate)),
			);
		}

		const verified = searchParams.get("verified");
		if (verified === "true") {
			conditions.push(eq(medicalChronologyEntries.isVerified, true));
		} else if (verified === "false") {
			conditions.push(eq(medicalChronologyEntries.isVerified, false));
		}

		const entries = await db
			.select({
				id: medicalChronologyEntries.id,
				entryType: medicalChronologyEntries.entryType,
				eventDate: medicalChronologyEntries.eventDate,
				eventDateEnd: medicalChronologyEntries.eventDateEnd,
				providerName: medicalChronologyEntries.providerName,
				providerType: medicalChronologyEntries.providerType,
				facilityName: medicalChronologyEntries.facilityName,
				summary: medicalChronologyEntries.summary,
				details: medicalChronologyEntries.details,
				diagnoses: medicalChronologyEntries.diagnoses,
				treatments: medicalChronologyEntries.treatments,
				medications: medicalChronologyEntries.medications,
				pageReference: medicalChronologyEntries.pageReference,
				sourceDocumentId: medicalChronologyEntries.sourceDocumentId,
				sourceDocumentName: documents.fileName,
				aiGenerated: medicalChronologyEntries.aiGenerated,
				isVerified: medicalChronologyEntries.isVerified,
				verifiedAt: medicalChronologyEntries.verifiedAt,
				createdAt: medicalChronologyEntries.createdAt,
			})
			.from(medicalChronologyEntries)
			.leftJoin(
				documents,
				eq(medicalChronologyEntries.sourceDocumentId, documents.id),
			)
			.where(and(...conditions))
			.orderBy(asc(medicalChronologyEntries.eventDate));

		return NextResponse.json({
			caseId,
			totalEntries: entries.length,
			entries,
		});
	} catch (error) {
		logger.error("Chronology fetch error", { error });
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

/**
 * POST /api/chronology/[caseId] — Trigger chronology generation.
 *
 * Body: { regenerate?: boolean }
 */
export async function POST(
	request: NextRequest,
	context: RouteContext,
) {
	try {
		const session = await requireSession();
		const { caseId } = await context.params;
		const body = await request.json();

		// Verify the case belongs to the user's organization
		const [caseRow] = await db
			.select({ id: cases.id })
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

		const regenerate = body.regenerate === true;

		if (regenerate) {
			// Mark existing entries as excluded so they are regenerated
			await db
				.update(medicalChronologyEntries)
				.set({
					isExcluded: true,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(medicalChronologyEntries.caseId, caseId),
						eq(
							medicalChronologyEntries.organizationId,
							session.organizationId,
						),
					),
				);

			logger.info("Existing chronology entries marked for regeneration", {
				caseId,
			});
		}

		// Update case to reflect generation is in progress
		await db
			.update(cases)
			.set({
				updatedAt: new Date(),
			})
			.where(eq(cases.id, caseId));

		logger.info("Chronology generation triggered", {
			caseId,
			regenerate,
		});

		// TODO: Trigger actual AI-based chronology generation pipeline
		// This would typically enqueue a background job that processes
		// all documents for the case and generates chronology entries.

		return NextResponse.json({
			success: true,
			caseId,
			regenerate,
			message: regenerate
				? "Chronology regeneration started"
				: "Chronology generation started",
		});
	} catch (error) {
		logger.error("Chronology generation trigger error", { error });
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
