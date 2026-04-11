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
import { logPhiModification } from "@/lib/services/hipaa-audit";
import { PDFParse } from "pdf-parse";
import {
	RAILWAY_STORAGE_PREFIX,
	getRailwaySignedUrl,
} from "@/lib/storage/railway-bucket";

/** Max characters of extracted text we'll pass downstream to an LLM. */
export const MAX_EXTRACTED_CHARS = 200_000;

export type ExtractedDocumentText = {
	text: string;
	fileSize: number;
	totalChars: number;
	pageCount?: number;
	source:
		| "http-pdf"
		| "http-text"
		| "data-url-pdf"
		| "data-url-text"
		| "railway-pdf"
		| "railway-text"
		| "fallback";
};

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
		// Pull text from the document source (PDF parse, text URL, or data URL).
		// Falls back to the filename when nothing else works so the pipeline can
		// still log a structured failure.
		const extracted = await loadDocumentTextWithFallback(
			doc.storagePath,
			doc.fileName,
		);
		const documentText = extracted.text;

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

		// HIPAA: processing a medical document creates PHI-containing rows.
		// Log once per completed processing run as a modification event.
		await logPhiModification({
			organizationId,
			userId: null,
			entityType: "document",
			entityId: documentId,
			caseId: doc.caseId,
			operation: "create",
			severity: "info",
			action: "phi_create.document_processed",
			metadata: {
				extractionType,
				extractionCount: result.extractions.length,
				processingId: processing.id,
			},
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
 * Truncate a string to at most MAX_EXTRACTED_CHARS characters so we never
 * send a giant document body to an LLM by accident.
 */
function truncateForLLM(text: string): string {
	if (text.length <= MAX_EXTRACTED_CHARS) return text;
	return `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n[...truncated at ${MAX_EXTRACTED_CHARS} chars]`;
}

/**
 * Parse a PDF buffer with pdf-parse (v2.x class-based API).
 * Returns both the concatenated text and the page count.
 */
async function parsePdfBuffer(
	buffer: ArrayBuffer | Uint8Array,
): Promise<{ text: string; pageCount: number }> {
	const data =
		buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	const parser = new PDFParse({ data });
	try {
		const result = await parser.getText();
		return {
			text: result.text ?? "",
			pageCount: result.total ?? result.pages?.length ?? 0,
		};
	} finally {
		await parser.destroy().catch(() => {});
	}
}

/**
 * Extract text from a document's storagePath.
 *
 * Supports:
 * - http(s):// URLs (PDF or text/plain)
 * - data:... URLs (base64 PDFs or text)
 * - .txt file URLs
 *
 * Returns null on unrecoverable failure. Callers should handle gracefully.
 * Text is truncated to MAX_EXTRACTED_CHARS for LLM safety.
 */
export async function loadDocumentText(
	storagePath: string,
	fileName: string,
): Promise<ExtractedDocumentText | null> {
	const lowerPath = storagePath.toLowerCase();
	const lowerName = fileName.toLowerCase();

	// 0. railway:// storage paths — sign and recurse through the http path
	if (storagePath.startsWith(RAILWAY_STORAGE_PREFIX)) {
		try {
			const signedUrl = await getRailwaySignedUrl(storagePath, 600);
			const result = await loadDocumentText(signedUrl, fileName);
			if (!result) return null;
			// Relabel the source so callers can tell it came from Railway.
			if (result.source === "http-pdf") {
				return { ...result, source: "railway-pdf" };
			}
			if (result.source === "http-text") {
				return { ...result, source: "railway-text" };
			}
			return result;
		} catch (err) {
			logger.error("Railway storage fetch failed", {
				fileName,
				storagePath: storagePath.slice(0, 120),
				error: err,
			});
			return null;
		}
	}

	// 1. data: URLs (base64-encoded PDFs or text)
	if (storagePath.startsWith("data:")) {
		try {
			const commaIdx = storagePath.indexOf(",");
			if (commaIdx === -1) return null;
			const meta = storagePath.slice(5, commaIdx); // strip "data:"
			const payload = storagePath.slice(commaIdx + 1);
			const isBase64 = meta.includes(";base64");
			const mimeType = meta.split(";")[0] || "";
			const isPdf =
				mimeType === "application/pdf" ||
				mimeType === "application/x-pdf" ||
				lowerName.endsWith(".pdf");

			if (isPdf) {
				const buffer = Buffer.from(
					payload,
					isBase64 ? "base64" : "utf-8",
				);
				const { text, pageCount } = await parsePdfBuffer(buffer);
				const truncated = truncateForLLM(text);
				logger.info("PDF text extracted (data URL)", {
					fileName,
					fileSize: buffer.byteLength,
					totalChars: truncated.length,
					pageCount,
				});
				return {
					text: truncated,
					fileSize: buffer.byteLength,
					totalChars: truncated.length,
					pageCount,
					source: "data-url-pdf",
				};
			}

			// Treat anything else as text
			const raw = isBase64
				? Buffer.from(payload, "base64").toString("utf-8")
				: decodeURIComponent(payload);
			const truncated = truncateForLLM(raw);
			return {
				text: truncated,
				fileSize: Buffer.byteLength(raw, "utf-8"),
				totalChars: truncated.length,
				source: "data-url-text",
			};
		} catch (error) {
			logger.error("Failed to parse data URL document", { fileName, error });
			return null;
		}
	}

	// 2. http(s):// URLs
	if (lowerPath.startsWith("http://") || lowerPath.startsWith("https://")) {
		try {
			const response = await fetch(storagePath);
			if (!response.ok) {
				logger.warn("Document fetch returned non-OK", {
					fileName,
					status: response.status,
				});
				return null;
			}

			const contentType = (
				response.headers.get("content-type") || ""
			).toLowerCase();

			// Text-y content types
			if (
				contentType.includes("text/") ||
				contentType.includes("application/json") ||
				lowerPath.endsWith(".txt") ||
				lowerName.endsWith(".txt")
			) {
				const raw = await response.text();
				const truncated = truncateForLLM(raw);
				logger.info("Text document fetched", {
					fileName,
					fileSize: Buffer.byteLength(raw, "utf-8"),
					totalChars: truncated.length,
				});
				return {
					text: truncated,
					fileSize: Buffer.byteLength(raw, "utf-8"),
					totalChars: truncated.length,
					source: "http-text",
				};
			}

			// PDF (by content-type or extension)
			const isPdf =
				contentType.includes("application/pdf") ||
				contentType.includes("application/x-pdf") ||
				lowerPath.endsWith(".pdf") ||
				lowerName.endsWith(".pdf");

			if (isPdf) {
				const arrayBuffer = await response.arrayBuffer();
				const { text, pageCount } = await parsePdfBuffer(arrayBuffer);
				const truncated = truncateForLLM(text);
				logger.info("PDF text extracted", {
					fileName,
					fileSize: arrayBuffer.byteLength,
					totalChars: truncated.length,
					pageCount,
				});
				return {
					text: truncated,
					fileSize: arrayBuffer.byteLength,
					totalChars: truncated.length,
					pageCount,
					source: "http-pdf",
				};
			}

			// Unknown binary — give up, caller will log.
			logger.warn("Unsupported document content-type", {
				fileName,
				contentType,
			});
			return null;
		} catch (error) {
			logger.error("Document fetch/parse failed", { fileName, error });
			return null;
		}
	}

	// 3. Pending / local storage placeholder — nothing to extract yet.
	return null;
}

/**
 * Try PDF parsing first; if that fails, fall back to extension-based detection
 * (treat .txt as text, anything else returns a filename-only stub so the
 * pipeline can still log a structured failure upstream).
 */
export async function loadDocumentTextWithFallback(
	storagePath: string,
	fileName: string,
): Promise<ExtractedDocumentText> {
	const extracted = await loadDocumentText(storagePath, fileName);
	if (extracted && extracted.text && extracted.text.trim().length > 0) {
		return extracted;
	}

	logger.warn("Falling back to filename-only document text", {
		fileName,
		storagePath: storagePath.slice(0, 120),
	});

	return {
		text: fileName,
		fileSize: Buffer.byteLength(fileName, "utf-8"),
		totalChars: fileName.length,
		source: "fallback",
	};
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
