import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { cases } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger/server";
import { logPhiAccess } from "@/lib/services/hipaa-audit";
import { renderBoardPacketPdf } from "@/lib/pdf/board-packet";

type RouteContext = { params: Promise<{ caseId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requireSession();
    const { caseId } = await context.params;

    // Authorize: case must belong to the caller's organization.
    const [caseRow] = await db
      .select({ id: cases.id, caseNumber: cases.caseNumber })
      .from(cases)
      .where(
        and(eq(cases.id, caseId), eq(cases.organizationId, session.organizationId)),
      )
      .limit(1);

    if (!caseRow) {
      // Both "not in this org" and "doesn't exist" collapse to 404 to avoid
      // leaking which case IDs are valid cross-tenant.
      return new NextResponse("Case not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const pdfBuffer = await renderBoardPacketPdf(
      caseId,
      session.organizationId,
    );
    if (!pdfBuffer) {
      return new NextResponse("Case not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // HIPAA: a board packet contains medical chronology + doc index.
    await logPhiAccess({
      organizationId: session.organizationId,
      userId: session.id,
      entityType: "case",
      entityId: caseId,
      caseId,
      fieldsAccessed: ["medical_chronology", "documents_index"],
      reason: "board packet pdf download",
      severity: "info",
      action: "board_packet_pdf_downloaded",
      metadata: {
        caseNumber: caseRow.caseNumber,
      },
    });

    const safeNumber = caseRow.caseNumber.replace(/[^A-Za-z0-9_-]/g, "_");
    const body = new Uint8Array(pdfBuffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="board-packet-${safeNumber}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logger.error("Board packet PDF generation failed", { error });
    return new NextResponse("Failed to generate board packet PDF", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
