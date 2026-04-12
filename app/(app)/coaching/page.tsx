import type { Metadata } from "next";
import Link from "next/link";
import { getCoachingFlags } from "@/app/actions/coaching";
import { PageHeader } from "@/components/shared/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Coaching",
};

export const dynamic = "force-dynamic";

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-[#f0f0f0] text-[#444]",
  medium: "bg-[#fff4e0] text-[#8a4b00]",
  high: "bg-[#ffe5e0] text-[#a02400]",
  critical: "bg-[#3a0000] text-white",
};

function severityBand(
  severity: number,
): "low" | "medium" | "high" | "critical" {
  if (severity <= 3) return "low";
  if (severity <= 5) return "medium";
  if (severity <= 8) return "high";
  return "critical";
}

export default async function CoachingPage() {
  let flags: Awaited<ReturnType<typeof getCoachingFlags>> = [];
  try {
    flags = await getCoachingFlags("open");
  } catch {
    // DB unavailable
  }

  const openCount = flags.filter((f) => f.status === "open").length;
  const peopleCount = flags.filter((f) => f.classification === "people").length;
  const processCount = flags.filter(
    (f) => f.classification === "process",
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coaching"
        description="Open coaching flags raised from this week's performance snapshots."
        actions={
          <Link
            href="/coaching/training-gaps"
            className="text-[13px] text-[#0066cc] hover:underline"
          >
            View training gaps →
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[12px] text-[#666]">Open flags</p>
            <p className="text-[28px] font-semibold">{openCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[12px] text-[#666]">People problems</p>
            <p className="text-[28px] font-semibold">{peopleCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[12px] text-[#666]">Process problems</p>
            <p className="text-[28px] font-semibold">{processCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Metric</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {flags.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  No open coaching flags.
                </TableCell>
              </TableRow>
            ) : (
              flags.map((flag) => {
                const band = severityBand(flag.severity);
                return (
                  <TableRow key={flag.id}>
                    <TableCell className="font-medium">
                      {flag.subjectName}
                    </TableCell>
                    <TableCell className="text-[13px] text-[#666] capitalize">
                      {flag.role.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${SEVERITY_COLORS[band]}`}
                      >
                        {flag.severity}/10 · {band}
                      </span>
                    </TableCell>
                    <TableCell className="text-[13px] font-mono text-[#666]">
                      {flag.metricKey}
                    </TableCell>
                    <TableCell>
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
                        <span className="text-[12px] text-[#999]">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[13px] text-[#444] max-w-md truncate">
                      {flag.summary}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/coaching/${flag.id}`}
                        className="text-[13px] text-[#0066cc] hover:underline"
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
