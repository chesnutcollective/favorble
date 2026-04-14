import "server-only";
import { logger } from "@/lib/logger/server";

const LANGEXTRACT_URL =
  process.env.LANGEXTRACT_URL ||
  "https://langextract-worker-staging.up.railway.app";

export type ExtractionType =
  | "medical_record"
  | "status_report"
  | "decision_letter"
  | "efolder_classification"
  | "phi_sheet_draft"
  | "appeal_brief";

export type Extraction = {
  extraction_class: string;
  extraction_text: string;
  char_interval?: { start_pos: number; end_pos: number } | null;
  attributes?: Record<string, unknown>;
  alignment_status?: string | null;
};

export type ExtractResponse = {
  extraction_type: ExtractionType;
  model: string;
  mock: boolean;
  elapsed_ms: number;
  document_length: number;
  extractions: Extraction[];
};

export function isConfigured(): boolean {
  return Boolean(LANGEXTRACT_URL);
}

/**
 * Send document text to LangExtract worker for structured extraction.
 * Returns null on failure (caller should handle gracefully).
 */
export async function extractFromDocument(
  documentText: string,
  extractionType: ExtractionType,
): Promise<ExtractResponse | null> {
  if (!isConfigured()) {
    logger.warn("LangExtract not configured");
    return null;
  }

  const endpoint = `${LANGEXTRACT_URL}/extract/${extractionType.replaceAll("_", "-")}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_text: documentText }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("LangExtract request failed", {
        status: response.status,
        body: body.slice(0, 500),
      });
      return null;
    }

    return (await response.json()) as ExtractResponse;
  } catch (error) {
    logger.error("LangExtract request error", { error });
    return null;
  }
}

/**
 * Extract medical record fields (providers, encounters, diagnoses, meds).
 */
export async function extractMedicalRecord(
  documentText: string,
): Promise<ExtractResponse | null> {
  return extractFromDocument(documentText, "medical_record");
}

/**
 * Extract SSA status report fields (hearing, ALJ, exhibits on file).
 */
export async function extractStatusReport(
  documentText: string,
): Promise<ExtractResponse | null> {
  return extractFromDocument(documentText, "status_report");
}

/**
 * Extract SSA decision letter fields (decision type, RFC, severe impairments,
 * listing match, past relevant work, reasoning).
 */
export async function extractDecisionLetter(
  documentText: string,
): Promise<ExtractResponse | null> {
  return extractFromDocument(documentText, "decision_letter");
}

/**
 * Classify an ERE / e-folder document into a Favorble document type.
 */
export async function extractEfolderClassification(
  documentText: string,
): Promise<ExtractResponse | null> {
  return extractFromDocument(documentText, "efolder_classification");
}

/**
 * Draft a Pre-Hearing Intelligence sheet from the assembled record.
 * Returns richly-grounded structured fields writers can refine.
 */
export async function extractPhiSheetDraft(
  documentText: string,
): Promise<ExtractResponse | null> {
  return extractFromDocument(documentText, "phi_sheet_draft");
}

/**
 * Extract Appeals Council / Federal Court brief skeleton fields
 * (caption, ALJ decision date, issues, errors, relief requested).
 */
export async function extractAppealBrief(
  documentText: string,
): Promise<ExtractResponse | null> {
  return extractFromDocument(documentText, "appeal_brief");
}

/**
 * Pluck a single field value from extractions by class.
 */
export function findExtraction(
  extractions: Extraction[],
  className: string,
): Extraction | undefined {
  return extractions.find((e) => e.extraction_class === className);
}

/**
 * Group extractions by class (returns all matches for each class).
 */
export function groupExtractions(
  extractions: Extraction[],
): Record<string, Extraction[]> {
  const groups: Record<string, Extraction[]> = {};
  for (const e of extractions) {
    if (!groups[e.extraction_class]) groups[e.extraction_class] = [];
    groups[e.extraction_class].push(e);
  }
  return groups;
}
