import type { Metadata } from "next";
import { getLeads, getLeadCountsByStatus } from "@/app/actions/leads";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { LeadsPipelineClient } from "./client";

export const metadata: Metadata = {
	title: "Leads",
};

const PIPELINE_STATUSES = [
	{ key: "new", label: "New" },
	{ key: "contacted", label: "Contacted" },
	{ key: "intake_in_progress", label: "Intake" },
	{ key: "contract_sent", label: "Contract Sent" },
	{ key: "contract_signed", label: "Signed" },
] as const;

export default async function LeadsPage() {
	const [allLeads, statusCounts] = await Promise.all([
		getLeads(),
		getLeadCountsByStatus(),
	]);

	const countsMap = new Map(statusCounts.map((s) => [s.status, s.count]));

	const columns = PIPELINE_STATUSES.map((ps) => ({
		status: ps.key,
		label: ps.label,
		count: countsMap.get(ps.key) ?? 0,
		leads: allLeads
			.filter((l) => l.status === ps.key)
			.map((l) => ({
				id: l.id,
				firstName: l.firstName,
				lastName: l.lastName,
				email: l.email,
				phone: l.phone,
				source: l.source,
				createdAt: l.createdAt.toISOString(),
				notes: l.notes,
			})),
	}));

	return (
		<div className="space-y-4">
			<PageHeader
				title="Leads"
				description="Lead pipeline and intake management."
				actions={
					<Button size="sm">
						<Plus className="mr-1 h-4 w-4" />
						New Lead
					</Button>
				}
			/>
			<LeadsPipelineClient columns={columns} />
		</div>
	);
}
