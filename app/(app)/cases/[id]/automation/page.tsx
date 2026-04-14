import { getCaseWorkflowTemplates } from "@/app/actions/case-automation";
import { PageHeader } from "@/components/shared/page-header";
import { CaseAutomationClient } from "./automation-client";

export const dynamic = "force-dynamic";

export default async function CaseAutomationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: caseId } = await params;

  let templates: Awaited<ReturnType<typeof getCaseWorkflowTemplates>> = [];
  try {
    templates = await getCaseWorkflowTemplates(caseId);
  } catch {
    // DB unavailable — fall through to empty state.
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Automation"
        description="Workflow templates that may fire for this case. Toggle off to suppress a specific template for this case only."
      />
      <CaseAutomationClient caseId={caseId} templates={templates} />
    </div>
  );
}
