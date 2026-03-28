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
