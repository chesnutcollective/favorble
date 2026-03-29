import "server-only";

import { db } from "@/db/drizzle";
import { createClient } from "@/db/server";
import {
  exhibitPackets,
  exhibitPacketDocuments,
} from "@/db/schema/medical-chronology";
import { documents } from "@/db/schema/documents";
import { logger } from "@/lib/logger/server";
import { eq, asc } from "drizzle-orm";

const DOCUMENTS_BUCKET = "documents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BuildExhibitPacketResult {
  success: boolean;
  storagePath?: string;
  packetSizeBytes?: number;
  error?: string;
}

interface TocEntry {
  exhibitLabel: string;
  documentName: string;
  startPage: number;
  endPage: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an exhibit packet:
 * 1. Fetch packet and its documents ordered by displayOrder
 * 2. Download each document PDF from Supabase Storage
 * 3. Use pdf-lib to merge into a single PDF
 * 4. Add Bates stamp numbers to each page footer
 * 5. Generate a table of contents as the first pages
 * 6. Upload final PDF to Supabase Storage
 * 7. Update packet record
 */
export async function buildExhibitPacket(
  packetId: string,
): Promise<BuildExhibitPacketResult> {
  try {
    // Update status to building
    await db
      .update(exhibitPackets)
      .set({ status: "building", updatedAt: new Date() })
      .where(eq(exhibitPackets.id, packetId));

    // 1. Fetch packet and associated documents
    const packet = await db.query.exhibitPackets.findFirst({
      where: eq(exhibitPackets.id, packetId),
    });

    if (!packet) {
      throw new Error(`Exhibit packet not found: ${packetId}`);
    }

    const packetDocs = await db
      .select({
        packetDocId: exhibitPacketDocuments.id,
        documentId: exhibitPacketDocuments.documentId,
        exhibitLabel: exhibitPacketDocuments.exhibitLabel,
        displayOrder: exhibitPacketDocuments.displayOrder,
        notes: exhibitPacketDocuments.notes,
      })
      .from(exhibitPacketDocuments)
      .where(eq(exhibitPacketDocuments.packetId, packetId))
      .orderBy(asc(exhibitPacketDocuments.displayOrder));

    if (packetDocs.length === 0) {
      throw new Error("Exhibit packet has no documents");
    }

    // Look up document metadata
    const docIds = packetDocs.map((d) => d.documentId);
    const docRows = await Promise.all(
      docIds.map((id) =>
        db.query.documents.findFirst({
          where: eq(documents.id, id),
          columns: {
            id: true,
            fileName: true,
            storagePath: true,
          },
        }),
      ),
    );
    const docMap = new Map(docRows.filter(Boolean).map((d) => [d!.id, d!]));

    // 2. Download each PDF
    const supabase = await createClient();
    const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
    const mergedPdf = await PDFDocument.create();

    const tocEntries: TocEntry[] = [];
    let currentPage = 1; // Will be offset after TOC is prepended

    for (const packetDoc of packetDocs) {
      const doc = docMap.get(packetDoc.documentId);
      if (!doc) {
        logger.warn("Document not found for exhibit packet", {
          documentId: packetDoc.documentId,
          packetId,
        });
        continue;
      }

      const { data, error } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .download(doc.storagePath);

      if (error || !data) {
        logger.warn("Failed to download document for exhibit packet", {
          documentId: doc.id,
          storagePath: doc.storagePath,
          error: error?.message,
        });
        continue;
      }

      const pdfBytes = new Uint8Array(await data.arrayBuffer());

      let sourcePdf: Awaited<ReturnType<typeof PDFDocument.load>>;
      try {
        sourcePdf = await PDFDocument.load(pdfBytes);
      } catch (loadErr) {
        logger.warn("Failed to load PDF for exhibit packet", {
          documentId: doc.id,
          error: loadErr instanceof Error ? loadErr.message : "Invalid PDF",
        });
        continue;
      }

      const pageIndices = sourcePdf.getPageIndices();
      const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndices);

      const startPage = currentPage;
      for (const page of copiedPages) {
        mergedPdf.addPage(page);
        currentPage++;
      }
      const endPage = currentPage - 1;

      tocEntries.push({
        exhibitLabel:
          packetDoc.exhibitLabel ??
          `Exhibit ${packetDocs.indexOf(packetDoc) + 1}`,
        documentName: doc.fileName,
        startPage,
        endPage,
      });

      // Update page tracking on the packet document row
      await db
        .update(exhibitPacketDocuments)
        .set({ startPage, endPage })
        .where(eq(exhibitPacketDocuments.id, packetDoc.packetDocId));
    }

    if (mergedPdf.getPageCount() === 0) {
      throw new Error("No valid PDF documents to merge");
    }

    // 4. Add Bates stamp numbers to each page footer
    const helvetica = await mergedPdf.embedFont(StandardFonts.Helvetica);
    const pages = mergedPdf.getPages();
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const batesNumber = String(i + 1).padStart(6, "0");
      const { width } = page.getSize();
      page.drawText(batesNumber, {
        x: width / 2 - 20,
        y: 15,
        size: 9,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
      });
    }

