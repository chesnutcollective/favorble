import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getHearingPrepData } from "@/app/actions/hearings";
import {
  HearingWorkspaceClient,
  type HearingWorkspaceData,
} from "./workspace-client";

export const metadata: Metadata = {
  title: "Hearing Prep",
};

function fmtDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toLocaleDateString();
}

export default async function HearingPrepPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  await requireSession();

  let prep: Awaited<ReturnType<typeof getHearingPrepData>> = null;
  try {
    prep = await getHearingPrepData(caseId);
  } catch {
    // DB unavailable
  }

  if (!prep) notFound();

  const documentCategories = Object.entries(prep.documentCategories).map(
    ([category, count]) => ({ category, count }),
  );
  const documentTotal = documentCategories.reduce((acc, c) => acc + c.count, 0);

  const data: HearingWorkspaceData = {
    caseId: prep.case.id,
    caseNumber: prep.case.caseNumber,
    claimantName: prep.claimant
      ? `${prep.claimant.firstName} ${prep.claimant.lastName}`
      : "Unknown Claimant",
    claimantDob: fmtDate(prep.case.dateOfBirth),
    ssaClaimNumber: prep.case.ssaClaimNumber,
    ssaOffice: prep.case.ssaOffice,
    hearingOffice:
      prep.hearingEvent?.hearingOffice ?? prep.case.hearingOffice ?? null,
    applicationTypePrimary: prep.case.applicationTypePrimary,
    applicationTypeSecondary: prep.case.applicationTypeSecondary,
    allegedOnsetDate: fmtDate(prep.case.allegedOnsetDate),
    dateLastInsured: fmtDate(prep.case.dateLastInsured),
    adminLawJudge:
      prep.hearingEvent?.adminLawJudge ?? prep.case.adminLawJudge ?? null,
    modeOfAppearance: prep.modeOfAppearance,
    hearingStartIso: prep.hearingEvent?.startAt?.toISOString() ?? null,
    hearingEndIso: prep.hearingEvent?.endAt?.toISOString() ?? null,
    prepStatus: prep.prepStatus,
    chronologyTotal: prep.chronologyTotal,
    chronologySummary: prep.chronologySummary.map((e) => ({
      id: e.id,
      eventDate: e.eventDate ? e.eventDate.toLocaleDateString() : null,
      entryType: e.entryType,
      providerName: e.providerName,
      summary: e.summary,
    })),
    keyDiagnoses: prep.keyDiagnoses,
    keyMedications: prep.keyMedications,
    keyTreatments: prep.keyTreatments,
    documentCategories,
    documentTotal,
    phiSheet: prep.phiSheet
      ? {
          id: prep.phiSheet.id,
          fileName: prep.phiSheet.fileName,
          createdAt: prep.phiSheet.createdAt.toISOString(),
        }
      : null,
    aljStats: prep.aljStats
      ? {
          aljName: prep.aljStats.aljName,
          totalHearings: prep.aljStats.totalHearings,
          wonCount: prep.aljStats.wonCount,
          lostCount: prep.aljStats.lostCount,
          winRate: prep.aljStats.winRate,
          avgHearingLengthMinutes: prep.aljStats.avgHearingLengthMinutes,
          recentDecisions: prep.aljStats.recentDecisions.map((d) => ({
            caseId: d.caseId,
            caseNumber: d.caseNumber,
            status: d.status,
            closedAt: d.closedAt?.toISOString() ?? null,
          })),
        }
      : null,
  };

  return <HearingWorkspaceClient data={data} />;
}
