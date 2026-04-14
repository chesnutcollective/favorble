import {
  getCaseById,
  getCaseActivity,
  getCaseContacts,
  getStageChecklistProgress,
} from "@/app/actions/cases";
import { getCaseTasks } from "@/app/actions/tasks";
import { getCaseDocuments } from "@/app/actions/documents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Timeline, type TimelineEvent } from "@/components/shared/timeline";
import { AiSummaryCard } from "@/components/cases/ai-summary-card";
import { AddClientDialog } from "@/components/cases/add-client-dialog";
import { StageChecklistCard } from "@/components/cases/stage-checklist-card";
import { notFound } from "next/navigation";
import Link from "next/link";

const AI_SUMMARY_STALE_MS = 14 * 24 * 60 * 60 * 1000;

const RELATIONSHIP_LABELS: Record<string, string> = {
  claimant: "Claimant",
  spouse: "Spouse",
  parent: "Parent",
  guardian: "Guardian",
  rep_payee: "Rep Payee",
  attorney_in_fact: "Attorney in Fact",
  other: "Other",
};

export default async function CaseOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: caseId } = await params;

  let caseData: Awaited<ReturnType<typeof getCaseById>> = null;
  let tasks: Awaited<ReturnType<typeof getCaseTasks>> = [];
  let activity: Awaited<ReturnType<typeof getCaseActivity>> = [];
  let docs: Awaited<ReturnType<typeof getCaseDocuments>> = [];
  let parties: Awaited<ReturnType<typeof getCaseContacts>> = [];

  try {
    [caseData, tasks, activity, docs, parties] = await Promise.all([
      getCaseById(caseId),
      getCaseTasks(caseId),
      getCaseActivity(caseId),
      getCaseDocuments(caseId),
      getCaseContacts(caseId),
    ]);
  } catch {
    // DB unavailable
  }

  if (!caseData) notFound();

  // D4: stage checklist progress for the case's current stage. Loaded
  // serially after getCaseById because we need the stageId. Swallow DB
  // failures — the card will render an empty state.
  let checklist: Awaited<ReturnType<typeof getStageChecklistProgress>> | null =
    null;
  if (caseData.currentStageId) {
    try {
      checklist = await getStageChecklistProgress(
        caseId,
        caseData.currentStageId,
      );
    } catch {
      checklist = null;
    }
  }

  const openTasks = tasks.filter(
    (t) => t.status !== "completed" && t.status !== "skipped",
  );
  const recentDocs = docs.slice(0, 5);

  // Convert activity to timeline events
  const timelineEvents: TimelineEvent[] = activity.slice(0, 10).map((a) => ({
    id: a.id,
    type: "stage_changed",
    title: a.fromStageId ? "Stage changed" : "Case created",
    description: a.notes ?? undefined,
    timestamp: a.transitionedAt.toISOString(),
    actor: a.userName ?? undefined,
  }));

  // Determine whether the persisted AI summary is fresh, stale, or missing.
  // Stale (>14 days) still renders the existing text but is flagged to the
  // user with a "regenerate" affordance.
  const summaryGeneratedAt = caseData.aiSummaryGeneratedAt ?? null;
  const summaryAgeMs = summaryGeneratedAt
    ? Date.now() - summaryGeneratedAt.getTime()
    : Number.POSITIVE_INFINITY;
  const summaryIsStale = summaryAgeMs > AI_SUMMARY_STALE_MS;

  return (
    <div className="space-y-4">
      {/* Pinned AI Summary hero (D1).
          We pass the raw summary (even when stale) so the user can see what
          they have while the card prompts them to regenerate. */}
      <AiSummaryCard
        caseId={caseId}
        initialSummary={caseData.aiSummary ?? null}
        initialGeneratedAt={summaryGeneratedAt?.toISOString() ?? null}
        isStale={Boolean(caseData.aiSummary) && summaryIsStale}
      />

      {/* Referral pill (E9) */}
      {caseData.referralSource && (
        <p className="text-xs text-muted-foreground">
          Referral:{" "}
          <span className="font-medium text-foreground">
            {caseData.referralSource}
          </span>
        </p>
      )}

      {/* D4 — Stage Checklist. Rendered above Parties so it's the first
          thing the case owner sees after the AI summary. Required items
          gate stage advance via `changeCaseStage`. */}
      {checklist && caseData.currentStageId && (
        <StageChecklistCard
          caseId={caseId}
          stageId={caseData.currentStageId}
          stageName={caseData.stageName ?? "Current stage"}
          items={checklist.items}
          requiredTotal={checklist.requiredTotal}
          requiredDone={checklist.requiredDone}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Parties (E8) */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Parties ({parties.length})
              </CardTitle>
              <AddClientDialog caseId={caseId} />
            </div>
          </CardHeader>
          <CardContent>
            {parties.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                No parties attached to this case yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {parties.map((party) => (
                  <li
                    key={party.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {party.firstName} {party.lastName}
                      </p>
                      {(party.email || party.phone) && (
                        <p className="truncate text-xs text-muted-foreground">
                          {party.email}
                          {party.email && party.phone && " · "}
                          {party.phone}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {RELATIONSHIP_LABELS[party.relationship] ??
                          party.relationship}
                      </Badge>
                      {party.isPrimary && (
                        <Badge className="bg-indigo-600 text-white hover:bg-indigo-700 text-xs">
                          Primary
                        </Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Open Tasks */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Open Tasks ({openTasks.length})
              </CardTitle>
              <Link
                href={`/cases/${caseId}/tasks`}
                className="text-sm text-primary hover:underline"
              >
                View All
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {openTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No open tasks
              </p>
            ) : (
              <div className="space-y-2">
                {openTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-start gap-2 py-1">
                    <Checkbox className="mt-0.5" disabled />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {task.assigneeName && (
                          <span className="text-xs text-muted-foreground">
                            {task.assigneeName}
                          </span>
                        )}
                        {task.dueDate && (
                          <span className="text-xs text-muted-foreground">
                            Due {task.dueDate.toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={
                        task.priority === "urgent" || task.priority === "high"
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-xs"
                    >
                      {task.priority}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Documents */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Recent Documents ({docs.length})
              </CardTitle>
              <Link
                href={`/cases/${caseId}/documents`}
                className="text-sm text-primary hover:underline"
              >
                View All
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No documents
              </p>
            ) : (
              <div className="space-y-2">
                {recentDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between py-1"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">
                        {doc.fileName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {doc.source} &middot;{" "}
                        {doc.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                    {doc.category && (
                      <Badge variant="outline" className="text-xs">
                        {doc.category}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Timeline */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <Link
                href={`/cases/${caseId}/activity`}
                className="text-sm text-primary hover:underline"
              >
                View All
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <Timeline events={timelineEvents} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
