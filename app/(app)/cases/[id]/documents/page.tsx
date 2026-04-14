import { requireSession } from "@/lib/auth/session";
import {
  getCaseDocuments,
  getDocumentTemplates,
} from "@/app/actions/documents";
import { listActiveDocumentShareCounts } from "@/app/actions/document-shares";
import { getCaseById } from "@/app/actions/cases";
import { CaseDocumentsClient } from "./client";

export default async function CaseDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: caseId } = await params;
  const user = await requireSession();

  let docs: Awaited<ReturnType<typeof getCaseDocuments>> = [];
  let templates: Awaited<ReturnType<typeof getDocumentTemplates>> = [];
  let caseData: Awaited<ReturnType<typeof getCaseById>> = null;

  try {
    [docs, templates, caseData] = await Promise.all([
      getCaseDocuments(caseId),
      getDocumentTemplates(user.organizationId),
      getCaseById(caseId),
    ]);
  } catch {
    // DB unavailable
  }

  // Batch-load active share counts for every doc on the page so each row can
  // render a "Shared · N" badge without an N+1 call.
  let shareCounts: Record<string, number> = {};
  try {
    shareCounts = await listActiveDocumentShareCounts(docs.map((d) => d.id));
  } catch {
    // Non-fatal — fall back to all zeros.
  }

  const claimantName = caseData?.claimant
    ? `${caseData.claimant.firstName} ${caseData.claimant.lastName}`
    : "Unknown Claimant";

  return (
    <CaseDocumentsClient
      caseId={caseId}
      organizationId={user.organizationId}
      userId={user.id}
      claimantName={claimantName}
      initialDocuments={docs.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        fileType: d.fileType,
        fileSizeBytes: d.fileSizeBytes,
        category: d.category,
        source: d.source,
        createdAt: d.createdAt.toISOString(),
        isMetadataOnly: d.storagePath.startsWith("chronicle://"),
        shareCount: shareCounts[d.id] ?? 0,
      }))}
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        mergeFields: t.mergeFields,
        templateContent: t.templateContent,
      }))}
      caseData={{
        claimantName,
        caseNumber: caseData?.caseNumber ?? "",
        dateOfBirth: caseData?.dateOfBirth?.toLocaleDateString() ?? null,
        ssaClaimNumber: caseData?.ssaClaimNumber ?? null,
        ssaOffice: caseData?.ssaOffice ?? null,
        allegedOnsetDate:
          caseData?.allegedOnsetDate?.toLocaleDateString() ?? null,
        hearingOffice: caseData?.hearingOffice ?? null,
        adminLawJudge: caseData?.adminLawJudge ?? null,
      }}
    />
  );
}
