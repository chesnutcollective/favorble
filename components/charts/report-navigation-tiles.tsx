"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

const REPORTS = [
  {
    id: "cases-by-stage",
    title: "Cases by Stage",
    description: "View active case distribution across pipeline stages.",
    icon: "📊",
  },
  {
    id: "team-member",
    title: "Cases by Team Member",
    description: "Case counts grouped by assigned staff member.",
    icon: "👥",
  },
  {
    id: "time-in-stage",
    title: "Average Time in Stage",
    description: "How long cases spend in each pipeline stage.",
    icon: "⏱",
  },
  {
    id: "cases-over-time",
    title: "Cases Over Time",
    description: "Cases opened and closed per week or month.",
    icon: "📈",
  },
  {
    id: "pipeline-funnel",
    title: "Pipeline Funnel",
    description: "Case counts flowing through stage groups.",
    icon: "🔽",
  },
  {
    id: "task-completion",
    title: "Task Completion Rates",
    description: "Completed, pending, and overdue task breakdown.",
    icon: "✅",
  },
] as const;

export function ReportNavigationTiles() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {REPORTS.map((report) => (
        <Link key={report.id} href={`/reports/${report.id}`}>
          <Card className="h-full transition-colors hover:bg-accent cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl" role="img" aria-label={report.title}>
                  {report.icon}
                </span>
                <div>
                  <h3 className="font-medium text-foreground">
                    {report.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {report.description}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
