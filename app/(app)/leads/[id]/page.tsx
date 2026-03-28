import { notFound } from "next/navigation";
import { getLeadById } from "@/app/actions/leads";
import { getAllStages } from "@/app/actions/stages";
import { LeadDetailClient } from "./client";

export default async function LeadDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;

	let lead: Awaited<ReturnType<typeof getLeadById>> | null = null;
	let stages: Awaited<ReturnType<typeof getAllStages>> = [];

	try {
		[lead, stages] = await Promise.all([getLeadById(id), getAllStages()]);
	} catch {
		// DB unavailable
	}

	if (!lead) {
		notFound();
	}

	return (
		<LeadDetailClient
			lead={{
				id: lead.id,
				firstName: lead.firstName,
				lastName: lead.lastName,
				email: lead.email,
				phone: lead.phone,
				status: lead.status,
				source: lead.source,
				notes: lead.notes,
				assignedToId: lead.assignedToId,
				convertedToCaseId: lead.convertedToCaseId,
				convertedAt: lead.convertedAt?.toISOString() ?? null,
				intakeData: lead.intakeData as Record<string, unknown> | null,
				lastContactedAt: lead.lastContactedAt?.toISOString() ?? null,
				createdAt: lead.createdAt.toISOString(),
				updatedAt: lead.updatedAt.toISOString(),
			}}
			stages={stages}
		/>
	);
}
