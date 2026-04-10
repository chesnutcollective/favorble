import "server-only";

import { logger } from "@/lib/logger/server";

/**
 * Microsoft Outlook / Graph API integration client.
 *
 * Handles:
 * - Automated email association with cases (REQ-012)
 * - Calendar sync for hearings (REQ-010)
 *
 * ============================================================================
 * AZURE AD SETUP GUIDE
 * ============================================================================
 *
 * 1. REGISTER AN APP in Azure AD (Entra ID):
 *    - Go to https://portal.azure.com → Azure Active Directory → App registrations
 *    - Click "New registration"
 *    - Name: "Favorble - Microsoft Graph Integration"
 *    - Supported account types: "Accounts in this organizational directory only"
 *      (Single tenant — the firm's Azure AD tenant)
 *    - Redirect URI: not needed (this uses client_credentials flow, no user login)
 *    - Click "Register"
 *
 * 2. COLLECT CREDENTIALS:
 *    - Application (client) ID → MICROSOFT_CLIENT_ID
 *    - Directory (tenant) ID  → MICROSOFT_TENANT_ID
 *    - Go to "Certificates & secrets" → "New client secret"
 *      - Description: "Favorble production"
 *      - Expiry: 24 months (set a calendar reminder to rotate)
 *      - Copy the secret Value → MICROSOFT_CLIENT_SECRET
 *
 * 3. CONFIGURE API PERMISSIONS (Application permissions, NOT delegated):
 *    - Go to "API permissions" → "Add a permission" → "Microsoft Graph"
 *    - Select "Application permissions" (app-only, no user context)
 *    - Add the following:
 *      • Calendars.ReadWrite  — create/read/update calendar events for any user
 *      • Mail.Read            — search emails across user mailboxes
 *    - Click "Grant admin consent for [tenant]" (requires Global Admin)
 *
 * 4. ENVIRONMENT VARIABLES (set in Vercel / .env.local):
 *    - MICROSOFT_CLIENT_ID     — Application (client) ID from step 2
 *    - MICROSOFT_CLIENT_SECRET — Client secret value from step 2
 *    - MICROSOFT_TENANT_ID     — Directory (tenant) ID from step 2
 *
 * 5. AUTH FLOW:
 *    This module uses the OAuth 2.0 Client Credentials flow (app-only).
 *    No user login or redirect URI is needed. The app authenticates
 *    directly with Azure AD and gets a token scoped to the tenant.
 *    The token endpoint is:
 *      POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
 *
 * 6. SECURITY NOTES:
 *    - Client credentials grant the app access to ALL user mailboxes and
 *      calendars in the tenant. Use Application Access Policies in Exchange
 *      Online to restrict to specific mailboxes if needed.
 *    - Rotate the client secret before expiry (set a reminder).
 *    - Never commit secrets to source control.
 *
 * ============================================================================
 *
 * Requires Microsoft Graph API credentials:
 * - MICROSOFT_CLIENT_ID
 * - MICROSOFT_CLIENT_SECRET
 * - MICROSOFT_TENANT_ID
 */

type GraphConfig = {
  clientId: string;
  clientSecret: string;
  tenantId: string;
};

function getConfig(): GraphConfig {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = process.env.MICROSOFT_TENANT_ID;

  if (!clientId || !clientSecret || !tenantId) {
    throw new Error("Microsoft Graph API credentials not configured");
  }

  return { clientId, clientSecret, tenantId };
}

/**
 * Get an access token for the Microsoft Graph API.
 * Uses client credentials flow (app-only).
 */
async function getAccessToken(): Promise<string> {
  const config = getConfig();

  const response = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to get Microsoft access token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Search emails for a specific email address.
 * Used for auto-associating emails with cases.
 */
export async function searchEmails(
  userEmail: string,
  contactEmail: string,
  since?: Date,
): Promise<
  Array<{
    id: string;
    subject: string;
    from: string;
    to: string[];
    receivedAt: string;
    bodyPreview: string;
    hasAttachments: boolean;
  }>
> {
  try {
    const token = await getAccessToken();

    let filter = `(from/emailAddress/address eq '${contactEmail}' or toRecipients/any(r:r/emailAddress/address eq '${contactEmail}'))`;
    if (since) {
      filter += ` and receivedDateTime ge ${since.toISOString()}`;
    }

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${userEmail}/messages?$filter=${encodeURIComponent(filter)}&$top=50&$orderby=receivedDateTime desc`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      logger.error("Microsoft Graph email search failed", {
        status: response.status,
      });
      return [];
    }

    const data = await response.json();
    return (data.value ?? []).map(
      (msg: {
        id: string;
        subject: string;
        from: { emailAddress: { address: string } };
        toRecipients: Array<{ emailAddress: { address: string } }>;
        receivedDateTime: string;
        bodyPreview: string;
        hasAttachments: boolean;
      }) => ({
        id: msg.id,
        subject: msg.subject,
        from: msg.from?.emailAddress?.address ?? "",
        to: (msg.toRecipients ?? []).map(
          (r: { emailAddress: { address: string } }) =>
            r.emailAddress?.address ?? "",
        ),
        receivedAt: msg.receivedDateTime,
        bodyPreview: msg.bodyPreview,
        hasAttachments: msg.hasAttachments,
      }),
    );
  } catch (error) {
    logger.error("Outlook email search error", { error });
    return [];
  }
}

/**
 * Create a calendar event in Outlook.
 * Used for hearing scheduling sync.
 */
export async function createCalendarEvent(
  userEmail: string,
  event: {
    subject: string;
    body?: string;
    startAt: Date;
    endAt: Date;
    location?: string;
    attendees?: Array<{ email: string; name?: string }>;
    isAllDay?: boolean;
  },
): Promise<{ outlookEventId: string } | null> {
  try {
    const token = await getAccessToken();

    const graphEvent = {
      subject: event.subject,
      body: event.body
        ? { contentType: "HTML", content: event.body }
        : undefined,
      start: {
        dateTime: event.startAt.toISOString(),
        timeZone: "America/New_York",
      },
      end: {
        dateTime: event.endAt.toISOString(),
        timeZone: "America/New_York",
      },
      location: event.location ? { displayName: event.location } : undefined,
      attendees: event.attendees?.map((a) => ({
        emailAddress: { address: a.email, name: a.name },
        type: "required" as const,
      })),
      isAllDay: event.isAllDay ?? false,
    };

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${userEmail}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(graphEvent),
      },
    );

    if (!response.ok) {
      logger.error("Outlook calendar event creation failed", {
        status: response.status,
      });
      return null;
    }

    const data = await response.json();
    return { outlookEventId: data.id };
  } catch (error) {
    logger.error("Outlook calendar event error", { error });
    return null;
  }
}

/**
 * Check if Microsoft Graph integration is configured.
 */
export function isConfigured(): boolean {
  return !!(
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET &&
    process.env.MICROSOFT_TENANT_ID
  );
}
