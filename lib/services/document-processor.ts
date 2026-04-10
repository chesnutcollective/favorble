import "server-only";
import { db } from "@/db/drizzle";
import {
	documents,
	documentProcessingResults,
	medicalChronologyEntries,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import {
	extractFromDocument,
	findExtraction,
	groupExtractions,
	type ExtractionType,
} from "@/lib/integrations/langextract";

type ProcessOptions = {
	documentId: string;
	organizationId: string;
	extractionType?: ExtractionType;
};

/**
 * Process a document end-to-end:
 * 1. Load document and existing text (if any)
 * 2. Send to LangExtract worker
 * 3. Save structured results to documentProcessingResults
 * 4. Generate medical chronology entries (if extraction yielded events)
 */
export async function processDocument({
	documentId,
	organizationId,
	extractionType = "medical_record",
}: ProcessOptions): Promise<{ success: boolean; processingId?: string; error?: string }> {
	const [doc] = await db
		.select({
			id: documents.id,
			caseId: documents.caseId,
			fileName: documents.fileName,
			fileType: documents.fileType,
			storagePath: documents.storagePath,
		})
		.from(documents)
		.where(
			and(
				eq(documents.id, documentId),
				eq(documents.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!doc) {
		return { success: false, error: "Document not found" };
	}

	// Create processing result row in "extracting" state
	const [processing] = await db
		.insert(documentProcessingResults)
		.values({
			organizationId,
			documentId,
			caseId: doc.caseId,
			status: "extracting",
		})
		.returning({ id: documentProcessingResults.id });

	const startTime = Date.now();

	try {
		// For now we use the file name + any text content available.
		// Once PDF text extraction is wired in (services/document-text-extractor),
		// this will pull the actual document text.
		const documentText = await loadDocumentText(doc.storagePath, doc.fileName);

		if (!documentText || documentText.length < 10) {
			await db
				.update(documentProcessingResults)
				.set({
					status: "failed",
					errorMessage: "No extractable text found in document",
					processingTimeMs: Date.now() - startTime,
					updatedAt: new Date(),
				})
				.where(eq(documentProcessingResults.id, processing.id));
			return {
				success: false,
				processingId: processing.id,
				error: "No extractable text",
			};
		}

		const result = await extractFromDocument(documentText, extractionType);

		if (!result) {
			await db
				.update(documentProcessingResults)
				.set({
					status: "failed",
					errorMessage: "LangExtract worker returned no result",
					processingTimeMs: Date.now() - startTime,
					updatedAt: new Date(),
				})
				.where(eq(documentProcessingResults.id, processing.id));
			return { success: false, processingId: processing.id };
		}

		// Save structured fields based on extraction type
		const grouped = groupExtractions(result.extractions);
		const provider = findExtraction(result.extractions, "provider");
		const encounterDate = findExtraction(
			result.extractions,
			"encounter_date",
		);

		await db
			.update(documentProcessingResults)
			.set({
				status: "completed",
				extractedText: documentText.slice(0, 50000),
				documentCategory: extractionType,
				providerName: provider?.extraction_text ?? null,
				providerType:
					(provider?.attributes?.specialty as string | undefined) ?? null,
				treatmentDateStart: encounterDate?.extraction_text
					? parseDate(encounterDate.extraction_text)
					: null,
				aiClassification: {
					model: result.model,
					mock: result.mock,
					extractions: result.extractions,
				},
				aiConfidence: 80,
				processingTimeMs: Date.now() - startTime,
				updatedAt: new Date(),
			})
			.where(eq(documentProcessingResults.id, processing.id));

		// Create medical chronology entries from medical_record extractions
		if (extractionType === "medical_record") {
			await createChronologyEntry({
				organizationId,
				caseId: doc.caseId,
				documentId,
				extractions: result.extractions,
				grouped,
			});
		}

		logger.info("Document processed", {
			documentId,
			extractionCount: result.extractions.length,
			elapsedMs: result.elapsed_ms,
		});

		return { success: true, processingId: processing.id };
	} catch (error) {
		logger.error("Document processing failed", { documentId, error });
		await db
			.update(documentProcessingResults)
			.set({
				status: "failed",
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				processingTimeMs: Date.now() - startTime,
				updatedAt: new Date(),
			})
			.where(eq(documentProcessingResults.id, processing.id));
		return {
			success: false,
			processingId: processing.id,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Load document text. Currently a stub that returns the filename.
 * TODO: implement PDF text extraction (pdf-parse) and S3/Bucket fetch.
 */
async function loadDocumentText(
	storagePath: string,
	fileName: string,
): Promise<string> {
	// For development/demo: if storagePath is a data URL or text URL, fetch it
	if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
		try {
			const response = await fetch(storagePath);
			if (response.ok) {
				const contentType = response.headers.get("content-type") || "";
				if (contentType.includes("text/") || contentType.includes("json")) {
					return await response.text();
				}
			}
		} catch {
			// fall through to filename
		}
	}
	// Fallback: return the filename as a minimal placeholder so processing
	// can complete (caller will mark as failed if too short).
	return fileName;
}

function parseDate(text: string): Date | null {
	const parsed = new Date(text);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function createChronologyEntry(params: {
	organizationId: string;
	caseId: string;
	documentId: string;
	extractions: Array<{
		extraction_class: string;
		extraction_text: string;
		attributes?: Record<string, unknown>;
	}>;
	grouped: Record<
		string,
		Array<{
			extraction_class: string;
			extraction_text: string;
			attributes?: Record<string, unknown>;
		}>
	>;
}): Promise<void> {
	const { organizationId, caseId, documentId, extractions, grouped } = params;

	const provider = grouped.provider?.[0];
	const encounter = grouped.encounter_date?.[0];
	const diagnoses = (grouped.diagnosis ?? []).map((d) => d.extraction_text);
	const medications = (grouped.medication ?? []).map((m) => m.extraction_text);
	const treatments = (grouped.treatment ?? []).map((t) => t.extraction_text);

	if (!provider && !encounter && diagnoses.length === 0) {
		return; // nothing meaningful to record
	}

	await db.insert(medicalChronologyEntries).values({
		organizationId,
		caseId,
		sourceDocumentId: documentId,
		entryType: "office_visit",
		eventDate: encounter?.extraction_text
			? parseDate(encounter.extraction_text)
			: null,
		providerName: provider?.extraction_text ?? null,
		providerType:
			(provider?.attributes?.specialty as string | undefined) ?? null,
		summary: buildSummary(provider, encounter, diagnoses),
		details: extractions.map((e) => `${e.extraction_class}: ${e.extraction_text}`).join("\n"),
		diagnoses: diagnoses.length > 0 ? diagnoses : null,
		medications: medications.length > 0 ? medications : null,
		treatments: treatments.length > 0 ? treatments : null,
		aiGenerated: true,
		isVerified: false,
	});
}

function buildSummary(
	provider: { extraction_text: string } | undefined,
	encounter: { extraction_text: string } | undefined,
	diagnoses: string[],
): string {
	const parts: string[] = [];
	if (provider) parts.push(`Visit with ${provider.extraction_text}`);
	if (encounter) parts.push(`on ${encounter.extraction_text}`);
	if (diagnoses.length > 0) parts.push(`for ${diagnoses.join(", ")}`);
	return parts.join(" ") || "Medical record processed";
}
