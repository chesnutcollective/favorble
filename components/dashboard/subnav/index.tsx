"use client";

import { CaseManagerSubnav } from "./case_manager";
import { AttorneySubnav } from "./attorney";
import { ReviewerSubnav } from "./reviewer";
import { AdminSubnav } from "./admin";
import { MailClerkSubnav } from "./mail_clerk";
import { IntakeAgentSubnav } from "./intake_agent";
import { MedicalRecordsSubnav } from "./medical_records";
import { FeeCollectionSubnav } from "./fee_collection";
import { FilingAgentSubnav } from "./filing_agent";
import { PhiSheetWriterSubnav } from "./phi_sheet_writer";
import { AppealsCouncilSubnav } from "./appeals_council";
import { PostHearingSubnav } from "./post_hearing";
import { PreHearingPrepSubnav } from "./pre_hearing_prep";
import { DefaultSubnav } from "./default";
import type { DashboardSubnavData } from "@/lib/dashboard-subnav/types";

/**
 * Dispatcher: picks the right per-persona sub-nav based on the
 * discriminated union returned by `getDashboardSubnavData()`. Falls back
 * to DefaultSubnav for personas without a custom design.
 */
export function PersonaDashboardSubnav({
  data,
}: {
  data: DashboardSubnavData;
}) {
  switch (data.kind) {
    case "case_manager":
      return <CaseManagerSubnav data={data} />;
    case "attorney":
      return <AttorneySubnav data={data} />;
    case "reviewer":
      return <ReviewerSubnav data={data} />;
    case "admin":
      return <AdminSubnav data={data} />;
    case "mail_clerk":
      return <MailClerkSubnav data={data} />;
    case "intake_agent":
      return <IntakeAgentSubnav data={data} />;
    case "medical_records":
      return <MedicalRecordsSubnav data={data} />;
    case "fee_collection":
      return <FeeCollectionSubnav data={data} />;
    case "filing_agent":
      return <FilingAgentSubnav data={data} />;
    case "phi_sheet_writer":
      return <PhiSheetWriterSubnav data={data} />;
    case "appeals_council":
      return <AppealsCouncilSubnav data={data} />;
    case "post_hearing":
      return <PostHearingSubnav data={data} />;
    case "pre_hearing_prep":
      return <PreHearingPrepSubnav data={data} />;
    case "default":
    default:
      return <DefaultSubnav data={data} />;
  }
}
