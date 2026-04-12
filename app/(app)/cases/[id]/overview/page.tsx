import { getCaseById, getCaseActivity } from "@/app/actions/cases";
import { getCaseTasks } from "@/app/actions/tasks";
import { getCaseDocuments } from "@/app/actions/documents";
import { getCaseSentimentTimeline } from "@/app/actions/sentiment-analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Timeline, type TimelineEvent } from "@/components/shared/timeline";
import { Sparkline } from "@/components/charts/sparkline";
import { COLORS } from "@/lib/design-tokens";
import { notFound } from "next/navigation";
import Link from "next/link";

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
  let sentimentPoints: Awaited<
    ReturnType<typeof getCaseSentimentTimeline>
  > = [];

  try {
    [caseData, tasks, activity, docs, sentimentPoints] = await Promise.all([
      getCaseById(caseId),
      getCaseTasks(caseId),
      getCaseActivity(caseId),
      getCaseDocuments(caseId),
      getCaseSentimentTimeline(caseId, 30),
    ]);
  } catch {
    // DB unavailable
  }

  if (!caseData) notFound();

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

  // QA-3: per-case sentiment sparkline (last 30 days). Shows the
  // weighted sentiment trace so PMs can see at a glance whether the
  // claimant relationship is heating up or cooling down. Hidden when
  // there's no analyzed data yet.
  const sentimentValues = sentimentPoints.map((p) => p.weight);
  const latestSentiment = sentimentPoints.at(-1)?.label ?? null;
  const sentimentStrokeColor = (() => {
    if (!latestSentiment) return COLORS.text4;
    if (latestSentiment === "positive") return COLORS.ok;
    if (latestSentiment === "neutral") return COLORS.text3;
    if (latestSentiment === "confused") return COLORS.brand;
    if (latestSentiment === "frustrated") return COLORS.warn;
    return COLORS.bad;
  })();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Sentiment timeline (QA-3) */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Sentiment trend</CardTitle>
            <span className="text-xs text-muted-foreground">
              {sentimentPoints.length === 0
                ? "No analyzed messages yet"
                : `${sentimentPoints.length} signals · last 30 days`}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Sparkline
              data={sentimentValues}
              width={240}
              height={36}
              stroke={sentimentStrokeColor}
            />
            {latestSentiment && (
              <Badge variant="outline" className="text-xs capitalize">
                {latestSentiment.replace("_", " ")}
              </Badge>
            )}
          </div>
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
            <p className="text-sm text-muted-foreground py-2">No open tasks</p>
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
            <p className="text-sm text-muted-foreground py-2">No documents</p>
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
                      {doc.source} &middot; {doc.createdAt.toLocaleDateString()}
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
  );
}
