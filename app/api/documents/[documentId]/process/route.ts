import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { requireSession } from "@/lib/auth/session";
import { processDocument } from "@/lib/services/document-processor";

type RouteContext = { params: Promise<{ documentId: string }> };

/**
 * POST /api/documents/[documentId]/process — Trigger document processing.
 * Sends the document through LangExtract and saves structured results.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const { documentId } = await context.params;

    const url = new URL(request.url);
    const extractionType = (url.searchParams.get("type") ??
      "medical_record") as
      | "medical_record"
      | "status_report"
      | "decision_letter"
      | "efolder_classification";

    const result = await processDocument({
      documentId,
      organizationId: session.organizationId,
      extractionType,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Processing failed", processingId: result.processingId },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      processingId: result.processingId,
    });
  } catch (error) {
    logger.error("Document processing trigger error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
