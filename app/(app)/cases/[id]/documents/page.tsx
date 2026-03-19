import { requireSession } from "@/lib/auth/session";
import { getCaseDocuments } from "@/app/actions/documents";
import { CaseDocumentsClient } from "./client";

export default async function CaseDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: caseId } = await params;
  const user = await requireSession();

  const docs = await getCaseDocuments(caseId);

  return (
    <CaseDocumentsClient
      caseId={caseId}
      organizationId={user.organizationId}
      userId={user.id}
      initialDocuments={docs.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        fileType: d.fileType,
        fileSizeBytes: d.fileSizeBytes,
        category: d.category,
        source: d.source,
        createdAt: d.createdAt.toISOString(),
      }))}
    />
  );
}
