import "server-only";

import { logger } from "@/lib/logger/server";

/**
 * Case Status integration client.
 *
 * Case Status is the client-facing messaging and "Pizza Tracker" app.
 * The firm has an explicit contract commitment to keep using it.
 *
 * Current capabilities:
 * - Inbound messages sync into Favorble (via webhook)
 * - Client document uploads sync (via webhook)
 * - Outbound messaging requires Case Status API (to be investigated)
 *
 * The Pizza Tracker maps to Favorble's stage groups:
 * - Stage groups have `clientVisibleName` and `clientVisibleDescription`
 * - When a case changes stage groups, Case Status should be notified
 */

type CaseStatusConfig = {
  apiKey: string;
  baseUrl: string;
};

function getConfig(): CaseStatusConfig {
  const apiKey = process.env.CASE_STATUS_API_KEY;
  const baseUrl = process.env.CASE_STATUS_API_URL ?? "https://api.casestatus.com";

  if (!apiKey) {
    throw new Error("CASE_STATUS_API_KEY environment variable is not set");
  }

  return { apiKey, baseUrl };
}

/**
 * Send a message to a client through Case Status.
 * This enables bidirectional messaging (REQ-011).
 */
export async function sendMessage(
  caseExternalId: string,
  message: string,
  senderName: string,
): Promise<{ success: boolean; messageId?: string }> {
  try {
    const config = getConfig();

    const response = await fetch(`${config.baseUrl}/v1/cases/${caseExternalId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: message,
        sender: senderName,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Case Status send message failed", {
        status: response.status,
        error: errorText,
      });
      return { success: false };
    }

    const data = await response.json();
    return { success: true, messageId: data.id };
  } catch (error) {
    logger.error("Case Status send message error", { error });
    return { success: false };
  }
}

/**
 * Update the client-visible case stage in Case Status (Pizza Tracker).
 */
export async function updateCaseStage(
  caseExternalId: string,
  stageName: string,
  stageDescription?: string,
): Promise<boolean> {
  try {
    const config = getConfig();

    const response = await fetch(`${config.baseUrl}/v1/cases/${caseExternalId}/stage`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: stageName,
        description: stageDescription,
      }),
    });

    if (!response.ok) {
      logger.error("Case Status stage update failed", {
        status: response.status,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Case Status stage update error", { error });
    return false;
  }
}

/**
 * Get messages for a case from Case Status.
 */
export async function getMessages(
  caseExternalId: string,
  limit = 50,
  cursor?: string,
): Promise<{
  messages: Array<{
    id: string;
    content: string;
    sender: string;
    sentAt: string;
    isFromClient: boolean;
  }>;
  nextCursor?: string;
}> {
  try {
    const config = getConfig();

    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(
      `${config.baseUrl}/v1/cases/${caseExternalId}/messages?${params}`,
      {
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
        },
      },
    );

    if (!response.ok) {
      logger.error("Case Status get messages failed", {
        status: response.status,
      });
      return { messages: [] };
    }

    return await response.json();
  } catch (error) {
    logger.error("Case Status get messages error", { error });
    return { messages: [] };
  }
}

/**
 * Check if Case Status integration is configured.
 */
export function isConfigured(): boolean {
  return !!process.env.CASE_STATUS_API_KEY;
}
