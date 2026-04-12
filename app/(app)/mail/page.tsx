/**
 * Mail Processing workspace — PHYSICAL mail handling for Mail Clerks.
 *
 * This page is for scanning, categorizing, and tracking paper mail
 * (inbound documents received by post and outbound certified/FedEx/UPS
 * shipments). It is intentionally separate from the Email workspace.
 *
 * For ELECTRONIC email (Outlook integration, auto-association with
 * cases), see `/email` (`app/(app)/email/page.tsx`).
 */
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { getInboundMailQueue, getOutboundMailQueue } from "@/app/actions/mail";
import { MailWorkspaceClient } from "./client";

export const metadata: Metadata = {
  title: "Mail Processing",
  description:
    "Process incoming and outgoing physical mail — scan, categorize, attach to cases, and track certified shipments.",
};

export default async function MailPage() {
  let inbound: Awaited<ReturnType<typeof getInboundMailQueue>> = [];
  let outbound: Awaited<ReturnType<typeof getOutboundMailQueue>> = [];

  try {
    [inbound, outbound] = await Promise.all([
      getInboundMailQueue(),
      getOutboundMailQueue(),
    ]);
  } catch {
    // DB unavailable — render empty workspace.
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Physical Mail"
        description="Process incoming and outgoing physical mail — scan, categorize, attach to cases, and track certified shipments. For Outlook email, see Email."
      />
      <MailWorkspaceClient
        initialInbound={inbound}
        initialOutbound={outbound}
      />
    </div>
  );
}
