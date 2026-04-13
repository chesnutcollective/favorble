import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import {
  getFeedbackList,
  getFeedbackStats,
} from "@/lib/feedback/service";
import { FeedbackAdminClient } from "./client";

export const metadata: Metadata = { title: "Feedback" };
export const dynamic = "force-dynamic";

type SearchParams = {
  id?: string;
};

export default async function FeedbackAdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireSession();
  if (session.role !== "admin") notFound();

  const params = await searchParams;

  const [items, stats] = await Promise.all([
    getFeedbackList({ organizationId: session.organizationId }),
    getFeedbackStats(session.organizationId),
  ]);

  return (
    <FeedbackAdminClient
      items={items.map((i) => ({
        ...i,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      }))}
      stats={stats}
      initialSelectedId={params.id ?? null}
    />
  );
}
