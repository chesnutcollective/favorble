"use client";

import { useState, useTransition } from "react";
import { submitEreScrapeJob } from "@/app/actions/ere";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HugeiconsIcon } from "@hugeicons/react";
import { RefreshIcon } from "@hugeicons/core-free-icons";

type EreJob = {
  id: string;
  jobType: string;
  status: string;
  documentsFound: number | null;
  documentsDownloaded: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

type EreScrapingCardProps = {
  caseId: string;
  credentialId: string | null;
  jobs: EreJob[];
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  completed: {
    label: "Completed",
    className: "border-[#eaeaea] text-[#171717]",
  },
  failed: { label: "Failed", className: "border-[#eaeaea] text-[#666]" },
  pending: {
    label: "Pending",
    className: "border-[#eaeaea] text-[#666]",
  },
  running: {
    label: "Running",
    className: "border-[#eaeaea] text-[#171717]",
  },
  cancelled: {
    label: "Cancelled",
    className: "border-[#eaeaea] text-[#666]",
  },
};

const JOB_TYPE_LABELS: Record<string, string> = {
  full_scrape: "Full Scrape",
  incremental_sync: "Incremental Sync",
  document_download: "Document Download",
  status_check: "Status Check",
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60)
    return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24)
    return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

function formatDuration(
  startedAt: string | null,
  completedAt: string | null,
): string {
  if (!startedAt || !completedAt) return "--";
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSec = seconds % 60;
  return `${minutes}m ${remainingSec}s`;
}

export function EreScrapingCard({
  caseId,
  credentialId,
  jobs,
}: EreScrapingCardProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const lastJob = jobs[0] ?? null;
  const recentJobs = jobs.slice(0, 5);
  const totalDocsFound = jobs.reduce(
    (sum, j) => sum + (j.documentsFound ?? 0),
    0,
  );

  function handleSyncNow() {
    if (!credentialId) return;
    setError(null);
    startTransition(async () => {
      try {
        await submitEreScrapeJob({ caseId, credentialId });
      } catch {
        setError("Failed to submit scrape job.");
      }
    });
  }

  if (!credentialId) {
    return (
      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-foreground mb-3">ERE Monitoring</h3>
          <p className="text-sm text-muted-foreground">
            Configure ERE credentials in Admin &rarr; Integrations to enable
            monitoring.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <h3 className="font-medium text-foreground">ERE Monitoring</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncNow}
            disabled={isPending}
          >
            <HugeiconsIcon icon={RefreshIcon} size={14} className="mr-1" />
            {isPending ? "Submitting..." : "Sync Now"}
          </Button>
        </div>

        {error && <p className="mt-2 text-sm text-[#666]">{error}</p>}

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Last Scrape
            </p>
            <p className="mt-0.5 text-sm text-foreground">
              {lastJob
                ? formatRelativeTime(lastJob.completedAt ?? lastJob.createdAt)
                : "--"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <div className="mt-0.5">
              {lastJob ? (
                <Badge
                  variant="outline"
                  className={
                    STATUS_BADGE[lastJob.status]?.className ??
                    "border-border text-muted-foreground"
                  }
                >
                  {STATUS_BADGE[lastJob.status]?.label ?? lastJob.status}
                </Badge>
              ) : (
                <span className="text-sm text-foreground">--</span>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Documents Found
            </p>
            <p className="mt-0.5 text-sm text-foreground">{totalDocsFound}</p>
          </div>
        </div>

        {/* Recent Jobs */}
        {recentJobs.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              Recent Jobs
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          STATUS_BADGE[job.status]?.className ??
                          "border-border text-muted-foreground"
                        }
                      >
                        {STATUS_BADGE[job.status]?.label ?? job.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {JOB_TYPE_LABELS[job.jobType] ?? job.jobType}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {job.documentsFound ?? "--"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDuration(job.startedAt, job.completedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
