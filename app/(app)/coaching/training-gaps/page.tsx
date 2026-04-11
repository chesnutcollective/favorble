import type { Metadata } from "next";
import Link from "next/link";
import { getTrainingGaps } from "@/app/actions/coaching";
import { PageHeader } from "@/components/shared/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Training gaps",
};

export const dynamic = "force-dynamic";

export default async function TrainingGapsPage() {
  let gaps: Awaited<ReturnType<typeof getTrainingGaps>> = [];
  try {
    gaps = await getTrainingGaps();
  } catch {
    // DB unavailable
  }

  // Group by role
  const byRole = new Map<string, typeof gaps>();
  for (const g of gaps) {
    const list = byRole.get(g.role) ?? [];
    list.push(g);
    byRole.set(g.role, list);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training gaps"
        description="Roles where at least half the team is below target on a shared metric."
        actions={
          <Link
            href="/coaching"
            className="text-[13px] text-[#0066cc] hover:underline"
          >
            ← Back to coaching
          </Link>
        }
      />

      {byRole.size === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-[#666]">
            No training gaps detected.
          </CardContent>
        </Card>
      ) : (
        Array.from(byRole.entries()).map(([role, roleGaps]) => (
          <Card key={role}>
            <CardContent className="p-4">
              <h3 className="text-[14px] font-semibold capitalize mb-3">
                {role.replace(/_/g, " ")}
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>Affected / Total</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Recommendation</TableHead>
                    <TableHead>Detected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roleGaps.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-mono text-[12px]">
                        {g.metricKey}
                      </TableCell>
                      <TableCell className="text-[13px]">
                        <span className="font-semibold">
                          {g.affectedUserCount}
                        </span>
                        {" / "}
                        {g.totalUserCount}
                      </TableCell>
                      <TableCell className="text-[13px] text-[#444]">
                        {g.summary}
                      </TableCell>
                      <TableCell className="text-[13px] text-[#444]">
                        {g.recommendation ?? "—"}
                      </TableCell>
                      <TableCell className="text-[12px] text-[#666] font-mono">
                        {new Date(g.detectedAt).toISOString().split("T")[0]}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
