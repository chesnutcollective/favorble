import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Minimal org shape used for the letterhead block. Address fields live in
 * `organizations.settings` as optional JSON; we accept them flat here so the
 * caller can pluck whatever it has.
 */
export type InvoicePdfOrg = {
  name: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type InvoicePdfInvoice = {
  invoiceNumber: string;
  status: string;
  issueDate: Date;
  dueDate: Date | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  notes: string | null;
  caseNumber: string | null;
  clientFirstName: string | null;
  clientLastName: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  clientCity?: string | null;
  clientState?: string | null;
  clientZip?: string | null;
};

export type InvoicePdfLineItem = {
  description: string;
  quantity: string | number;
  unitPriceCents: number;
  totalCents: number;
};

const PAGE_WIDTH = 612; // Letter
const PAGE_HEIGHT = 792;
const MARGIN = 54; // 0.75"
const BODY_FONT_SIZE = 11;
const SMALL_FONT_SIZE = 9;
const HEADER_FONT_SIZE = 18;
const SECTION_FONT_SIZE = 12;

const COLOR_TEXT = rgb(0.1, 0.1, 0.12);
const COLOR_MUTED = rgb(0.42, 0.44, 0.5);
const COLOR_RULE = rgb(0.82, 0.83, 0.86);

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Wrap a single line of text so no line exceeds `maxWidth` when rendered
 * with the given font + size. Returns an array of lines.
 */
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

function ensureSpace(ctx: DrawContext, needed: number): DrawContext {
  if (ctx.y - needed < MARGIN) {
    const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    return { ...ctx, page, y: PAGE_HEIGHT - MARGIN };
  }
  return ctx;
}

export async function renderInvoicePdf(
  invoice: InvoicePdfInvoice,
  lineItems: InvoicePdfLineItem[],
  org: InvoicePdfOrg,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${invoice.invoiceNumber}`);
  doc.setProducer("favorble");
  doc.setCreator("favorble");
  doc.setCreationDate(new Date());

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // ---------- Letterhead ----------
  page.drawText(org.name, {
    x: MARGIN,
    y,
    size: HEADER_FONT_SIZE,
    font: bold,
    color: COLOR_TEXT,
  });
  y -= HEADER_FONT_SIZE + 4;

  const orgLines: string[] = [];
  if (org.addressLine1) orgLines.push(org.addressLine1);
  if (org.addressLine2) orgLines.push(org.addressLine2);
  const cityStateZip = [org.city, org.state].filter(Boolean).join(", ");
  const csz = [cityStateZip, org.zip].filter(Boolean).join(" ").trim();
  if (csz) orgLines.push(csz);
  if (org.phone) orgLines.push(`Phone: ${org.phone}`);
  if (org.email) orgLines.push(org.email);
  for (const line of orgLines) {
    page.drawText(line, {
      x: MARGIN,
      y,
      size: SMALL_FONT_SIZE,
      font,
      color: COLOR_MUTED,
    });
    y -= SMALL_FONT_SIZE + 2;
  }

  // Right-aligned invoice title block
  const invoiceLabel = "INVOICE";
  const invoiceLabelWidth = bold.widthOfTextAtSize(invoiceLabel, HEADER_FONT_SIZE);
  page.drawText(invoiceLabel, {
    x: PAGE_WIDTH - MARGIN - invoiceLabelWidth,
    y: PAGE_HEIGHT - MARGIN,
    size: HEADER_FONT_SIZE,
    font: bold,
    color: COLOR_TEXT,
  });

  const metaLines: Array<[string, string]> = [
    ["Invoice #", invoice.invoiceNumber],
    ["Issued", formatDate(invoice.issueDate)],
    ["Due", formatDate(invoice.dueDate)],
    ["Status", invoice.status.toUpperCase()],
  ];
  if (invoice.caseNumber) metaLines.push(["Case", invoice.caseNumber]);

  let metaY = PAGE_HEIGHT - MARGIN - HEADER_FONT_SIZE - 6;
  for (const [label, value] of metaLines) {
    const valueWidth = font.widthOfTextAtSize(value, SMALL_FONT_SIZE);
    const labelWidth = bold.widthOfTextAtSize(`${label}:`, SMALL_FONT_SIZE);
    const rightX = PAGE_WIDTH - MARGIN;
    page.drawText(value, {
      x: rightX - valueWidth,
      y: metaY,
      size: SMALL_FONT_SIZE,
      font,
      color: COLOR_TEXT,
    });
    page.drawText(`${label}:`, {
      x: rightX - valueWidth - 6 - labelWidth,
      y: metaY,
      size: SMALL_FONT_SIZE,
      font: bold,
      color: COLOR_MUTED,
    });
    metaY -= SMALL_FONT_SIZE + 3;
  }

  // Use the lower of (letterhead end, meta end) for the rule position.
  y = Math.min(y, metaY) - 10;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: COLOR_RULE,
  });
  y -= 20;

  // ---------- Bill To ----------
  page.drawText("BILL TO", {
    x: MARGIN,
    y,
    size: SMALL_FONT_SIZE,
    font: bold,
    color: COLOR_MUTED,
  });
  y -= SMALL_FONT_SIZE + 4;

  const clientName = [invoice.clientFirstName, invoice.clientLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (clientName) {
    page.drawText(clientName, {
      x: MARGIN,
      y,
      size: BODY_FONT_SIZE,
      font: bold,
      color: COLOR_TEXT,
    });
    y -= BODY_FONT_SIZE + 2;
  } else {
    page.drawText("(No client on file)", {
      x: MARGIN,
      y,
      size: BODY_FONT_SIZE,
      font,
      color: COLOR_MUTED,
    });
    y -= BODY_FONT_SIZE + 2;
  }

  const clientAddrLines: string[] = [];
  if (invoice.clientAddress) clientAddrLines.push(invoice.clientAddress);
  const clientCsz = [
    [invoice.clientCity, invoice.clientState].filter(Boolean).join(", "),
    invoice.clientZip,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (clientCsz) clientAddrLines.push(clientCsz);
  if (invoice.clientEmail) clientAddrLines.push(invoice.clientEmail);
  for (const line of clientAddrLines) {
    page.drawText(line, {
      x: MARGIN,
      y,
      size: SMALL_FONT_SIZE,
      font,
      color: COLOR_MUTED,
    });
    y -= SMALL_FONT_SIZE + 2;
  }
  y -= 14;

  // ---------- Line Items Table ----------
  const colDesc = MARGIN;
  const colQty = MARGIN + 320;
  const colPrice = MARGIN + 385;
  const colTotal = PAGE_WIDTH - MARGIN;
  const descWidth = colQty - colDesc - 10;

  // Header row
  page.drawRectangle({
    x: MARGIN,
    y: y - 2,
    width: PAGE_WIDTH - MARGIN * 2,
    height: SECTION_FONT_SIZE + 8,
    color: rgb(0.96, 0.97, 0.99),
  });

  const headerY = y + 4;
  page.drawText("DESCRIPTION", {
    x: colDesc + 6,
    y: headerY,
    size: SMALL_FONT_SIZE,
    font: bold,
    color: COLOR_MUTED,
  });
  const qtyLabel = "QTY";
  const priceLabel = "PRICE";
  const totalLabel = "AMOUNT";
  const qtyLabelWidth = bold.widthOfTextAtSize(qtyLabel, SMALL_FONT_SIZE);
  const priceLabelWidth = bold.widthOfTextAtSize(priceLabel, SMALL_FONT_SIZE);
  const totalLabelWidth = bold.widthOfTextAtSize(totalLabel, SMALL_FONT_SIZE);
  page.drawText(qtyLabel, {
    x: colQty + 50 - qtyLabelWidth,
    y: headerY,
    size: SMALL_FONT_SIZE,
    font: bold,
    color: COLOR_MUTED,
  });
  page.drawText(priceLabel, {
    x: colPrice + 60 - priceLabelWidth,
    y: headerY,
    size: SMALL_FONT_SIZE,
    font: bold,
    color: COLOR_MUTED,
  });
  page.drawText(totalLabel, {
    x: colTotal - totalLabelWidth - 6,
    y: headerY,
    size: SMALL_FONT_SIZE,
    font: bold,
    color: COLOR_MUTED,
  });
  y -= SECTION_FONT_SIZE + 14;

  let ctx: DrawContext = { page, font, bold, y, doc };

  for (const item of lineItems) {
    const descLines = wrapText(item.description, font, BODY_FONT_SIZE, descWidth);
    const rowHeight = descLines.length * (BODY_FONT_SIZE + 3) + 6;
    ctx = ensureSpace(ctx, rowHeight);

    // First row — description lines + numeric columns on first line
    const firstLineY = ctx.y;
    for (let i = 0; i < descLines.length; i++) {
      ctx.page.drawText(descLines[i], {
        x: colDesc + 6,
        y: ctx.y,
        size: BODY_FONT_SIZE,
        font,
        color: COLOR_TEXT,
      });
      ctx.y -= BODY_FONT_SIZE + 3;
    }

    const qtyStr = String(item.quantity);
    const priceStr = formatCurrency(item.unitPriceCents);
    const totalStr = formatCurrency(item.totalCents);
    const qtyWidth = font.widthOfTextAtSize(qtyStr, BODY_FONT_SIZE);
    const priceWidth = font.widthOfTextAtSize(priceStr, BODY_FONT_SIZE);
    const totalWidth = font.widthOfTextAtSize(totalStr, BODY_FONT_SIZE);
    ctx.page.drawText(qtyStr, {
      x: colQty + 50 - qtyWidth,
      y: firstLineY,
      size: BODY_FONT_SIZE,
      font,
      color: COLOR_TEXT,
    });
    ctx.page.drawText(priceStr, {
      x: colPrice + 60 - priceWidth,
      y: firstLineY,
      size: BODY_FONT_SIZE,
      font,
      color: COLOR_TEXT,
    });
    ctx.page.drawText(totalStr, {
      x: colTotal - totalWidth - 6,
      y: firstLineY,
      size: BODY_FONT_SIZE,
      font,
      color: COLOR_TEXT,
    });

    ctx.y -= 6;
    // Row separator
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
      thickness: 0.25,
      color: COLOR_RULE,
    });
    ctx.y -= 6;
  }

  if (lineItems.length === 0) {
    ctx = ensureSpace(ctx, 24);
    ctx.page.drawText("No line items on this invoice.", {
      x: colDesc + 6,
      y: ctx.y,
      size: BODY_FONT_SIZE,
      font,
      color: COLOR_MUTED,
    });
    ctx.y -= BODY_FONT_SIZE + 10;
  }

  // ---------- Totals ----------
  ctx = ensureSpace(ctx, 90);
  ctx.y -= 10;

  const totalsX = PAGE_WIDTH - MARGIN - 180;
  const totalsRightX = PAGE_WIDTH - MARGIN;

  const balanceCents = Math.max(
    invoice.totalCents - invoice.amountPaidCents,
    0,
  );
  const rows: Array<[string, string, boolean]> = [
    ["Subtotal", formatCurrency(invoice.subtotalCents), false],
    ["Tax", formatCurrency(invoice.taxCents), false],
    ["Total", formatCurrency(invoice.totalCents), true],
    ["Paid", `-${formatCurrency(invoice.amountPaidCents)}`, false],
    ["Balance Due", formatCurrency(balanceCents), true],
  ];

  for (const [label, value, isBold] of rows) {
    const valueFont = isBold ? bold : font;
    const labelFont = isBold ? bold : font;
    const valueWidth = valueFont.widthOfTextAtSize(value, BODY_FONT_SIZE);
    ctx.page.drawText(label, {
      x: totalsX,
      y: ctx.y,
      size: BODY_FONT_SIZE,
      font: labelFont,
      color: isBold ? COLOR_TEXT : COLOR_MUTED,
    });
    ctx.page.drawText(value, {
      x: totalsRightX - valueWidth,
      y: ctx.y,
      size: BODY_FONT_SIZE,
      font: valueFont,
      color: COLOR_TEXT,
    });
    ctx.y -= BODY_FONT_SIZE + 5;
  }

  // ---------- Notes / payment terms ----------
  ctx.y -= 18;
  ctx = ensureSpace(ctx, 60);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y + 6 },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y + 6 },
    thickness: 0.5,
    color: COLOR_RULE,
  });
  ctx.page.drawText("PAYMENT TERMS", {
    x: MARGIN,
    y: ctx.y - 8,
    size: SMALL_FONT_SIZE,
    font: bold,
    color: COLOR_MUTED,
  });
  ctx.y -= SMALL_FONT_SIZE + 12;

  const termsLines: string[] = [];
  if (invoice.dueDate) {
    termsLines.push(`Payment due by ${formatDate(invoice.dueDate)}.`);
  } else {
    termsLines.push("Payment due upon receipt.");
  }
  termsLines.push(
    "Make checks payable to the firm above. Reference the invoice number on all payments.",
  );
  if (invoice.notes) {
    termsLines.push("");
    termsLines.push(invoice.notes);
  }

  const termsWidth = PAGE_WIDTH - MARGIN * 2;
  for (const raw of termsLines) {
    const lines = raw === "" ? [""] : wrapText(raw, font, SMALL_FONT_SIZE, termsWidth);
    for (const line of lines) {
      ctx = ensureSpace(ctx, SMALL_FONT_SIZE + 3);
      ctx.page.drawText(line, {
        x: MARGIN,
        y: ctx.y,
        size: SMALL_FONT_SIZE,
        font,
        color: COLOR_MUTED,
      });
      ctx.y -= SMALL_FONT_SIZE + 3;
    }
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
