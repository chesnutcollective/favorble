import type { Metadata } from "next";
import { getWorkflowTemplates } from "@/app/actions/workflows";
import { getAllStages } from "@/app/actions/stages";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { WorkflowSquare01Icon } from "@hugeicons/core-free-icons";
import { NewWorkflowDialog } from "./new-workflow-dialog";
import { WorkflowCard } from "./workflow-card";

export const metadata: Metadata = {
	title: "Workflow Templates",
};

export default async function WorkflowsPage() {
	let workflows: Awaited<ReturnType<typeof getWorkflowTemplates>> = [];
	let stages: Awaited<ReturnType<typeof getAllStages>> = [];

	try {
		[workflows, stages] = await Promise.all([
			getWorkflowTemplates(),
			getAllStages(),
		]);
	} catch {
		// DB unavailable
	}

	const stagesForDialog = stages.map((s) => ({
		id: s.id,
		name: s.name,
		code: s.code,
	}));

	return (
		<div className="space-y-6">
			<PageHeader
				title="Workflow Templates"
				description="Configure automated workflows triggered by stage changes."
				actions={<NewWorkflowDialog stages={stagesForDialog} />}
			/>

			{workflows.length === 0 ? (
				<EmptyState
					icon={WorkflowSquare01Icon}
					title="No workflows"
					description="Create your first workflow to automate task generation when cases change stages."
				/>
			) : (
				<div className="space-y-4">
					{workflows.map((wf) => (
						<WorkflowCard
							key={wf.id}
							workflow={{
								id: wf.id,
								name: wf.name,
								description: wf.description,
								triggerStageId: wf.triggerStageId,
								isActive: wf.isActive,
								notifyAssignees: wf.notifyAssignees,
								notifyCaseManager: wf.notifyCaseManager,
								sendClientMessage: wf.sendClientMessage,
								triggerStageName: wf.triggerStageName,
								triggerStageCode: wf.triggerStageCode,
								taskTemplates: wf.taskTemplates.map((tt) => ({
									id: tt.id,
									title: tt.title,
									assignToTeam: tt.assignToTeam,
									assignToRole: tt.assignToRole,
									dueDaysOffset: tt.dueDaysOffset,
									dueBusinessDaysOnly: tt.dueBusinessDaysOnly,
									priority: tt.priority,
								})),
							}}
							stages={stagesForDialog}
						/>
					))}
				</div>
			)}
		</div>
	);
}
