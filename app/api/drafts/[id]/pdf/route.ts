import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { aiDrafts, cases, contacts, caseContacts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * SA-2 — Download an AI draft as a printable HTML document with firm
 * letterhead. The browser's built-in print-to-PDF handles actual PDF
 * rendering.
 *
 * GET /api/drafts/:id/pdf
 *
 * Returns HTML with Content-Disposition: attachment so the browser
 * opens/saves it as an .html file that can be printed to PDF.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await requireSession();

  const [draft] = await db
    .select({
      id: aiDrafts.id,
      title: aiDrafts.title,
      body: aiDrafts.body,
      caseId: aiDrafts.caseId,
      createdAt: aiDrafts.createdAt,
      caseNumber: cases.caseNumber,
    })
    .from(aiDrafts)
    .leftJoin(cases, eq(aiDrafts.caseId, cases.id))
    .where(
      and(
        eq(aiDrafts.id, id),
        eq(aiDrafts.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  // Resolve claimant name via caseContacts join table
  let claimantName = "Claimant";
  if (draft.caseId) {
    const [claimant] = await db
      .select({
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(caseContacts)
      .innerJoin(contacts, eq(caseContacts.contactId, contacts.id))
      .where(
        and(
          eq(caseContacts.caseId, draft.caseId),
          eq(caseContacts.relationship, "claimant"),
        ),
      )
      .limit(1);
    if (claimant) {
      claimantName =
        [claimant.firstName, claimant.lastName].filter(Boolean).join(" ") ||
        "Claimant";
    }
  }

  const caseNumber = draft.caseNumber ?? "N/A";
  const dateStr = draft.createdAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Convert markdown-ish body to basic HTML paragraphs
  const bodyHtml = escapeHtml(draft.body)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");

  const fileName = `${draft.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60)}.html`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(draft.title)}</title>
  <style>
    @page {
      margin: 1in;
    }
    body {
      font-family: "Times New Roman", Times, Georgia, serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 8.5in;
      margin: 0 auto;
      padding: 0.5in;
    }
    .letterhead {
      text-align: center;
      border-bottom: 2px solid #263c94;
      padding-bottom: 12pt;
      margin-bottom: 24pt;
    }
    .letterhead h1 {
      font-size: 18pt;
      font-weight: bold;
      color: #263c94;
      margin: 0 0 4pt 0;
      letter-spacing: 1pt;
    }
    .letterhead p {
      font-size: 9pt;
      color: #666;
      margin: 2pt 0;
    }
    .meta {
      margin-bottom: 24pt;
      font-size: 11pt;
    }
    .meta .date {
      margin-bottom: 12pt;
    }
    .meta .re {
      margin-top: 12pt;
    }
    .meta strong {
      font-weight: bold;
    }
    .body p {
      margin: 0 0 12pt 0;
      text-align: justify;
    }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="letterhead">
    <h1>HOGAN SMITH LAW</h1>
    <p>Social Security Disability Attorneys</p>
  </div>

  <div class="meta">
    <div class="date">${escapeHtml(dateStr)}</div>
    <div><strong>Case No.:</strong> ${escapeHtml(caseNumber)}</div>
    <div class="re"><strong>Re:</strong> ${escapeHtml(claimantName)}</div>
  </div>

  <div class="body">
    ${bodyHtml}
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
