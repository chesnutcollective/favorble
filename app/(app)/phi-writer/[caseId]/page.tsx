import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  getPhiWriterCaseData,
  getPhiWriters,
} from "@/app/actions/phi-writer";
import { PhiAuthoringView } from "./authoring-view";

export const metadata: Metadata = {
  title: "Author PHI Sheet",
};

export default async function PhiWriterCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;

  let bundle: Awaited<ReturnType<typeof getPhiWriterCaseData>> = null;
  let writers: Awaited<ReturnType<typeof getPhiWriters>> = [];

  try {
    [bundle, writers] = await Promise.all([
      getPhiWriterCaseData(caseId),
      getPhiWriters(),
    ]);
  } catch {
    // DB unavailable
  }

  if (!bundle) notFound();

  const serialized = {
    ...bundle,
    allegedOnsetDate: bundle.allegedOnsetDate
      ? bundle.allegedOnsetDate.toISOString()
      : null,
    dateLastInsured: bundle.dateLastInsured
      ? bundle.dateLastInsured.toISOString()
      : null,
    hearingDate: bundle.hearingDate ? bundle.hearingDate.toISOString() : null,
    phiSheetStartedAt: bundle.phiSheetStartedAt
      ? bundle.phiSheetStartedAt.toISOString()
      : null,
    phiSheetCompletedAt: bundle.phiSheetCompletedAt
      ? bundle.phiSheetCompletedAt.toISOString()
      : null,
    chronology: bundle.chronology.map((e) => ({
      ...e,
      eventDate: e.eventDate ? e.eventDate.toISOString() : null,
    })),
    documents: bundle.documents.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
    })),
    activity: bundle.activity.map((a) => ({
      ...a,
      transitionedAt: a.transitionedAt.toISOString(),
    })),
  };

  return (
    <div className="space-y-4">
      <Link
        href="/phi-writer"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; PHI Sheet Writer
      </Link>
      <PageHeader
        title={
          serialized.claimant
            ? `${serialized.claimant.firstName} ${serialized.claimant.lastName}`
            : "Unknown Claimant"
        }
        description={`${serialized.caseNumber} · Pre-Hearing Intelligence Sheet`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/cases/${serialized.caseId}/overview`}>
              Open Case Record
            </Link>
          </Button>
        }
      />
      <PhiAuthoringView bundle={serialized} writers={writers} />
    </div>
  );
}
