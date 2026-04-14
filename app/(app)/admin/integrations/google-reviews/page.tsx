import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { GoogleReviewsConfigClient } from "./client";

export const metadata: Metadata = {
  title: "Google Reviews",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GoogleReviewsIntegrationPage() {
  await requireSession();

  // Until the GMB OAuth flow ships, the integration is always "Not connected".
  // When the OAuth piece lands, this page will hydrate from a real status
  // service (cf. getIntegrationsStatus) instead of hard-coding the status.
  return (
    <div className="space-y-6">
      <PageHeader
        title="Google Reviews"
        description="Pull recent Google reviews and surface request opportunities after closed-won cases."
      />
      <GoogleReviewsConfigClient status="not_connected" />
    </div>
  );
}
