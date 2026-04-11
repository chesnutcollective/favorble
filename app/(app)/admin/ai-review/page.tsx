import type { Metadata } from "next";
import {
  getAiReviewQueue,
  getAiReviewStats,
  getAiReviewDocumentTypes,
  type AiReviewFilter,
  type ReviewStatus,
  type ConfidenceLevel,
} from "@/app/actions/ai-review";
import { AiReviewClient } from "./client";

export const metadata: Metadata = {
  title: "AI Review Queue",
};

type SearchParams = {
  status?: string;
  confidence?: string;
  documentType?: string;
  tab?: string;
  page?: string;
};

function resolveStatus(tab: string | undefined): ReviewStatus {
  if (tab === "approved" || tab === "verified") return "approved";
  if (tab === "rejected") return "rejected";
  if (tab === "all") return "all";
  return "pending";
}

function resolveConfidence(value: string | undefined): ConfidenceLevel {
  if (value === "low" || value === "medium" || value === "high") return value;
  return "all";
}

export default async function AiReviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const tab = params.tab ?? "pending";
  const status = resolveStatus(tab);
  const confidenceLevel = resolveConfidence(params.confidence);
  const documentType = params.documentType ?? "all";
  const page = Math.max(Number(params.page ?? "1") || 1, 1);

  const filter: AiReviewFilter = {
    status,
    confidenceLevel,
    documentType,
    page,
    pageSize: 25,
  };

  const [queueResult, stats, documentTypes] = await Promise.all([
    getAiReviewQueue(filter),
    getAiReviewStats(),
    getAiReviewDocumentTypes(),
  ]);

  return (
    <AiReviewClient
      initialEntries={queueResult.entries}
      totalCount={queueResult.totalCount}
      hasMore={queueResult.hasMore}
      stats={stats}
      documentTypes={documentTypes}
      initialFilters={{
        tab,
        confidence: confidenceLevel,
        documentType,
      }}
      currentPage={page}
      pageSize={25}
    />
  );
}
