import type { Metadata } from "next";
import { getCases, getOrgUsers } from "@/app/actions/cases";
import { getAllStages } from "@/app/actions/stages";
import { PageHeader } from "@/components/shared/page-header";
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
  const sortBy = params.sortBy ?? "updatedAt";
  const sortDir = params.sortDir ?? "desc";
  const team = params.team ?? "";
  const assignedTo = params.assignedTo ?? "";
  const action = params.action ?? "";

  let casesResult: Awaited<ReturnType<typeof getCases>> = {
    cases: [],
    total: 0,
    page,
    pageSize: 50,
  };
  let stages: Awaited<ReturnType<typeof getAllStages>> = [];
  let orgUsers: Awaited<ReturnType<typeof getOrgUsers>> = [];

  try {
    [casesResult, stages, orgUsers] = await Promise.all([
      getCases(
        {
          search: search || undefined,
          stageId: stageId || undefined,
          status: status || undefined,
          team: team || undefined,
          assignedToId: assignedTo || undefined,
        },
        { page, pageSize: 50 },
      ),
      getAllStages(),
      getOrgUsers(),
    ]);
  } catch {
    // Retry once
    try {
      [casesResult, stages, orgUsers] = await Promise.all([
        getCases(
          {
            search: search || undefined,
            stageId: stageId || undefined,
            status: status || undefined,
            team: team || undefined,
            assignedToId: assignedTo || undefined,
          },
          { page, pageSize: 50 },
        ),
        getAllStages(),
        getOrgUsers(),
      ]);
    } catch {
      // DB unavailable
    }
  }

  return (
    <div className="space-y-4">
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
        orgUsers={orgUsers}
        initialSearch={search}
        initialStageId={stageId}
        initialTeam={team}
        initialAssignedTo={assignedTo}
        initialSortBy={sortBy}
        initialSortDir={sortDir as "asc" | "desc"}
        initialAction={action}
      />
    </div>
  );
}
