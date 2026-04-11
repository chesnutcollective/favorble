"use server";

import { db } from "@/db/drizzle";
import { documents } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger/server";
import {
	loadDocumentTextWithFallback,
	processDocument,
} from "@/lib/services/document-processor";
import type { ExtractionType } from "@/lib/integrations/langextract";

const PREVIEW_CHAR_LIMIT = 5_000;

type ExtractStats = {
	fileSize: number;
	totalChars: number;
	pageCount?: number;
	source: string;
};

type ExtractDocumentTextResult =
	| {
			success: true;
			text: string;
			truncated: boolean;
			stats: ExtractStats;
	  }
	| { success: false; error: string };

/**
 * Server action: extract raw text from a document and return a preview
 * (first PREVIEW_CHAR_LIMIT chars) plus stats about the extraction.
 * Auth-protected via requireSession().
 */
export async function extractDocumentText(
	documentId: string,
): Promise<ExtractDocumentTextResult> {
	try {
		const session = await requireSession();

		const [doc] = await db
			.select({
				id: documents.id,
				fileName: documents.fileName,
				storagePath: documents.storagePath,
			})
			.from(documents)
			.where(
				and(
					eq(documents.id, documentId),
					eq(documents.organizationId, session.organizationId),
				),
			)
			.limit(1);

		if (!doc) {
			return { success: false, error: "Document not found" };
		}

		const extracted = await loadDocumentTextWithFallback(
			doc.storagePath,
			doc.fileName,
		);

		const truncated = extracted.text.length > PREVIEW_CHAR_LIMIT;
		const preview = truncated
			? extracted.text.slice(0, PREVIEW_CHAR_LIMIT)
			: extracted.text;

		return {
			success: true,
			text: preview,
			truncated,
			stats: {
				fileSize: extracted.fileSize,
				totalChars: extracted.totalChars,
				pageCount: extracted.pageCount,
				source: extracted.source,
			},
		};
	} catch (error) {
		logger.error("extractDocumentText failed", { documentId, error });
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

type TriggerLangExtractResult =
	| { success: true; processingId?: string }
	| { success: false; error: string; processingId?: string };

/**
 * Server action: kick off full LangExtract processing for a document with the
 * specified extraction type. Returns the processing row id on success.
 */
export async function triggerLangExtract(
	documentId: string,
	extractionType: ExtractionType = "medical_record",
): Promise<TriggerLangExtractResult> {
	try {
		const session = await requireSession();

		const result = await processDocument({
			documentId,
			organizationId: session.organizationId,
			extractionType,
		});

		if (!result.success) {
			return {
				success: false,
				error: result.error ?? "Processing failed",
				processingId: result.processingId,
			};
		}

		return { success: true, processingId: result.processingId };
	} catch (error) {
		logger.error("triggerLangExtract failed", { documentId, error });
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}
