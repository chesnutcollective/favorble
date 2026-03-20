import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { documents, cases } from "@/db/schema";
import { eq, desc, isNull, and } from "drizzle-orm";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { File01Icon } from "@hugeicons/core-free-icons";
import { GlobalDocumentsClient } from "./client";

export const metadata: Metadata = {
  title: "Documents",
};

export default async function DocumentsPage() {
  const user = await requireSession();

  const recentDocs = await db
    .select({
      id: documents.id,
      fileName: documents.fileName,
      fileType: documents.fileType,
      fileSizeBytes: documents.fileSizeBytes,
      category: documents.category,
      source: documents.source,
      createdAt: documents.createdAt,
      caseId: documents.caseId,
      caseNumber: cases.caseNumber,
    })
    .from(documents)
    .leftJoin(cases, eq(documents.caseId, cases.id))
    .where(
      and(
        eq(documents.organizationId, user.organizationId),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Search and browse documents across all cases."
      />

      {recentDocs.length === 0 ? (
        <EmptyState
          icon={File01Icon}
          title="No documents yet"
          description="Documents uploaded to cases will appear here."
        />
      ) : (
        <GlobalDocumentsClient
          documents={recentDocs.map((d) => ({
            id: d.id,
            fileName: d.fileName,
            fileType: d.fileType,
            fileSizeBytes: d.fileSizeBytes,
            category: d.category,
            source: d.source,
            createdAt: d.createdAt.toISOString(),
            caseNumber: d.caseNumber,
            caseId: d.caseId,
          }))}
        />
      )}
    </div>
  );
}
