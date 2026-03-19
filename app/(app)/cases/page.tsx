import type { Metadata } from "next";
import { getCases } from "@/app/actions/cases";
import { getAllStages } from "@/app/actions/stages";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CasesListClient } from "./client";

export const metadata: Metadata = {
	title: "Cases",
};

export default async function CasesPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | undefined>>;
}) {
	const params = await searchParams;
	const page = Number(params.page ?? "1");
	const search = params.search ?? "";
	const stageId = params.stage ?? "";
	const status = params.status ?? "";

	const [casesResult, stages] = await Promise.all([
		getCases(
			{
				search: search || undefined,
				stageId: stageId || undefined,
				status: status || undefined,
			},
			{ page, pageSize: 50 },
		),
		getAllStages(),
	]);

	return (
		<div className="space-y-4">
			<PageHeader
				title="Cases"
				description="Browse and manage all cases."
				actions={
					<Button size="sm">
						<Plus className="mr-1 h-4 w-4" />
						New Case
					</Button>
				}
			/>
			<CasesListClient
				cases={casesResult.cases.map((c) => ({
					...c,
					createdAt: c.createdAt.toISOString(),
					updatedAt: c.updatedAt.toISOString(),
				}))}
				total={casesResult.total}
				page={casesResult.page}
				pageSize={casesResult.pageSize}
				stages={stages}
				initialSearch={search}
				initialStageId={stageId}
			/>
		</div>
	);
}
