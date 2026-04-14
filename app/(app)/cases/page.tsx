import type { Metadata } from "next";
import { getCases, getOrgUsers, listSavedViews } from "@/app/actions/cases";
import { getAllStages } from "@/app/actions/stages";
import { CasesListClient } from "./client";
import { db } from "@/db/drizzle";
import { cases, communications } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { isAtRiskLabel } from "@/lib/services/case-health";

export const metadata: Metadata = {
  title: "Cases",
};

// Org-scoped list with per-request filters — always dynamic.
export const dynamic = "force-dynamic";

async function getPracticeAreaOptions(organizationId: string) {
  try {
    const rows = await db
      .selectDistinct({ value: cases.applicationTypePrimary })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, organizationId),
          isNull(cases.deletedAt),
          sql`${cases.applicationTypePrimary} IS NOT NULL`,
        ),
      );
    return rows
      .map((r) => r.value)
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .sort();
  } catch {
    return [];
  }
}

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
  const practice = params.practice ?? "";
  const language = params.language ?? "";
  const unread = params.unread === "1" || params.unread === "true";
  const urgency = params.urgency ?? "";
  const view = params.view ?? "";

  // Resolve session up-front so we can apply seeded filters before querying.
  let sessionId = "";
  let organizationId = "";
  try {
    const session = await requireSession();
    sessionId = session.id;
    organizationId = session.organizationId;
  } catch {
    // Session required by downstream queries; rethrow is handled by requireSession
  }

  // Seeded views — computed on-the-fly. Apply their filter transforms before
  // calling getCases so they return the correct rows without persisting rows.
  const effectiveSearch = search;
  const effectiveStage = stageId;
  let effectiveStatus = status;
  const effectiveTeam = team;
  let effectiveAssignedTo = assignedTo;
  const effectivePractice = practice;
  const effectiveLanguage = language;
  const effectiveUnread = unread;
  const effectiveUrgency = urgency;
  let closedSinceIso: string | null = null;

  if (view === "my-cases" && sessionId) {
    effectiveAssignedTo = sessionId;
    if (!effectiveStatus) effectiveStatus = "active";
  } else if (view === "on-hold") {
    effectiveStatus = "on_hold";
  } else if (view === "closed-this-month") {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    closedSinceIso = firstOfMonth.toISOString();
  }

  let casesResult: Awaited<ReturnType<typeof getCases>> = {
    cases: [],
    total: 0,
    page,
    pageSize: 50,
  };
  let stages: Awaited<ReturnType<typeof getAllStages>> = [];
  let orgUsers: Awaited<ReturnType<typeof getOrgUsers>> = [];
  let savedViews: Awaited<ReturnType<typeof listSavedViews>> = [];
  let practiceAreas: string[] = [];

  async function runQueries() {
    const [casesRes, stagesRes, orgUsersRes, savedViewsRes, practiceRes] =
      await Promise.all([
        getCases(
          {
            search: effectiveSearch || undefined,
            stageId: effectiveStage || undefined,
            status: effectiveStatus || undefined,
            team: effectiveTeam || undefined,
            assignedToId: effectiveAssignedTo || undefined,
            practiceArea: effectivePractice || undefined,
            language: effectiveLanguage || undefined,
            unreadOnly: effectiveUnread || undefined,
            urgency: effectiveUrgency || undefined,
            sortBy: sortBy as
              | "caseNumber"
              | "updatedAt"
              | "createdAt"
              | "stage"
              | "assignedTo",
            sortDir: sortDir as "asc" | "desc",
          },
          { page, pageSize: 50 },
        ),
        getAllStages(),
        getOrgUsers(),
        listSavedViews(),
        organizationId
          ? getPracticeAreaOptions(organizationId)
          : Promise.resolve([] as string[]),
      ]);
    return { casesRes, stagesRes, orgUsersRes, savedViewsRes, practiceRes };
  }

  try {
    const r = await runQueries();
    casesResult = r.casesRes;
    stages = r.stagesRes;
    orgUsers = r.orgUsersRes;
    savedViews = r.savedViewsRes;
    practiceAreas = r.practiceRes;
  } catch {
    try {
      const r = await runQueries();
      casesResult = r.casesRes;
      stages = r.stagesRes;
      orgUsers = r.orgUsersRes;
      savedViews = r.savedViewsRes;
      practiceAreas = r.practiceRes;
    } catch {
      // DB unavailable
    }
  }

  // Post-filter the 'closed-this-month' seeded view client-side since getCases
  // doesn't expose a closedAt filter yet. Acceptable because the list is
  // already paginated and this is a narrow server-only narrowing.
  if (view === "closed-this-month" && closedSinceIso) {
    const since = new Date(closedSinceIso).getTime();
    const filtered = casesResult.cases.filter((c) => {
      if (!["closed_won", "closed_lost", "closed_withdrawn"].includes(c.status))
        return false;
      return new Date(c.updatedAt).getTime() >= since;
    });
    casesResult = {
      ...casesResult,
      cases: filtered,
      total: filtered.length,
    };
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
            inArray(communications.caseId, visibleIds as [string, ...string[]]),
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
        practiceAreas={practiceAreas}
        savedViews={savedViews}
        initialSearch={search}
        initialStageId={stageId}
        initialTeam={team}
        initialAssignedTo={assignedTo}
        initialPractice={practice}
        initialLanguage={language}
        initialUnread={unread}
        initialUrgency={urgency}
        initialView={view}
        initialSortBy={sortBy}
        initialSortDir={sortDir as "asc" | "desc"}
        initialAction={action}
      />
    </div>
  );
}
