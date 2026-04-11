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
import { MedicalRecordsClient } from "./client";

export const metadata: Metadata = {
  title: "Medical Records",
};

export default async function MedicalRecordsPage() {
  let queue: MrQueueRow[] = [];
  let credentialGroups: ProviderCredentialGroup[] = [];
  let rfcRows: RfcTrackerRow[] = [];
  let workload: TeamWorkloadRow[] = [];

  try {
    [queue, credentialGroups, rfcRows, workload] = await Promise.all([
      getMrQueue(),
      getProviderCredentials(),
      getRfcTracker(),
      getTeamWorkload(),
    ]);
  } catch {
    // DB unavailable — render empty state
  }

  return (
    <MedicalRecordsClient
      queue={queue}
      credentialGroups={credentialGroups}
      rfcRows={rfcRows}
      workload={workload}
    />
  );
}
