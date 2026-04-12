import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getBottleneckAnalysis } from "@/app/actions/team-reports";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COLORS } from "@/lib/design-tokens";
import { BottleneckTable } from "./bottleneck-table";

export const metadata: Metadata = {
  title: "Bottlenecks",
};

export default async function BottlenecksPage() {
  await requireSession();

  let rows: Awaited<ReturnType<typeof getBottleneckAnalysis>> = [];
  try {
    rows = await getBottleneckAnalysis();
  } catch {
    // DB unavailable
  }

  const total = rows.reduce((sum, r) => sum + r.activeCaseCount, 0);
  const withOverdue = rows.filter((r) => r.overdueTaskCount > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bottleneck Analysis"
        description="Stages where cases are piling up. Click a row to see the individual cases stuck at that stage."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Stages flagged
            </p>
            <p className="text-[28px] font-bold tracking-[-1px] leading-[1.1] tabular-nums">
              {rows.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Cases in flagged stages
            </p>
            <p className="text-[28px] font-bold tracking-[-1px] leading-[1.1] tabular-nums">
              {total.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Stages with overdue tasks
            </p>
            <p
              className="text-[28px] font-bold tracking-[-1px] leading-[1.1] tabular-nums"
              style={{ color: withOverdue > 0 ? COLORS.bad : COLORS.ok }}
            >
              {withOverdue}
            </p>
          </CardContent>
        </Card>
      </div>

      <BottleneckTable rows={rows} />
    </div>
  );
}
