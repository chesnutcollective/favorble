import "server-only";

import { db } from "@/db/drizzle";
import { cases } from "@/db/schema/cases";
import { documents } from "@/db/schema/documents";
import { documentProcessingResults } from "@/db/schema/document-processing";
import { medicalChronologyEntries } from "@/db/schema/medical-chronology";
import { generateChronologyEntries } from "@/lib/ai/client";
import { logger } from "@/lib/logger/server";
import { eq, and, isNull } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GenerateChronologyParams {
	caseId: string;
	organizationId: string;
	regenerate?: boolean;
}

interface GenerateChronologyResult {
	success: boolean;
	entriesCreated: number;
	error?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a medical chronology for a case by analysing all processed documents.
 *
 * 1. If regenerate, delete existing unverified AI entries
 * 2. Fetch all completed document processing results for the case
 * 3. For each document with extracted text, call Claude for chronology extraction
 * 4. Bulk insert entries
 * 5. Update case metadata
 */
export async function generateChronology(
	params: GenerateChronologyParams,
): Promise<GenerateChronologyResult> {
	const { caseId, organizationId, regenerate } = params;

	try {
		// 1. Optionally clear unverified AI entries
		if (regenerate) {
			await db
				.delete(medicalChronologyEntries)
				.where(
					and(
						eq(medicalChronologyEntries.caseId, caseId),
						eq(medicalChronologyEntries.aiGenerated, true),
						eq(medicalChronologyEntries.isVerified, false),
					),
				);
			logger.info("Cleared unverified AI chronology entries for regeneration", {
				caseId,
			});
		}

		// 2. Fetch all completed processing results with extracted text
		const results = await db
			.select({
				processingId: documentProcessingResults.id,
				documentId: documentProcessingResults.documentId,
				extractedText: documentProcessingResults.extractedText,
				documentCategory: documentProcessingResults.documentCategory,
				providerName: documentProcessingResults.providerName,
			})
			.from(documentProcessingResults)
			.where(
				and(
					eq(documentProcessingResults.caseId, caseId),
					eq(documentProcessingResults.status, "completed"),
				),
			);

		// Look up file names for context
		const documentIds = results.map((r) => r.documentId);
		const docRows =
			documentIds.length > 0
				? await db
						.select({
							id: documents.id,
							fileName: documents.fileName,
						})
						.from(documents)
						.where(
							and(
								eq(documents.caseId, caseId),
								isNull(documents.deletedAt),
							),
						)
					: [];

		const docMap = new Map(docRows.map((d) => [d.id, d.fileName]));

		// 3. Process each document
		let totalCreated = 0;

		for (const result of results) {
			if (!result.extractedText || result.extractedText.trim().length === 0) {
				continue;
			}

			try {
				const entries = await generateChronologyEntries(
					result.extractedText,
					{
						documentId: result.documentId,
						fileName: docMap.get(result.documentId) ?? undefined,
						category: result.documentCategory ?? undefined,
						providerName: result.providerName ?? undefined,
					},
				);

				if (entries.length === 0) {
					continue;
				}

				// 4. Bulk insert
				const rows = entries.map((entry) => ({
					organizationId,
					caseId,
					sourceDocumentId: result.documentId,
					entryType: entry.entryType as
						| "office_visit"
						| "hospitalization"
						| "emergency"
						| "lab_result"
						| "imaging"
						| "mental_health"
						| "physical_therapy"
						| "surgery"
						| "prescription"
						| "diagnosis"
						| "functional_assessment"
						| "other",
					eventDate: entry.eventDate ? new Date(entry.eventDate) : null,
					eventDateEnd: entry.eventDateEnd
						? new Date(entry.eventDateEnd)
						: null,
					providerName: entry.providerName,
					providerType: entry.providerType,
					facilityName: entry.facilityName,
					summary: entry.summary,
					details: entry.details,
					diagnoses: entry.diagnoses ?? [],
					treatments: entry.treatments ?? [],
					medications: entry.medications ?? [],
					pageReference: entry.pageReference,
					aiGenerated: true,
					isVerified: false,
				}));

				await db.insert(medicalChronologyEntries).values(rows);
				totalCreated += rows.length;

				logger.info("Chronology entries created for document", {
					documentId: result.documentId,
					entriesCount: rows.length,
				});
			} catch (docError) {
				// Per-document error: log and continue
				logger.error(
					"Failed to generate chronology entries for document",
					docError,
					{ documentId: result.documentId, caseId },
				);
			}
		}

		// 5. Update case metadata
		await db
			.update(cases)
			.set({
				chronologyGeneratedAt: new Date(),
				chronologyEntryCount: totalCreated,
				updatedAt: new Date(),
			})
			.where(eq(cases.id, caseId));

		logger.info("Medical chronology generation complete", {
			caseId,
			entriesCreated: totalCreated,
		});

		return { success: true, entriesCreated: totalCreated };
	} catch (error) {
		logger.error("Medical chronology generation failed", error, { caseId });
		return {
			success: false,
			entriesCreated: 0,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Export all chronology entries for a case as a CSV string, sorted by date.
 */
export async function exportChronologyToCSV(caseId: string): Promise<string> {
	const entries = await db
		.select()
		.from(medicalChronologyEntries)
		.where(
			and(
				eq(medicalChronologyEntries.caseId, caseId),
				eq(medicalChronologyEntries.isExcluded, false),
			),
		)
		.orderBy(medicalChronologyEntries.eventDate);

	const headers = [
		"Date",
		"Date End",
		"Entry Type",
		"Provider Name",
		"Provider Type",
		"Facility",
		"Summary",
		"Details",
		"Diagnoses",
		"Treatments",
		"Medications",
		"Page Reference",
		"AI Generated",
		"Verified",
	];

	const rows = entries.map((e) => [
		e.eventDate ? e.eventDate.toISOString().split("T")[0] : "",
		e.eventDateEnd ? e.eventDateEnd.toISOString().split("T")[0] : "",
		e.entryType,
		e.providerName ?? "",
		e.providerType ?? "",
		e.facilityName ?? "",
		e.summary,
		e.details ?? "",
		(e.diagnoses ?? []).join("; "),
		(e.treatments ?? []).join("; "),
		(e.medications ?? []).join("; "),
		e.pageReference ?? "",
		e.aiGenerated ? "Yes" : "No",
		e.isVerified ? "Yes" : "No",
	]);

	const escapeCsv = (val: string) => {
		if (val.includes(",") || val.includes('"') || val.includes("\n")) {
			return `"${val.replace(/"/g, '""')}"`;
		}
		return val;
	};

	const csvLines = [
		headers.map(escapeCsv).join(","),
		...rows.map((row) => row.map(escapeCsv).join(",")),
	];

	return csvLines.join("\n");
}
