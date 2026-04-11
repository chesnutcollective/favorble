import type { ExtractionType } from "@/lib/integrations/langextract";

/**
 * Pick the LangExtract extraction type from a document's filename.
 *
 * Kept as a pure string-inspection helper so it can be called from
 * webhook handlers, server actions, and CLI scripts without pulling in
 * any server-only dependencies.
 *
 * Matches are case-insensitive. Falls back to "medical_record" which is
 * the most common document type in the SSD practice.
 */
export function pickExtractionTypeFromFileName(
  fileName: string,
): ExtractionType {
  const name = fileName.toLowerCase();

  // Decision letters / notices of approval or denial
  if (
    name.includes("decision") ||
    name.includes("favorable") ||
    name.includes("unfavorable") ||
    name.includes("denial") ||
    name.includes("disapproved") ||
    name.includes("notice_of_approval") ||
    name.includes("notice_of_denial")
  ) {
    return "decision_letter";
  }

  // Status reports / case updates
  if (
    name.includes("status_report") ||
    name.includes("status-report") ||
    name.includes("claim_status") ||
    name.includes("case_status")
  ) {
    return "status_report";
  }

  return "medical_record";
}

/**
 * File types we can actually extract from. Everything else (images,
 * audio, video, archives, executables) gets skipped so we don't burn
 * LLM tokens on binary content the extractor can't parse.
 */
const EXTRACTABLE_MIME_PREFIXES = [
  "application/pdf",
  "application/x-pdf",
  "text/",
  "application/json",
  "application/rtf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument", // .docx, .xlsx, .pptx
];

const EXTRACTABLE_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".text",
  ".md",
  ".rtf",
  ".doc",
  ".docx",
  ".json",
];

/**
 * True if a document's mime type or filename suggests we can extract
 * structured data from it via the LangExtract pipeline.
 */
export function isExtractableDocument(
  fileName: string,
  fileType: string | null | undefined,
): boolean {
  const lowerType = (fileType ?? "").toLowerCase();
  if (EXTRACTABLE_MIME_PREFIXES.some((p) => lowerType.startsWith(p))) {
    return true;
  }

  const lowerName = fileName.toLowerCase();
  if (EXTRACTABLE_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
    return true;
  }

  return false;
}
