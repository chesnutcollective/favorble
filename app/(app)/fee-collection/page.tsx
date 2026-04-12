import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCard } from "@/components/shared/stats-card";
import {
  getFeePetitionsForWorkspace,
  type FeePetitionWorkspace,
} from "@/app/actions/fee-collection";
import { FeeCollectionTabs } from "./tabs-client";

export const metadata: Metadata = { title: "Fee Collection" };
export const dynamic = "force-dynamic";

const EMPTY: FeePetitionWorkspace = {
  pending: [],
  filed: [],
  approved: [],
  delinquent: [],
  counts: { pending: 0, filed: 0, approved: 0, delinquent: 0 },
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function totalOutstanding(data: FeePetitionWorkspace): number {
  const buckets = [
    ...data.pending,
    ...data.filed,
    ...data.approved,
    ...data.delinquent,
  ];
  return buckets.reduce((sum, r) => sum + r.outstandingCents, 0);
}

export default async function FeeCollectionPage() {
  await requireSession();

  let data: FeePetitionWorkspace = EMPTY;
  try {
    data = await getFeePetitionsForWorkspace();
  } catch {
    // DB unavailable — render empty workspace.
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee Collection"
        description="Fee petitions filed with SSA after favorable decisions, tracked through approval and collection."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatsCard
          title="Pending"
          value={data.counts.pending}
          subtitle="Awaiting SSA filing"
        />
        <StatsCard
          title="Filed"
          value={data.counts.filed}
          subtitle="Awaiting SSA approval"
        />
        <StatsCard
          title="Approved"
          value={data.counts.approved}
          subtitle={formatCurrency(totalOutstanding(data))}
        />
        <StatsCard
          title="Delinquent"
          value={data.counts.delinquent}
          subtitle="Approved > 30 days unpaid"
          subtitleVariant={data.counts.delinquent > 0 ? "danger" : "default"}
        />
      </div>

      <FeeCollectionTabs data={data} />
    </div>
  );
}