    // 5. Generate table of contents as first pages
    const tocPdf = await PDFDocument.create();
    const tocFont = await tocPdf.embedFont(StandardFonts.Helvetica);
    const tocFontBold = await tocPdf.embedFont(StandardFonts.HelveticaBold);
    let tocPage = tocPdf.addPage([612, 792]); // US Letter
    let yPos = 740;

    tocPage.drawText("Table of Contents", {
      x: 50,
      y: yPos,
      size: 18,
      font: tocFontBold,
      color: rgb(0, 0, 0),
    });
    yPos -= 10;

    tocPage.drawText(packet.title, {
      x: 50,
      y: yPos,
      size: 11,
      font: tocFont,
      color: rgb(0.4, 0.4, 0.4),
    });
    yPos -= 30;

    for (const entry of tocEntries) {
      if (yPos < 60) {
        tocPage = tocPdf.addPage([612, 792]);
        yPos = 740;
      }

      tocPage.drawText(entry.exhibitLabel, {
        x: 50,
        y: yPos,
        size: 11,
        font: tocFontBold,
        color: rgb(0, 0, 0),
      });

      const pageRange =
        entry.startPage === entry.endPage
          ? `Page ${entry.startPage}`
          : `Pages ${entry.startPage}-${entry.endPage}`;
      tocPage.drawText(pageRange, {
        x: 500,
        y: yPos,
        size: 10,
        font: tocFont,
        color: rgb(0.3, 0.3, 0.3),
      });

      yPos -= 16;

      tocPage.drawText(entry.documentName, {
        x: 70,
        y: yPos,
        size: 10,
        font: tocFont,
        color: rgb(0.3, 0.3, 0.3),
      });

      yPos -= 22;
    }

    // Merge TOC into beginning of final PDF
    const tocBytes = await tocPdf.save();
    const tocLoaded = await PDFDocument.load(tocBytes);
    const tocPageIndices = tocLoaded.getPageIndices();
    const tocCopied = await mergedPdf.copyPages(tocLoaded, tocPageIndices);

    // Insert TOC pages at the beginning
    for (let i = tocCopied.length - 1; i >= 0; i--) {
      mergedPdf.insertPage(0, tocCopied[i]);
    }

    // 6. Upload final PDF to Supabase Storage
    const finalPdfBytes = await mergedPdf.save();
    const storagePath = `${packet.organizationId}/${packet.caseId}/exhibit-packets/${Date.now()}-${packet.title.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(storagePath, finalPdfBytes, {
        cacheControl: "3600",
        upsert: false,
        contentType: "application/pdf",
      });

    if (uploadError) {
      throw new Error(
        `Failed to upload exhibit packet: ${uploadError.message}`,
      );
    }

    // 7. Update packet record
    await db
      .update(exhibitPackets)
      .set({
        status: "ready",
        packetStoragePath: storagePath,
        packetSizeBytes: finalPdfBytes.length,
        tableOfContents: tocEntries,
        builtAt: new Date(),
        updatedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(exhibitPackets.id, packetId));

    logger.info("Exhibit packet built successfully", {
      packetId,
      pageCount: mergedPdf.getPageCount(),
      sizeBytes: finalPdfBytes.length,
    });

    return {
      success: true,
      storagePath,
      packetSizeBytes: finalPdfBytes.length,
    };
  } catch (error) {
    logger.error("Exhibit packet build failed", error, { packetId });

    await db
      .update(exhibitPackets)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        updatedAt: new Date(),
      })
      .where(eq(exhibitPackets.id, packetId))
      .catch((updateErr) => {
        logger.error(
          "Failed to update exhibit packet to failed status",
          updateErr,
        );
      });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
