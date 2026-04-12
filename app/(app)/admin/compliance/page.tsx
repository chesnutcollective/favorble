import type { Metadata } from "next";
import Link from "next/link";
import {
  getComplianceFindings,
  getComplianceRules,
} from "@/app/actions/compliance";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FindingActionsClient } from "./finding-actions-client";

export const metadata: Metadata = {
  title: "Compliance",
};

export const dynamic = "force-dynamic";

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-[#f0f0f0] text-[#444]",
  low: "bg-[#E6F4EA] text-[#1B5E20]",
  medium: "bg-[#FFF4E0] text-[#8A4B00]",
  high: "bg-[#FDECEA] text-[#B31B1B]",
  critical: "bg-[#3A0000] text-white",
};

const CATEGORY_COLORS: Record<string, string> = {
  bar: "bg-[#E8F0FE] text-[#0B57D0]",
  ethics: "bg-[#FFF3E0] text-[#A74400]",
  documentation: "bg-[#F3E8FF] text-[#6B21A8]",
  hipaa: "bg-[#FDECEA] text-[#B31B1B]",
};

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab ?? "open";

  let openFindings: Awaited<ReturnType<typeof getComplianceFindings>> = [];
  let allFindings: Awaited<ReturnType<typeof getComplianceFindings>> = [];
  let rules: Awaited<ReturnType<typeof getComplianceRules>> = [];

  try {
    [openFindings, allFindings, rules] = await Promise.all([
      getComplianceFindings("open"),
      getComplianceFindings(),
      getComplianceRules(),
    ]);
  } catch {
    // DB unavailable
  }

  const criticalOpen = openFindings.filter(
    (f) => f.severity === "critical",
  ).length;
  const highOpen = openFindings.filter((f) => f.severity === "high").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance"
        description="Rules, findings, and remediation tracking for bar, ethics, documentation, and HIPAA controls."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[12px] text-[#666]">Open findings</p>
            <p className="text-[28px] font-semibold">{openFindings.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[12px] text-[#666]">Critical</p>
            <p className="text-[28px] font-semibold text-[#B31B1B]">
              {criticalOpen}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[12px] text-[#666]">High</p>
            <p className="text-[28px] font-semibold text-[#E06C00]">
              {highOpen}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="open">Open findings</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="all">All findings</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-4">
          <FindingsTable
            findings={openFindings}
            emptyLabel="No open findings. Nicely done."
          />
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Default severity</TableHead>
                  <TableHead>Enabled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No rules seeded. Run scripts/seed-compliance-rules.ts
                    </TableCell>
                  </TableRow>
                ) : (
                  rules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-[12px]">
                        {r.code}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-[13px] font-medium">{r.name}</p>
                          <p className="text-[12px] text-[#666] mt-0.5">
                            {r.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                            CATEGORY_COLORS[r.category] ?? ""
                          }`}
                        >
                          {r.category}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                            SEVERITY_COLORS[r.defaultSeverity] ?? ""
                          }`}
                        >
                          {r.defaultSeverity}
                        </span>
                      </TableCell>
                      <TableCell>
                        {r.enabled ? (
                          <Badge variant="secondary">enabled</Badge>
                        ) : (
                          <Badge variant="outline">disabled</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <FindingsTable
            findings={allFindings}
            emptyLabel="No findings at all."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FindingsTable({
  findings,
  emptyLabel,
}: {
  findings: Awaited<ReturnType<typeof getComplianceFindings>>;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Severity</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead>Case</TableHead>
            <TableHead>Summary</TableHead>
            <TableHead>Remediation</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Detected</TableHead>
            <TableHead className="w-48" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {findings.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={8}
                className="h-24 text-center text-muted-foreground"
              >
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            findings.map((f) => (
              <TableRow key={f.id}>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                      SEVERITY_COLORS[f.severity] ?? ""
                    }`}
                  >
                    {f.severity}
                  </span>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="text-[13px]">{f.ruleName ?? f.ruleCode}</p>
                    <p className="text-[11px] font-mono text-[#999]">
                      {f.ruleCode}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  {f.caseId ? (
                    <Link
                      href={`/cases/${f.caseId}`}
                      className="text-[13px] text-[#0066cc] hover:underline font-mono"
                    >
                      {f.caseNumber ?? f.caseId.slice(0, 8)}
                    </Link>
                  ) : (
                    <span className="text-[12px] text-[#999] font-mono">
                      {f.subjectType}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-[13px] max-w-sm">
                  {f.summary}
                </TableCell>
                <TableCell className="text-[12px] text-[#666] max-w-xs">
                  {f.remediationHint ?? "—"}
                </TableCell>
                <TableCell className="text-[12px] capitalize">
                  {f.status.replace(/_/g, " ")}
                </TableCell>
                <TableCell className="text-[12px] font-mono text-[#666]">
                  {new Date(f.detectedAt).toISOString().split("T")[0]}
                </TableCell>
                <TableCell>
                  <FindingActionsClient findingId={f.id} status={f.status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
