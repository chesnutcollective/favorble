import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getCrossTeamHandoffs } from "@/app/actions/team-reports";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { COLORS } from "@/lib/design-tokens";
import { HandoffMatrix } from "./handoff-matrix";

export const metadata: Metadata = {
  title: "Cross-Team Handoffs",
};

const TEAMS = [
  "intake",
  "filing",
  "medical_records",
  "case_management",
  "hearings",
  "mail_sorting",
  "administration",
] as const;

export default async function HandoffsPage() {
  await requireSession();

  let rows: Awaited<ReturnType<typeof getCrossTeamHandoffs>> = [];
  try {
    rows = await getCrossTeamHandoffs();
  } catch {
    // DB unavailable
  }

  const totalHandoffs = rows.reduce((sum, r) => sum + r.caseCount, 0);
  const slowest = [...rows].sort((a, b) => b.avgHours - a.avgHours).slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cross-Team Handoffs"
        description="Average time for a case to move from one team's owning stage to another's. Use this to spot the slowest links in the pipeline."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Total handoffs
            </p>
            <p className="text-[28px] font-bold tracking-[-1px] leading-[1.1] tabular-nums">
              {totalHandoffs.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Active pairs
            </p>
            <p className="text-[28px] font-bold tracking-[-1px] leading-[1.1] tabular-nums">
              {rows.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Slowest handoff
            </p>
            <p
              className="text-[28px] font-bold tracking-[-1px] leading-[1.1] tabular-nums"
              style={{ color: COLORS.bad }}
            >
              {slowest[0]?.avgHours ?? 0}h
            </p>
            {slowest[0] && (
              <p
                className="text-xs mt-1 capitalize"
                style={{ color: COLORS.text3 }}
              >
                {slowest[0].fromTeam.replace(/_/g, " ")} →{" "}
                {slowest[0].toTeam.replace(/_/g, " ")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <HandoffMatrix rows={rows} teams={[...TEAMS]} />

      <Card>
        <CardContent className="p-5">
          <h3
            className="text-sm font-semibold mb-3"
            style={{ color: COLORS.text1 }}
          >
            Slowest handoffs
          </h3>
          {slowest.length === 0 ? (
            <p className="text-sm" style={{ color: COLORS.text3 }}>
              No handoff data recorded yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {slowest.map((r) => (
                <li
                  key={`${r.fromTeam}|${r.toTeam}`}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="capitalize" style={{ color: COLORS.text2 }}>
                    {r.fromTeam.replace(/_/g, " ")} →{" "}
                    {r.toTeam.replace(/_/g, " ")}
                  </span>
                  <span>
                    <span
                      className="font-semibold tabular-nums"
                      style={{
                        color:
                          r.avgHours <= 24
                            ? COLORS.ok
                            : r.avgHours <= 72
                            ? COLORS.warn
                            : COLORS.bad,
                      }}
                    >
                      {r.avgHours}h avg
                    </span>
                    <span
                      className="text-xs ml-2"
                      style={{ color: COLORS.text3 }}
                    >
                      (p95 {r.p95Hours}h · {r.caseCount} cases)
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
