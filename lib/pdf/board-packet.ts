import "server-only";

import { db } from "@/db/drizzle";
import {
  cases,
  leads,
  medicalChronologyEntries,
  documents,
  organizations,
} from "@/db/schema";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const PAGE_WIDTH = 612; // Letter
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const BODY_FONT_SIZE = 11;
const SMALL_FONT_SIZE = 9;
const HEADER_FONT_SIZE = 20;
const SECTION_FONT_SIZE = 13;

const COLOR_TEXT = rgb(0.1, 0.1, 0.12);
const COLOR_MUTED = rgb(0.42, 0.44, 0.5);
const COLOR_RULE = rgb(0.82, 0.83, 0.86);
const COLOR_ACCENT = rgb(0.149, 0.235, 0.58); // brand-ish navy

function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

type DrawContext = {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
  doc: PDFDocument;
};

function newPage(ctx: DrawContext): DrawContext {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  return { ...ctx, page, y: PAGE_HEIGHT - MARGIN };
}

function ensureSpace(ctx: DrawContext, needed: number): DrawContext {
  if (ctx.y - needed < MARGIN) {
    return newPage(ctx);
  }
  return ctx;
}

function drawSectionLabel(ctx: DrawContext, label: string): DrawContext {
  ctx = ensureSpace(ctx, SECTION_FONT_SIZE + 12);
  ctx.page.drawText(label, {
    x: MARGIN,
    y: ctx.y,
    size: SECTION_FONT_SIZE,
    font: ctx.bold,
    color: COLOR_ACCENT,
  });
  ctx.y -= SECTION_FONT_SIZE + 4;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness: 0.5,
    color: COLOR_RULE,
  });
  ctx.y -= 10;
  return ctx;
}

/**
 * Build a board-packet PDF for a single case. Includes a one-page exec
 * summary (claimant, key SSA fields, chronology overview) then a chronology
 * table and a key-documents index on subsequent pages.
 *
 * The function is self-contained — it queries the DB by `caseId` + `orgId`
 * so the caller only needs authorization context. Returns empty when the
 * case doesn't belong to the given org so the route handler can 404.
 */
