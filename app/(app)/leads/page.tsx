import type { Metadata } from "next";
import { getLeadsByStage } from "@/app/actions/leads";
import { LeadsPipelineClient, type ClientLead } from "./client";
import {
  PIPELINE_STAGES,
  PIPELINE_GROUPS,
  getStagesByGroup,
  DEFAULT_PIPELINE_STAGE_ID,
  type PipelineStageGroup,
} from "@/lib/services/lead-pipeline-config";

export const metadata: Metadata = {
  title: "Leads",
};

type GroupPayload = {
  id: PipelineStageGroup;
  label: string;
  color: string;
  order: number;
  stages: Array<{
    id: string;
    label: string;
    color: string;
    order: number;
    isTerminal: boolean;
    leads: ClientLead[];
  }>;
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const action = params.action ?? "";
  const stageParam = params.stage ?? params.status ?? "";

  let leadsByStage = new Map<string, Awaited<ReturnType<typeof getLeadsByStage>> extends Map<string, infer V> ? V : never>();
  try {
    leadsByStage = await getLeadsByStage();
  } catch {
    // DB unavailable — render an empty pipeline.
    for (const stage of PIPELINE_STAGES) {
      leadsByStage.set(stage.id, []);
    }
  }

  const stagesByGroup = getStagesByGroup();

  const groups: GroupPayload[] = (
    Object.keys(PIPELINE_GROUPS) as PipelineStageGroup[]
  )
    .sort((a, b) => PIPELINE_GROUPS[a].order - PIPELINE_GROUPS[b].order)
    .map((groupId) => ({
      id: groupId,
      label: PIPELINE_GROUPS[groupId].label,
      color: PIPELINE_GROUPS[groupId].color,
      order: PIPELINE_GROUPS[groupId].order,
      stages: stagesByGroup[groupId].map((stage) => ({
        id: stage.id,
        label: stage.label,
        color: stage.color,
        order: stage.order,
        isTerminal: stage.isTerminal,
        leads: (leadsByStage.get(stage.id) ?? []).map((l) => ({
          id: l.id,
          firstName: l.firstName,
          lastName: l.lastName,
          email: l.email,
          phone: l.phone,
          source: l.source,
          createdAt: l.createdAt.toISOString(),
          notes: l.notes,
          pipelineStage: l.pipelineStage ?? DEFAULT_PIPELINE_STAGE_ID,
        })),
      })),
    }));

  const allStages = PIPELINE_STAGES.map((s) => ({
    id: s.id,
    label: s.label,
    group: s.group,
    order: s.order,
    color: s.color,
    isTerminal: s.isTerminal,
  }));

  return (
    <div className="space-y-4">
      <LeadsPipelineClient
        groups={groups}
        allStages={allStages}
        initialAction={action}
        initialStage={stageParam}
      />
    </div>
  );
}
