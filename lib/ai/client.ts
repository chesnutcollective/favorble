import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger/server";

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

export async function askClaude(prompt: string): Promise<string> {
  const client = getClient();
  if (!client) {
    return "AI features are not configured. Set the ANTHROPIC_API_KEY environment variable to enable AI assistance.";
  }

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    return textBlock?.text ?? "No response generated.";
  } catch (error) {
    logger.error("AI request failed", { error });
    return "AI request failed. Please try again later.";
  }
}

export async function classifyDocument(
  text: string,
  metadata: { fileType?: string; fileName?: string },
): Promise<{
  category: string;
  providerName: string | null;
  providerType: string | null;
  dateStart: string | null;
  dateEnd: string | null;
  confidence: number;
}> {
  const client = getClient();
  if (!client) {
    throw new Error(
      "AI features are not configured. Set the ANTHROPIC_API_KEY environment variable.",
    );
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: `You are a medical records classifier for a Social Security Disability law firm.
Classify the following document and extract metadata. Return JSON only.`,
      messages: [
        {
          role: "user",
          content: `Classify this document (file: ${metadata.fileName ?? "unknown"}, type: ${metadata.fileType ?? "unknown"}):\n\n${text.slice(0, 10000)}\n\nReturn JSON: { "category": string (one of: "medical_records", "ssa_correspondence", "hearing_notice", "decision", "consultative_exam", "disability_report", "vocational", "legal", "financial", "other"), "providerName": string|null, "providerType": string|null, "dateStart": "YYYY-MM-DD"|null, "dateEnd": "YYYY-MM-DD"|null, "confidence": number 0-100 }`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type === "text") {
      return JSON.parse(content.text);
    }
    throw new Error("Unexpected response format from AI classification");
  } catch (error) {
    logger.error("AI document classification failed", { error });
    throw error;
  }
}

export async function generateChronologyEntries(
  text: string,
  context: {
    documentId?: string;
    fileName?: string;
    category?: string;
    providerName?: string;
  },
): Promise<
  Array<{
    entryType: string;
    eventDate: string | null;
    eventDateEnd: string | null;
    providerName: string | null;
    providerType: string | null;
    facilityName: string | null;
    summary: string;
    details: string | null;
    diagnoses: string[];
    treatments: string[];
    medications: string[];
    pageReference: string | null;
  }>
> {
  const client = getClient();
  if (!client) {
    logger.warn(
      "AI features are not configured — skipping chronology extraction",
    );
    return [];
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: `You are a medical records analyst for a Social Security Disability law firm.
Extract every medical encounter from the provided records into structured chronology entries.
Return a JSON array of entries. Each entry must have: entryType (office_visit|hospitalization|emergency|lab_result|imaging|mental_health|physical_therapy|surgery|prescription|diagnosis|functional_assessment|other), eventDate (YYYY-MM-DD or null), eventDateEnd (null unless multi-day), providerName, providerType, facilityName, summary (one sentence), details (longer description or null), diagnoses (array of strings), treatments (array), medications (array), pageReference (string or null).
If no medical data found, return an empty array.`,
      messages: [
        {
          role: "user",
          content: `Document: ${context.fileName || "Unknown"}\nCategory: ${context.category || "Unknown"}\nProvider: ${context.providerName || "Unknown"}\n\n${text.slice(0, 50000)}`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type === "text") {
      try {
        return JSON.parse(content.text);
      } catch {
        logger.warn("Failed to parse chronology entries JSON", {
          documentId: context.documentId,
        });
        return [];
      }
    }
    return [];
  } catch (error) {
    logger.error("AI chronology extraction failed", {
      error,
      documentId: context.documentId,
    });
    return [];
  }
}
