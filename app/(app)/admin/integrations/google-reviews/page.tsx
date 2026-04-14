import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { getGoogleReviewsConnection } from "@/app/actions/google-reviews";
import { GoogleReviewsConfigClient } from "./client";

export const metadata: Metadata = {
  title: "Google Reviews",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GoogleReviewsIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const connection = await getGoogleReviewsConnection();

  const banner = resolveBanner(params);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Google Reviews"
        description="Pull recent Google reviews and surface request opportunities after closed-won cases."
      />
      <GoogleReviewsConfigClient
        connection={connection}
        canAdmin={session.role === "admin"}
        banner={banner}
      />
    </div>
  );
}

function resolveBanner(
  params: Record<string, string | string[] | undefined>,
): { kind: "success" | "error"; message: string } | null {
  const getOne = (v: string | string[] | undefined): string | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  if (getOne(params.connected) === "1") {
    return {
      kind: "success",
      message: "Google Business Profile connected. Reviews will sync shortly.",
    };
  }
  const error = getOne(params.error);
  if (!error) return null;
  const messages: Record<string, string> = {
    not_configured:
      "Google OAuth env vars aren't set. Configure GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI and try again.",
    missing_params: "The Google callback was missing a code or state.",
    invalid_state: "Invalid OAuth state — try starting the flow again.",
    csrf_mismatch: "OAuth CSRF mismatch. Please start over.",
    session_mismatch:
      "Your session changed mid-flow. Sign in again and retry.",
    forbidden: "Only admins can connect the Google integration.",
    token_exchange_failed:
      "Google rejected the authorization code. Check the client ID / secret and the redirect URI, then retry.",
    access_denied: "You denied access on the Google consent screen.",
  };
  return {
    kind: "error",
    message: messages[error] ?? `Google OAuth error: ${error}`,
  };
}
