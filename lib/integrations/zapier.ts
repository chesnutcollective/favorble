import "server-only";

/**
 * Zapier integration utilities.
 *
 * Zapier handles website form → Favorble lead creation.
 * The main integration is the webhook receiver at /api/webhooks/zapier.
 *
 * This module provides utilities for:
 * - Validating incoming Zapier webhook payloads
 * - Mapping Zapier field names to Favorble lead fields
 */

export type ZapierLeadPayload = {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  source?: string;
  // Additional form fields from the website
  [key: string]: unknown;
};

/**
 * Validate a Zapier webhook payload.
 */
export function validatePayload(
  body: unknown,
): { valid: true; data: ZapierLeadPayload } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const payload = body as Record<string, unknown>;

  if (!payload.firstName || typeof payload.firstName !== "string") {
    return {
      valid: false,
      error: "firstName is required and must be a string",
    };
  }

  if (!payload.lastName || typeof payload.lastName !== "string") {
    return { valid: false, error: "lastName is required and must be a string" };
  }

  return {
    valid: true,
    data: {
      firstName: payload.firstName as string,
      lastName: payload.lastName as string,
      email: typeof payload.email === "string" ? payload.email : undefined,
      phone: typeof payload.phone === "string" ? payload.phone : undefined,
      source: typeof payload.source === "string" ? payload.source : "website",
    },
  };
}

/**
 * Normalize phone number from various input formats.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return phone;
}
