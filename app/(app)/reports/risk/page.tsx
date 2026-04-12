import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db/drizzle";
import { cases, caseRiskScores, leads } from "@/db/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Risk reports",
};

export const dynamic = "force-dynamic";

const BAND_COLORS: Record<string, string> = {
  low: "bg-[#E6F4EA] text-[#1B5E20]",
  medium: "bg-[#FFF4E0] text-[#8A4B00]",
  high: "bg-[#FDECEA] text-[#B31B1B]",
  critical: "bg-[#3A0000] text-white",
};

type FactorLite = {
  key: string;
  label: string;
  contribution: number;
  note: string;
};

export default async function RiskReportPage() {
  const session = await requireSession();

  const rows = await db
    .select({
      caseId: caseRiskScores.caseId,
      score: caseRiskScores.score,
      riskBand: caseRiskScores.riskBand,
      factors: caseRiskScores.factors,
      scoredAt: caseRiskScores.scoredAt,
      caseNumber: cases.caseNumber,
      leadId: cases.leadId,
      hearingDate: cases.hearingDate,
    })
    .from(caseRiskScores)
    .innerJoin(cases, eq(caseRiskScores.caseId, cases.id))
    .where(
      and(
        eq(caseRiskScores.organizationId, session.organizationId),
        inArray(caseRiskScores.riskBand, ["high", "critical"]),
        isNull(cases.deletedAt),
      ),
    )
    .orderBy(desc(caseRiskScores.score))
    .limit(200);

  // Resolve claimant names from leads for each row
  const leadIds = rows.map((r) => r.leadId).filter((id): id is string => !!id);
  const leadNameMap = new Map<string, string>();
  if (leadIds.length > 0) {
    const leadRows = await db
      .select({
        id: leads.id,
        firstName: leads.firstName,
        lastName: leads.lastName,
      })
      .from(leads)
      .where(inArray(leads.id, leadIds));
    for (const l of leadRows) {
      leadNameMap.set(l.id, `${l.lastName}, ${l.firstName}`);
    }
  }

  const criticalCount = rows.filter((r) => r.riskBand === "critical").length;
  const highCount = rows.filter((r) => r.riskBand === "high").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Case risk"
        description="High and critical risk cases, sorted by score. Updated hourly."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-[12px] text-[#666]">Critical</p>
            <p className="text-[32px] font-semibold text-[#B31B1B]">
              {criticalCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[12px] text-[#666]">High</p>
            <p className="text-[32px] font-semibold text-[#E06C00]">
              {highCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case</TableHead>
              <TableHead>Claimant</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Band</TableHead>
              <TableHead>Top factors</TableHead>
              <TableHead>Hearing</TableHead>
              <TableHead>Scored</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  No high-risk cases. Breathe.
                </TableCell>
              </TableRow>
            ) : (
              rows.flatMap((r) => {
                const factors = Array.isArray(r.factors)
                  ? (r.factors as FactorLite[])
                  : [];
                // AI narrative is stored as a factor with key="ai_narrative"
                // (see risk-scorer.ts). It has contribution=0, so we filter
                // it out of the "top factors" column.
                const narrativeFactor = factors.find(
                  (f) => f.key === "ai_narrative",
                );
                const numericFactors = factors.filter(
                  (f) => f.key !== "ai_narrative",
                );
                const topFactors = [...numericFactors]
                  .sort((a, b) => b.contribution - a.contribution)
                  .slice(0, 3);
                const claimant = r.leadId
                  ? leadNameMap.get(r.leadId) ?? "Unknown"
                  : "Unknown";
                return [
                  <TableRow key={r.caseId}>
                    <TableCell className="font-mono text-[12px]">
                      <Link
                        href={`/cases/${r.caseId}`}
                        className="text-[#0066cc] hover:underline"
                      >
                        {r.caseNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[13px]">{claimant}</TableCell>
                    <TableCell className="text-[16px] font-semibold">
                      {r.score}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${BAND_COLORS[r.riskBand] ?? ""}`}
                      >
                        {r.riskBand}
                      </span>
                    </TableCell>
                    <TableCell className="text-[12px] text-[#444] max-w-md">
                      {topFactors.length === 0 ? (
                        <span className="text-[#999]">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {topFactors.map((f) => (
                            <li key={f.key}>
                              <span className="font-medium">{f.label}</span>
                              {" · "}
                              <span className="text-[#888]">{f.note}</span>
                              {" · "}
                              <span className="font-mono text-[#555]">
                                +{f.contribution}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell className="text-[12px] font-mono text-[#666]">
                      {r.hearingDate
                        ? r.hearingDate.toISOString().split("T")[0]
                        : "—"}
                    </TableCell>
                    <TableCell className="text-[12px] font-mono text-[#666]">
                      {r.scoredAt.toISOString().split("T")[0]}
                    </TableCell>
                  </TableRow>,
                  ...(narrativeFactor
                    ? [
                        <TableRow
                          key={`${r.caseId}-why`}
                          className="bg-[#FAF7F0] hover:bg-[#FAF7F0]"
                        >
                          <TableCell
                            colSpan={7}
                            className="border-t-0 py-2 pl-10 text-[12px]"
                          >
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 inline-flex items-center rounded bg-[#3A0000] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                Why
                              </span>
                              <p className="text-[12px] leading-relaxed text-[#333]">
                                {narrativeFactor.note}
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>,
                      ]
                    : []),
                ];
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
