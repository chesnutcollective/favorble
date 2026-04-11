import type { Metadata } from "next";
import { getCases, getOrgUsers } from "@/app/actions/cases";
import { getAllStages } from "@/app/actions/stages";
import { PageHeader } from "@/components/shared/page-header";
import { CasesListClient } from "./client";
import { db } from "@/db/drizzle";
import { communications } from "@/db/schema";
import { and, desc, inArray, isNotNull } from "drizzle-orm";
import { isAtRiskLabel } from "@/lib/services/case-health";

export const metadata: Metadata = {
  title: "Cases",
};

// Org-scoped list with per-request filters — always dynamic.
export const dynamic = "force-dynamic";

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

  // QA-3: flag cases whose most recent communication has an at-risk
  // sentiment label (frustrated / angry / churn_risk) so the list
  // renders a red "At risk" pill next to the case number.
  const atRiskCaseIds = new Set<string>();
  const visibleIds = casesResult.cases.map((c) => c.id);
  if (visibleIds.length > 0) {
    try {
      const latest = await db
        .selectDistinctOn([communications.caseId], {
          caseId: communications.caseId,
          sentimentLabel: communications.sentimentLabel,
          createdAt: communications.createdAt,
        })
        .from(communications)
        .where(
          and(
            inArray(
              communications.caseId,
              visibleIds as [string, ...string[]],
            ),
            isNotNull(communications.sentimentLabel),
          ),
        )
        .orderBy(communications.caseId, desc(communications.createdAt));
      for (const row of latest) {
        if (row.caseId && isAtRiskLabel(row.sentimentLabel)) {
          atRiskCaseIds.add(row.caseId);
        }
      }
    } catch {
      // Non-fatal — the badge is purely informational.
    }
  }

  return (
    <div className="space-y-4">
      <CasesListClient
        cases={casesResult.cases.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          atRisk: atRiskCaseIds.has(c.id),
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
