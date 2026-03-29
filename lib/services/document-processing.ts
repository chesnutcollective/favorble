import "server-only";

import { db } from "@/db/drizzle";
import { createClient } from "@/db/server";
import { documentProcessingResults } from "@/db/schema/document-processing";
import { documents } from "@/db/schema/documents";
import { classifyDocument } from "@/lib/ai/client";
import { logger } from "@/lib/logger/server";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProcessDocumentParams {
	documentId: string;
	caseId: string;
	organizationId: string;
	storagePath: string;
	fileType: string;
}

interface ProcessDocumentResult {
	success: boolean;
	processingResultId?: string;
	error?: string;
}

const DOCUMENTS_BUCKET = "documents";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Full document processing pipeline:
 * 1. Create pending processing result row
 * 2. Download document from Supabase Storage
 * 3. Extract text (PDF parsing)
 * 4. Classify via AI
 * 5. Store results
 */
export async function processDocument(
	params: ProcessDocumentParams,
): Promise<ProcessDocumentResult> {
	const startTime = Date.now();
	let processingResultId: string | undefined;

	try {
		// 1. Create pending row
		const [row] = await db
			.insert(documentProcessingResults)
			.values({
				organizationId: params.organizationId,
				documentId: params.documentId,
				caseId: params.caseId,
				status: "pending",
			})
			.returning({ id: documentProcessingResults.id });

		processingResultId = row.id;

		// 2–3. Extract text
		await db
			.update(documentProcessingResults)
			.set({ status: "extracting", updatedAt: new Date() })
			.where(eq(documentProcessingResults.id, processingResultId));

		const { text, pageCount } = await extractText(
			params.storagePath,
			params.fileType,
		);

		if (!text || text.trim().length === 0) {
			await db
				.update(documentProcessingResults)
				.set({
					status: "completed",
					extractedText: "",
					pageCount: pageCount ?? 0,
					processingTimeMs: Date.now() - startTime,
					updatedAt: new Date(),
				})
				.where(eq(documentProcessingResults.id, processingResultId));

			logger.info("Document processed (no extractable text)", {
				documentId: params.documentId,
			});
			return { success: true, processingResultId };
		}

		// 4. Classify via AI
		await db
			.update(documentProcessingResults)
			.set({ status: "classifying", updatedAt: new Date() })
			.where(eq(documentProcessingResults.id, processingResultId));

		const doc = await db.query.documents.findFirst({
			where: eq(documents.id, params.documentId),
			columns: { fileName: true, fileType: true },
		});

		const classification = await classifyDocument(text, {
			fileType: params.fileType,
			fileName: doc?.fileName,
		});

		// 5. Store results
		await db
			.update(documentProcessingResults)
			.set({
				status: "completed",
				extractedText: text,
				pageCount,
				documentCategory: classification.category,
				providerName: classification.providerName,
				providerType: classification.providerType,
				treatmentDateStart: classification.dateStart
					? new Date(classification.dateStart)
					: null,
				treatmentDateEnd: classification.dateEnd
					? new Date(classification.dateEnd)
					: null,
				aiClassification: classification,
				aiConfidence: classification.confidence,
				processingTimeMs: Date.now() - startTime,
				updatedAt: new Date(),
			})
			.where(eq(documentProcessingResults.id, processingResultId));

		logger.info("Document processed successfully", {
			documentId: params.documentId,
			category: classification.category,
			confidence: classification.confidence,
			processingTimeMs: Date.now() - startTime,
		});

		return { success: true, processingResultId };
	} catch (error) {
		logger.error("Document processing failed", error, {
			documentId: params.documentId,
		});

		if (processingResultId) {
			await db
				.update(documentProcessingResults)
				.set({
					status: "failed",
					errorMessage:
						error instanceof Error ? error.message : "Unknown error",
					processingTimeMs: Date.now() - startTime,
					updatedAt: new Date(),
				})
				.where(eq(documentProcessingResults.id, processingResultId))
				.catch((updateErr) => {
					logger.error(
						"Failed to update processing result to failed status",
						updateErr,
					);
				});
		}

		return {
			success: false,
			processingResultId,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Download a document from Supabase Storage and extract text content.
 */
export async function extractText(
	storagePath: string,
	fileType: string,
): Promise<{ text: string | null; pageCount: number | null }> {
	const supabase = await createClient();

	const { data, error } = await supabase.storage
		.from(DOCUMENTS_BUCKET)
		.download(storagePath);

	if (error) {
		throw new Error(`Failed to download document: ${error.message}`);
	}

	if (!data) {
		throw new Error("Downloaded document is empty");
	}

	const buffer = Buffer.from(await data.arrayBuffer());

	if (
		fileType === "application/pdf" ||
		fileType === "pdf" ||
		storagePath.endsWith(".pdf")
	) {
		// Dynamic import to avoid bundling pdf-parse in the client
		const { PDFParse } = await import("pdf-parse");
		const parser = new PDFParse({ data: new Uint8Array(buffer) });
		const textResult = await parser.getText();
		const pageCount = textResult.total ?? null;
		const text = textResult.text ?? "";
		await parser.destroy();
		return { text, pageCount };
	}

	// Plain text / other text-based formats
	if (
		fileType.startsWith("text/") ||
		fileType === "txt" ||
		storagePath.endsWith(".txt")
	) {
		return { text: buffer.toString("utf-8"), pageCount: null };
	}

	// Unsupported format — return null text so caller can decide
	logger.warn("Unsupported file type for text extraction", {
		fileType,
		storagePath,
	});
	return { text: null, pageCount: null };
}
