import { requireSession } from "@/lib/auth/session";
import { getChronologyEntries } from "@/app/actions/chronology";
import { getExhibitPackets } from "@/app/actions/exhibit-packets";
import { getCaseById } from "@/app/actions/cases";
import { getCaseDocuments } from "@/app/actions/documents";
import { ChronologyClient } from "./client";

export default async function CaseChronologyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: caseId } = await params;
  const user = await requireSession();

  let entries: Awaited<ReturnType<typeof getChronologyEntries>> = [];
  let packets: Awaited<ReturnType<typeof getExhibitPackets>> = [];
  let docs: Awaited<ReturnType<typeof getCaseDocuments>> = [];

  try {
    [entries, packets, docs] = await Promise.all([
      getChronologyEntries(caseId),
      getExhibitPackets(caseId),
      getCaseDocuments(caseId),
    ]);
  } catch {
    // DB unavailable
  }

  return (
    <ChronologyClient
      caseId={caseId}
      userId={user.id}
      organizationId={user.organizationId}
      initialEntries={entries.map((e) => ({
        id: e.id,
        caseId: e.caseId,
        sourceDocumentId: e.sourceDocumentId,
        entryType: e.entryType,
        eventDate: e.eventDate?.toISOString() ?? null,
        eventDateEnd: e.eventDateEnd?.toISOString() ?? null,
        providerName: e.providerName,
        providerType: e.providerType,
        facilityName: e.facilityName,
        summary: e.summary,
        details: e.details,
        diagnoses: e.diagnoses,
        treatments: e.treatments,
        medications: e.medications,
        pageReference: e.pageReference,
        aiGenerated: e.aiGenerated,
        isVerified: e.isVerified,
        isExcluded: e.isExcluded,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      }))}
      initialPackets={packets.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        status: p.status,
        packetStoragePath: p.packetStoragePath,
        packetSizeBytes: p.packetSizeBytes,
        builtAt: p.builtAt?.toISOString() ?? null,
        submittedAt: p.submittedAt?.toISOString() ?? null,
        errorMessage: p.errorMessage,
        createdAt: p.createdAt.toISOString(),
      }))}
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
