import "server-only";

/**
 * Google Business Profile OAuth helpers.
 *
 * We talk to three Google APIs:
 *   1. `https://oauth2.googleapis.com/token` — token exchange + refresh
 *   2. `https://mybusinessaccountmanagement.googleapis.com` — list accounts
 *   3. `https://mybusinessbusinessinformation.googleapis.com` — list locations
 *   4. `https://mybusiness.googleapis.com/v4` — list reviews (v4 legacy)
 *
 * All calls use plain `fetch` to avoid pulling in the `googleapis` package.
 * Every function degrades gracefully when env vars are missing — callers
 * should check `hasOauthEnv()` before kicking off a flow.
 */

export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
].join(" ");

export type OauthEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function loadOauthEnv(): OauthEnv | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function hasOauthEnv(): boolean {
  return loadOauthEnv() !== null;
}

export function buildAuthorizeUrl(state: string): string | null {
  const env = loadOauthEnv();
  if (!env) return null;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", env.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

export async function exchangeCodeForTokens(
  code: string,
): Promise<TokenResponse | null> {
  const env = loadOauthEnv();
  if (!env) return null;
  const form = new URLSearchParams();
  form.set("code", code);
  form.set("client_id", env.clientId);
  form.set("client_secret", env.clientSecret);
  form.set("redirect_uri", env.redirectUri);
  form.set("grant_type", "authorization_code");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!response.ok) return null;
  return (await response.json()) as TokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenResponse | null> {
  const env = loadOauthEnv();
  if (!env) return null;
  const form = new URLSearchParams();
  form.set("refresh_token", refreshToken);
  form.set("client_id", env.clientId);
  form.set("client_secret", env.clientSecret);
  form.set("grant_type", "refresh_token");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!response.ok) return null;
  return (await response.json()) as TokenResponse;
}

type AccountsResponse = {
  accounts?: Array<{
    name?: string; // "accounts/123456789"
    accountName?: string;
    type?: string;
  }>;
};

export async function listAccounts(
  accessToken: string,
): Promise<AccountsResponse> {
  const response = await fetch(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) return {};
  return (await response.json()) as AccountsResponse;
}

type LocationsResponse = {
  locations?: Array<{
    name?: string; // "locations/123456789"
    title?: string;
    storeCode?: string;
    metadata?: { placeId?: string };
  }>;
};

/**
 * List locations for an account. `accountName` must be the full resource
 * name (e.g. "accounts/123456789").
 */
export async function listLocations(
  accessToken: string,
  accountName: string,
): Promise<LocationsResponse> {
  const url = new URL(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`,
  );
  // `metadata` is what surfaces the Place ID on the returned rows.
  url.searchParams.set(
    "readMask",
    "name,title,storeCode,metadata.placeId",
  );
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return {};
  return (await response.json()) as LocationsResponse;
}

export type GoogleReviewApi = {
  reviewId: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string };
  starRating?: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
};

type ReviewsResponse = {
  reviews?: GoogleReviewApi[];
  averageRating?: number;
  totalReviewCount?: number;
  nextPageToken?: string;
};

/**
 * List reviews for a location. Uses the legacy v4 My Business API — the
 * only supported path for reviews at time of writing.
 */
export async function listReviews(
  accessToken: string,
  accountId: string,
  locationId: string,
  pageToken?: string,
): Promise<ReviewsResponse> {
  const url = new URL(
    `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews`,
  );
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return {};
  return (await response.json()) as ReviewsResponse;
}

export function starRatingToInt(
  rating: GoogleReviewApi["starRating"] | undefined,
): number {
  switch (rating) {
    case "ONE":
      return 1;
    case "TWO":
      return 2;
    case "THREE":
      return 3;
    case "FOUR":
      return 4;
    case "FIVE":
      return 5;
    default:
      return 0;
  }
}

/**
 * Strip the resource prefix from a Google resource name.
 *   "accounts/123456789"        → "123456789"
 *   "locations/987654321"       → "987654321"
 */
export function stripResourcePrefix(
  name: string | undefined,
  prefix: string,
): string | null {
  if (!name) return null;
  const p = `${prefix}/`;
  if (!name.startsWith(p)) return name;
  return name.slice(p.length);
}
