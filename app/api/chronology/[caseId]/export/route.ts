import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger/server";
import { db } from "@/db/drizzle";
import { medicalChronologyEntries, cases, documents } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";

type RouteContext = { params: Promise<{ caseId: string }> };

/**
 * Escape a CSV field value.
 */
function csvEscape(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * GET /api/chronology/[caseId]/export?format=csv|json
 *
 * Export chronology entries for a case as CSV or JSON.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    const { caseId } = await context.params;
    const format = request.nextUrl.searchParams.get("format") ?? "csv";

    // Verify the case belongs to the user's organization
    const [caseRow] = await db
      .select({ id: cases.id, caseNumber: cases.caseNumber })
      .from(cases)
      .where(
        and(
          eq(cases.id, caseId),
          eq(cases.organizationId, session.organizationId),
        ),
      )
      .limit(1);

    if (!caseRow) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const entries = await db
      .select({
        eventDate: medicalChronologyEntries.eventDate,
        providerName: medicalChronologyEntries.providerName,
        entryType: medicalChronologyEntries.entryType,
        summary: medicalChronologyEntries.summary,
        diagnoses: medicalChronologyEntries.diagnoses,
        treatments: medicalChronologyEntries.treatments,
        medications: medicalChronologyEntries.medications,
        sourceDocumentName: documents.fileName,
        pageReference: medicalChronologyEntries.pageReference,
        isVerified: medicalChronologyEntries.isVerified,
      })
      .from(medicalChronologyEntries)
      .leftJoin(
        documents,
        eq(medicalChronologyEntries.sourceDocumentId, documents.id),
      )
      .where(
        and(
          eq(medicalChronologyEntries.caseId, caseId),
          eq(medicalChronologyEntries.organizationId, session.organizationId),
          eq(medicalChronologyEntries.isExcluded, false),
        ),
      )
      .orderBy(asc(medicalChronologyEntries.eventDate));

    if (format === "json") {
      const jsonData = entries.map((e) => ({
        date: e.eventDate?.toISOString().split("T")[0] ?? "",
        provider: e.providerName ?? "",
        type: e.entryType,
        summary: e.summary,
        diagnoses: e.diagnoses ?? [],
        treatments: e.treatments ?? [],
        medications: e.medications ?? [],
        sourceDocument: e.sourceDocumentName ?? "",
        pageReference: e.pageReference ?? "",
        verified: e.isVerified,
      }));

      const fileName = `chronology-${caseRow.caseNumber}.json`;
      return new NextResponse(JSON.stringify(jsonData, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    }

    // Default: CSV
    const csvHeaders = [
      "Date",
      "Provider",
      "Type",
      "Summary",
      "Diagnoses",
      "Treatments",
      "Medications",
      "Source Document",
      "Page Reference",
      "Verified",
    ];

    const csvRows = entries.map((e) =>
      [
        csvEscape(e.eventDate?.toISOString().split("T")[0]),
        csvEscape(e.providerName),
        csvEscape(e.entryType),
        csvEscape(e.summary),
        csvEscape(e.diagnoses?.join("; ")),
        csvEscape(e.treatments?.join("; ")),
        csvEscape(e.medications?.join("; ")),
        csvEscape(e.sourceDocumentName),
        csvEscape(e.pageReference),
        csvEscape(e.isVerified ? "Yes" : "No"),
      ].join(","),
    );

    const csvContent = [csvHeaders.join(","), ...csvRows].join("\n");
    const fileName = `chronology-${caseRow.caseNumber}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    logger.error("Chronology export error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