export async function renderBoardPacketPdf(
  caseId: string,
  orgId: string,
): Promise<Buffer | null> {
  // ---------- Data pull ----------
  const [caseRow] = await db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
      status: cases.status,
      ssaClaimNumber: cases.ssaClaimNumber,
      ssaOffice: cases.ssaOffice,
      applicationTypePrimary: cases.applicationTypePrimary,
      applicationTypeSecondary: cases.applicationTypeSecondary,
      allegedOnsetDate: cases.allegedOnsetDate,
      dateLastInsured: cases.dateLastInsured,
      hearingOffice: cases.hearingOffice,
      adminLawJudge: cases.adminLawJudge,
      hearingDate: cases.hearingDate,
      dateOfBirth: cases.dateOfBirth,
      chronologyGeneratedAt: cases.chronologyGeneratedAt,
      chronologyEntryCount: cases.chronologyEntryCount,
      createdAt: cases.createdAt,
      claimantFirstName: leads.firstName,
      claimantLastName: leads.lastName,
      claimantEmail: leads.email,
      claimantPhone: leads.phone,
    })
    .from(cases)
    .leftJoin(leads, eq(cases.leadId, leads.id))
    .where(and(eq(cases.id, caseId), eq(cases.organizationId, orgId)))
    .limit(1);

  if (!caseRow) return null;

  const [orgRow] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const chronology = await db
    .select({
      eventDate: medicalChronologyEntries.eventDate,
      entryType: medicalChronologyEntries.entryType,
      providerName: medicalChronologyEntries.providerName,
      facilityName: medicalChronologyEntries.facilityName,
      summary: medicalChronologyEntries.summary,
      diagnoses: medicalChronologyEntries.diagnoses,
      isVerified: medicalChronologyEntries.isVerified,
    })
    .from(medicalChronologyEntries)
    .where(
      and(
        eq(medicalChronologyEntries.caseId, caseId),
        eq(medicalChronologyEntries.organizationId, orgId),
        eq(medicalChronologyEntries.isExcluded, false),
      ),
    )
    .orderBy(asc(medicalChronologyEntries.eventDate));

  const keyDocs = await db
    .select({
      id: documents.id,
      fileName: documents.fileName,
      category: documents.category,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(
      and(
        eq(documents.caseId, caseId),
        eq(documents.organizationId, orgId),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(25);

  // ---------- PDF build ----------
  const doc = await PDFDocument.create();
  doc.setTitle(`Board Packet — ${caseRow.caseNumber}`);
  doc.setProducer("favorble");
  doc.setCreator("favorble");
  doc.setCreationDate(new Date());

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let ctx: DrawContext = { page, font, bold, y: PAGE_HEIGHT - MARGIN, doc };

  // ---------- Header band ----------
  ctx.page.drawText("BOARD PACKET", {
    x: MARGIN,
    y: ctx.y,
    size: SMALL_FONT_SIZE,
    font: bold,
    color: COLOR_MUTED,
  });
  const orgLabel = orgRow?.name ?? "favorble";
  const orgWidth = font.widthOfTextAtSize(orgLabel, SMALL_FONT_SIZE);
  ctx.page.drawText(orgLabel, {
    x: PAGE_WIDTH - MARGIN - orgWidth,
    y: ctx.y,
    size: SMALL_FONT_SIZE,
    font,
    color: COLOR_MUTED,
  });
  ctx.y -= SMALL_FONT_SIZE + 8;

  const claimantName = [caseRow.claimantFirstName, caseRow.claimantLastName]
    .filter(Boolean)
    .join(" ")
    .trim() || "(No claimant on file)";
  ctx.page.drawText(claimantName, {
    x: MARGIN,
    y: ctx.y,
    size: HEADER_FONT_SIZE,
    font: bold,
    color: COLOR_TEXT,
  });
  ctx.y -= HEADER_FONT_SIZE + 2;
  ctx.page.drawText(`Case ${caseRow.caseNumber}`, {
    x: MARGIN,
    y: ctx.y,
    size: BODY_FONT_SIZE,
    font,
    color: COLOR_MUTED,
  });
  ctx.y -= BODY_FONT_SIZE + 14;

  // ---------- Executive Summary ----------
  ctx = drawSectionLabel(ctx, "Executive Summary");

  const summaryRows: Array<[string, string]> = [
    ["Status", caseRow.status],
    ["Date of Birth", formatDate(caseRow.dateOfBirth)],
    ["SSA Claim #", caseRow.ssaClaimNumber ?? "—"],
    ["SSA Office", caseRow.ssaOffice ?? "—"],
    [
      "Application",
      [caseRow.applicationTypePrimary, caseRow.applicationTypeSecondary]
        .filter(Boolean)
        .join(" / ") || "—",
    ],
    ["Alleged Onset", formatDate(caseRow.allegedOnsetDate)],
    ["Date Last Insured", formatDate(caseRow.dateLastInsured)],
    ["Hearing Office", caseRow.hearingOffice ?? "—"],
    ["Admin Law Judge", caseRow.adminLawJudge ?? "—"],
    ["Hearing Date", formatDate(caseRow.hearingDate)],
  ];

  const labelColW = 140;
  for (const [label, value] of summaryRows) {
    ctx = ensureSpace(ctx, BODY_FONT_SIZE + 4);
    ctx.page.drawText(label, {
      x: MARGIN,
      y: ctx.y,
      size: BODY_FONT_SIZE,
      font,
      color: COLOR_MUTED,
    });
    const valueLines = wrapText(
      value,
      font,
      BODY_FONT_SIZE,
      PAGE_WIDTH - MARGIN * 2 - labelColW,
    );
    for (let i = 0; i < valueLines.length; i++) {
      if (i > 0) {
        ctx.y -= BODY_FONT_SIZE + 3;
        ctx = ensureSpace(ctx, BODY_FONT_SIZE + 4);
      }
      ctx.page.drawText(valueLines[i], {
        x: MARGIN + labelColW,
        y: ctx.y,
        size: BODY_FONT_SIZE,
        font: i === 0 ? bold : font,
        color: COLOR_TEXT,
      });
    }
    ctx.y -= BODY_FONT_SIZE + 5;
  }

  ctx.y -= 6;
  ctx = ensureSpace(ctx, BODY_FONT_SIZE + 6);
  const chronSummary =
    chronology.length === 0
      ? "No medical chronology entries on file."
      : `${chronology.length} medical chronology entr${
          chronology.length === 1 ? "y" : "ies"
        } on file — verified: ${
          chronology.filter((c) => c.isVerified).length
        }. Last generated: ${formatDate(caseRow.chronologyGeneratedAt)}.`;
  const chronLines = wrapText(
    chronSummary,
    font,
    BODY_FONT_SIZE,
    PAGE_WIDTH - MARGIN * 2,
  );
  for (const line of chronLines) {
    ctx = ensureSpace(ctx, BODY_FONT_SIZE + 4);
    ctx.page.drawText(line, {
      x: MARGIN,
      y: ctx.y,
      size: BODY_FONT_SIZE,
      font,
      color: COLOR_TEXT,
    });
    ctx.y -= BODY_FONT_SIZE + 3;
  }

  // ---------- Medical Chronology ----------
  // Start on a new page for readability
  ctx = newPage(ctx);
  ctx = drawSectionLabel(ctx, "Medical Chronology");

  if (chronology.length === 0) {
    ctx.page.drawText("No chronology entries to display.", {
      x: MARGIN,
      y: ctx.y,
      size: BODY_FONT_SIZE,
      font,
      color: COLOR_MUTED,
    });
    ctx.y -= BODY_FONT_SIZE + 8;
  } else {
    const dateX = MARGIN;
    const providerX = MARGIN + 80;
    const summaryX = MARGIN + 220;
    const dateW = providerX - dateX - 6;
    const providerW = summaryX - providerX - 6;
    const summaryW = PAGE_WIDTH - MARGIN - summaryX;

    // Table header
    ctx.page.drawText("DATE", {
      x: dateX,
      y: ctx.y,
      size: SMALL_FONT_SIZE,
      font: bold,
      color: COLOR_MUTED,
    });
    ctx.page.drawText("PROVIDER", {
      x: providerX,
      y: ctx.y,
      size: SMALL_FONT_SIZE,
      font: bold,
      color: COLOR_MUTED,
    });
    ctx.page.drawText("SUMMARY", {
      x: summaryX,
      y: ctx.y,
      size: SMALL_FONT_SIZE,
      font: bold,
      color: COLOR_MUTED,
    });
    ctx.y -= SMALL_FONT_SIZE + 6;
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
      thickness: 0.25,
      color: COLOR_RULE,
    });
    ctx.y -= 8;

    for (const entry of chronology) {
      const dateStr = formatDate(entry.eventDate);
      const provider =
        entry.providerName ?? entry.facilityName ?? entry.entryType;
      const providerLines = wrapText(provider, font, SMALL_FONT_SIZE, providerW);
      const summaryLines = wrapText(entry.summary, font, SMALL_FONT_SIZE, summaryW);
      const rowLines = Math.max(providerLines.length, summaryLines.length, 1);
      const rowHeight = rowLines * (SMALL_FONT_SIZE + 2) + 6;
      ctx = ensureSpace(ctx, rowHeight);

      const rowTop = ctx.y;
      ctx.page.drawText(dateStr, {
        x: dateX,
        y: rowTop,
        size: SMALL_FONT_SIZE,
        font,
        color: COLOR_TEXT,
        maxWidth: dateW,
      });
      for (let i = 0; i < providerLines.length; i++) {
        ctx.page.drawText(providerLines[i], {
          x: providerX,
          y: rowTop - i * (SMALL_FONT_SIZE + 2),
          size: SMALL_FONT_SIZE,
          font: i === 0 ? bold : font,
          color: COLOR_TEXT,
        });
      }
      for (let i = 0; i < summaryLines.length; i++) {
        ctx.page.drawText(summaryLines[i], {
          x: summaryX,
          y: rowTop - i * (SMALL_FONT_SIZE + 2),
          size: SMALL_FONT_SIZE,
          font,
          color: COLOR_TEXT,
        });
      }
      ctx.y -= rowLines * (SMALL_FONT_SIZE + 2) + 4;
      ctx.page.drawLine({
        start: { x: MARGIN, y: ctx.y },
        end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
        thickness: 0.15,
        color: COLOR_RULE,
      });
      ctx.y -= 4;
    }
  }

  // ---------- Key Documents Index ----------
  ctx.y -= 10;
  ctx = ensureSpace(ctx, 60);
  ctx = drawSectionLabel(ctx, "Key Documents Index");

  if (keyDocs.length === 0) {
    ctx.page.drawText("No documents attached to this case.", {
      x: MARGIN,
      y: ctx.y,
      size: BODY_FONT_SIZE,
      font,
      color: COLOR_MUTED,
    });
  } else {
    for (const d of keyDocs) {
      ctx = ensureSpace(ctx, BODY_FONT_SIZE + 6);
      const left = `${formatDate(d.createdAt)}  ·  ${d.category ?? "uncategorized"}`;
      const leftWidth = font.widthOfTextAtSize(left, SMALL_FONT_SIZE);
      ctx.page.drawText(left, {
        x: MARGIN,
        y: ctx.y,
        size: SMALL_FONT_SIZE,
        font,
        color: COLOR_MUTED,
      });
      const nameMax = PAGE_WIDTH - MARGIN * 2 - leftWidth - 12;
      const nameLines = wrapText(d.fileName, font, SMALL_FONT_SIZE, nameMax);
      ctx.page.drawText(nameLines[0], {
        x: MARGIN + leftWidth + 12,
        y: ctx.y,
        size: SMALL_FONT_SIZE,
        font: bold,
        color: COLOR_TEXT,
      });
      ctx.y -= SMALL_FONT_SIZE + 5;
      for (let i = 1; i < nameLines.length; i++) {
        ctx = ensureSpace(ctx, SMALL_FONT_SIZE + 4);
        ctx.page.drawText(nameLines[i], {
          x: MARGIN + leftWidth + 12,
          y: ctx.y,
          size: SMALL_FONT_SIZE,
          font,
          color: COLOR_TEXT,
        });
        ctx.y -= SMALL_FONT_SIZE + 3;
      }
    }
  }

  // ---------- Footer on every page ----------
  const pages = doc.getPages();
  const footerText = `${orgLabel} · Board packet · ${caseRow.caseNumber} · Generated ${formatDate(new Date())}`;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const label = `${footerText}   Page ${i + 1} of ${pages.length}`;
    const w = font.widthOfTextAtSize(label, 8);
    p.drawText(label, {
      x: (PAGE_WIDTH - w) / 2,
      y: MARGIN / 2,
      size: 8,
      font,
      color: COLOR_MUTED,
    });
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
