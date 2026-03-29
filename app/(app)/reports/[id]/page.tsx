import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import {
  getCasesByStageReport,
  getCasesByTeamMember,
  getAverageTimeInStage,
  getCasesOverTime,
  getPipelineFunnelData,
  getTaskCompletionStats,
  filterDetailedReport,
} from "@/app/actions/reports";
import { PageHeader } from "@/components/shared/page-header";
import { ReportDetailClient } from "@/components/charts/report-detail-client";
import Link from "next/link";

const REPORT_META: Record<string, { title: string; description: string }> = {
  "cases-by-stage": {
    title: "Cases by Stage",
    description: "Active case distribution across pipeline stages.",
  },
  "team-member": {
    title: "Cases by Team Member",
    description: "Case counts grouped by assigned staff member.",
  },
  "time-in-stage": {
    title: "Average Time in Stage",
    description: "Average number of days cases spend in each pipeline stage.",
  },
  "cases-over-time": {
    title: "Cases Over Time",
    description: "Cases opened and closed per week or month.",
  },
  "pipeline-funnel": {
    title: "Pipeline Funnel",
    description: "Case counts flowing through each stage group.",
  },
  "task-completion": {
    title: "Task Completion Rates",
    description: "Completed, pending, and overdue task breakdown.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const meta = REPORT_META[id];
  return { title: meta?.title ?? "Report" };
}

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireSession();

  const meta = REPORT_META[id];
  if (!meta) {
    notFound();
  }

  // Fetch initial data based on report type
  let initialData: Record<string, unknown> = {};
  try {
    switch (id) {
      case "cases-by-stage": {
        const stageReport = await getCasesByStageReport();
        initialData = {
          stageReport: stageReport.map((r) => ({
            stageName: r.stageName,
            stageCode: r.stageCode,
            stageGroupName: r.stageGroupName,
            stageGroupColor: r.stageGroupColor,
            caseCount: r.caseCount,
          })),
        };
        break;
      }
      case "team-member": {
        initialData = { teamMember: await getCasesByTeamMember() };
        break;
      }
      case "time-in-stage": {
        initialData = { timeInStage: await getAverageTimeInStage() };
        break;
      }
      case "cases-over-time": {
        initialData = { casesOverTime: await getCasesOverTime(null, null) };
        break;
      }
      case "pipeline-funnel": {
        initialData = { pipelineFunnel: await getPipelineFunnelData() };
        break;
      }
      case "task-completion": {
        initialData = { taskStats: await getTaskCompletionStats() };
        break;
      }
    }
  } catch {
    // DB unavailable — render with empty data
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/reports" className="hover:underline">
          Reports
        </Link>
        <span>/</span>
        <span className="text-foreground">{meta.title}</span>
      </div>

      <PageHeader title={meta.title} description={meta.description} />

      <ReportDetailClient
        reportType={id}
        initialData={initialData}
        onFilter={filterDetailedReport}
      />
    </div>
  );
}
