import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import {
  getInboundMailQueue,
  getOutboundMailQueue,
} from "@/app/actions/mail";
import { MailWorkspaceClient } from "./client";

export const metadata: Metadata = {
  title: "Mail Processing",
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
        title="Mail Processing"
        description="Scan, search, attach, and track physical mail for all cases."
      />
      <MailWorkspaceClient
        initialInbound={inbound}
        initialOutbound={outbound}
      />
    </div>
  );
}
