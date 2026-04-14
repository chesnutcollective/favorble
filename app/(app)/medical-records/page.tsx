import type { Metadata } from "next";
import {
  getMrQueue,
  getProviderCredentials,
  getRfcTracker,
  getTeamWorkload,
  type MrQueueRow,
  type ProviderCredentialGroup,
  type RfcTrackerRow,
  type TeamWorkloadRow,
} from "@/app/actions/medical-records";
import {
  listStaffTreatmentEntries,
  listStaffTreatmentCaseFilterOptions,
  auditStaffTreatmentLogView,
  type ClientTreatmentLogRow,
} from "@/app/actions/client-treatment-log";
import { MedicalRecordsClient } from "./client";

export const metadata: Metadata = {
  title: "Medical Records",
};

export default async function MedicalRecordsPage() {
  let queue: MrQueueRow[] = [];
  let credentialGroups: ProviderCredentialGroup[] = [];
  let rfcRows: RfcTrackerRow[] = [];
  let workload: TeamWorkloadRow[] = [];
  let clientTreatmentEntries: ClientTreatmentLogRow[] = [];
  let clientTreatmentCases: Array<{
    caseId: string;
    caseNumber: string;
    claimantName: string;
  }> = [];

  try {
    [
      queue,
      credentialGroups,
      rfcRows,
      workload,
      clientTreatmentEntries,
      clientTreatmentCases,
    ] = await Promise.all([
      getMrQueue(),
      getProviderCredentials(),
      getRfcTracker(),
      getTeamWorkload(),
      listStaffTreatmentEntries(),
      listStaffTreatmentCaseFilterOptions(),
    ]);
    await auditStaffTreatmentLogView();
  } catch {
    // DB unavailable — render empty state
  }

  return (
    <MedicalRecordsClient
      queue={queue}
      credentialGroups={credentialGroups}
      rfcRows={rfcRows}
      workload={workload}
      clientTreatmentEntries={clientTreatmentEntries}
      clientTreatmentCases={clientTreatmentCases}
    />
  );
}
