import "server-only";
import { logger } from "@/lib/logger/server";

const LANGEXTRACT_URL =
	process.env.LANGEXTRACT_URL ||
	"https://langextract-worker-staging.up.railway.app";

export type ExtractionType =
	| "medical_record"
	| "status_report"
	| "decision_letter"
	| "efolder_classification";

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

	const endpoint = `${LANGEXTRACT_URL}/extract/${extractionType.replace("_", "-")}`;

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
