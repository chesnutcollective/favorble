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
  low: "bg-muted text-foreground",
  medium: "bg-warning/10 text-warning",
  high: "bg-urgent/10 text-urgent",
  critical: "bg-urgent text-white",
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
            className="text-[13px] text-brand-600 hover:underline"
          >
            View training gaps →
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-2">Open flags</p>
            <p className="text-[28px] font-bold tracking-[-1px] leading-[1.1] tabular-nums">{openCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-2">People problems</p>
            <p className="text-[28px] font-bold tracking-[-1px] leading-[1.1] tabular-nums">{peopleCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-2">Process problems</p>
            <p className="text-[28px] font-bold tracking-[-1px] leading-[1.1] tabular-nums">{processCount}</p>
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
                  className="h-32"
                >
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="text-3xl text-muted-foreground mb-3">🎯</div>
                    <p className="text-sm font-medium text-foreground">No open coaching flags</p>
                    <p className="text-xs text-muted-foreground mt-1">Coaching flags will appear here from performance snapshots.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              flags.map((flag) => {
                const band = severityBand(flag.severity);
                return (
                  <TableRow
                    key={flag.id}
                    className="hover:bg-[#FAFAFA] transition-colors duration-200"
                  >
                    <TableCell className="font-medium">
                      {flag.subjectName}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground capitalize">
                      {flag.role.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${SEVERITY_COLORS[band]}`}
                      >
                        {flag.severity}/10 · {band}
                      </span>
                    </TableCell>
                    <TableCell className="text-[13px] font-mono text-muted-foreground">
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
                        <span className="text-[12px] text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground max-w-md truncate">
                      {flag.summary}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/coaching/${flag.id}`}
                        className="text-[13px] text-brand-600 hover:underline"
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
