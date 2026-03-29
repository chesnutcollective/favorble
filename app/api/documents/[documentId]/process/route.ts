import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import { documents, documentProcessingResults } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ documentId: string }> };

/**
 * POST /api/documents/[documentId]/process — Trigger document processing.
 */
export async function POST(
	_request: NextRequest,
	context: RouteContext,
) {
	try {
		const session = await requireSession();
		const { documentId } = await context.params;

		// Verify the document exists and belongs to the user's organization
		const [doc] = await db
			.select({
				id: documents.id,
				caseId: documents.caseId,
				organizationId: documents.organizationId,
				fileName: documents.fileName,
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
			return NextResponse.json(
				{ error: "Document not found" },
				{ status: 404 },
			);
		}

		// Create a processing result record in "pending" state
		const [processingResult] = await db
			.insert(documentProcessingResults)
			.values({
				organizationId: session.organizationId,
				documentId,
				caseId: doc.caseId,
				status: "pending",
			})
			.returning({ id: documentProcessingResults.id });

		logger.info("Document processing triggered", {
			documentId,
			processingId: processingResult.id,
			fileName: doc.fileName,
		});

		// TODO: Trigger actual document processing pipeline
		// This would typically enqueue a background job that:
		// 1. Extracts text (OCR if needed)
		// 2. Classifies document type
		// 3. Identifies provider, treatment dates, etc.
		// 4. Updates the processing result with extracted data
		// 5. Generates medical chronology entries

		return NextResponse.json({
			success: true,
			processingId: processingResult.id,
		});
	} catch (error) {
		logger.error("Document processing trigger error", { error });
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
