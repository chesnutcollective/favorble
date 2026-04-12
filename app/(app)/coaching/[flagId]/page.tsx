import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCoachingFlagById,
  getCoachingDraftsForFlag,
} from "@/app/actions/coaching";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlagActionsClient } from "./flag-actions-client";
import { getRecipe } from "@/lib/services/coaching-library";

export const metadata: Metadata = {
  title: "Coaching flag",
};

export const dynamic = "force-dynamic";

export default async function CoachingFlagDetailPage({
  params,
}: {
  params: Promise<{ flagId: string }>;
}) {
  const { flagId } = await params;

  const [flag, drafts] = await Promise.all([
    getCoachingFlagById(flagId),
    getCoachingDraftsForFlag(flagId),
  ]);

  if (!flag) {
    notFound();
  }

  const conversationDrafts = drafts.filter((d) => d.kind === "conversation");
  const scriptDrafts = drafts.filter((d) => d.kind === "call_script");
  const recipe = getRecipe(flag.role, flag.metricKey);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Coaching: ${flag.subjectName}`}
        description={`${flag.role.replace(/_/g, " ")} · ${flag.metricKey}`}
        actions={
          <Link
            href="/coaching"
            className="text-[13px] text-[#0066cc] hover:underline"
          >
            ← Back to coaching
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-[12px] text-[#666]">Severity</p>
            <p className="text-[24px] font-semibold">{flag.severity}/10</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[12px] text-[#666]">Status</p>
            <p className="text-[14px] font-medium capitalize">
              {flag.status.replace(/_/g, " ")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[12px] text-[#666]">Classification</p>
            {flag.classification ? (
              <Badge
                variant={
                  flag.classification === "people"
                    ? "destructive"
                    : "secondary"
                }
              >
                {flag.classification}
              </Badge>
            ) : (
              <p className="text-[14px] text-[#999]">—</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[12px] text-[#666]">Detected</p>
            <p className="text-[13px] font-mono">
              {new Date(flag.detectedAt).toISOString().split("T")[0]}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-[14px] font-semibold">Summary</h3>
          <p className="text-[13px] text-[#444]">{flag.summary}</p>
          {flag.suggestedActionSteps.length > 0 && (
            <div>
              <p className="text-[12px] text-[#666] mt-3 mb-2">
                Suggested action steps
              </p>
              <ul className="space-y-1 text-[13px] text-[#333] list-disc pl-5">
                {flag.suggestedActionSteps.map((step, i) => (
                  <li key={i}>{step.label}</li>
                ))}
              </ul>
            </div>
          )}
          {flag.notes && (
            <div>
              <p className="text-[12px] text-[#666] mt-3 mb-1">Notes</p>
              <p className="text-[13px] text-[#444]">{flag.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {recipe && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold">Action Plan</h3>
              <span className="text-[11px] text-[#999] uppercase tracking-wide">
                From coaching library
              </span>
            </div>
            <p className="text-[13px] text-[#444]">{recipe.diagnosis}</p>
            <ul className="space-y-3 mt-3">
              {recipe.actionSteps.map((step, i) => (
                <li
                  key={i}
                  className="flex gap-3 rounded border border-[#eee] p-3"
                >
                  <input
                    type="checkbox"
                    disabled
                    className="mt-1 h-4 w-4 rounded border-[#ccc]"
                  />
                  <div className="flex-1 space-y-1">
                    <p className="text-[13px] font-semibold text-[#222]">
                      {step.label}
                    </p>
                    <p className="text-[12px] text-[#555]">
                      {step.description}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                      <span className="text-[11px] text-[#666]">
                        <span className="text-[#999]">Expected: </span>
                        {step.expectedOutcome}
                      </span>
                      <span className="text-[11px] text-[#666]">
                        <span className="text-[#999]">Timeframe: </span>
                        {step.timeframe}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {recipe && recipe.commonRootCauses.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-[14px] font-semibold">Common Root Causes</h3>
            <p className="text-[12px] text-[#666]">
              Patterns we typically see when this metric goes sideways. Use
              these to frame diagnostic questions during the conversation.
            </p>
            <ul className="mt-2 space-y-1 text-[13px] text-[#333] list-disc pl-5">
              {recipe.commonRootCauses.map((cause, i) => (
                <li key={i}>{cause}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {recipe && recipe.trainingResources.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-[14px] font-semibold">Training Resources</h3>
            <p className="text-[12px] text-[#666]">
              Point the team member at these during or after the coaching
              conversation.
            </p>
            <ul className="mt-2 space-y-1 text-[13px] text-[#333] list-disc pl-5">
              {recipe.trainingResources.map((resource, i) => (
                <li key={i}>{resource}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <FlagActionsClient
        flagId={flag.id}
        status={flag.status}
        hasConversationDraft={conversationDrafts.length > 0}
        hasCallScript={scriptDrafts.length > 0}
      />

      {conversationDrafts.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-[14px] font-semibold">Conversation outline</h3>
            {conversationDrafts.map((d) => (
              <div
                key={d.id}
                className="rounded border border-[#eee] p-3 space-y-2"
              >
                <p className="text-[13px] text-[#666]">{d.title}</p>
                <pre className="whitespace-pre-wrap text-[13px] text-[#222] font-sans">
                  {d.body}
                </pre>
                {d.examples.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[#eee]">
                    <p className="text-[11px] text-[#666] uppercase">
                      Examples
                    </p>
                    <ul className="text-[12px] text-[#444] mt-1 space-y-1">
                      {d.examples.map((ex, i) => (
                        <li key={i}>
                          <span className="font-mono">{ex.eventDate}</span>
                          {ex.caseId && (
                            <span className="text-[#999]">
                              {" "}
                              · case {ex.caseId.slice(0, 8)}
                            </span>
                          )}
                          {" — "}
                          {ex.observation}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {scriptDrafts.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-[14px] font-semibold">Call script</h3>
            {scriptDrafts.map((d) => (
              <div
                key={d.id}
                className="rounded border border-[#eee] p-3 space-y-2"
              >
                <p className="text-[13px] text-[#666]">{d.title}</p>
                <pre className="whitespace-pre-wrap text-[13px] text-[#222] font-sans">
                  {d.body}
                </pre>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
