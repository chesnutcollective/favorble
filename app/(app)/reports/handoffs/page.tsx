import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { getCrossTeamHandoffs } from "@/app/actions/team-reports";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { COLORS } from "@/lib/design-tokens";

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

function hoursColor(hours: number): string {
  if (hours === 0) return COLORS.text4;
  if (hours <= 24) return COLORS.ok;
  if (hours <= 72) return COLORS.warn;
  return COLORS.bad;
}

export default async function HandoffsPage() {
  await requireSession();

  let rows: Awaited<ReturnType<typeof getCrossTeamHandoffs>> = [];
  try {
    rows = await getCrossTeamHandoffs();
  } catch {
    // DB unavailable
  }

  // Build a lookup map (fromTeam, toTeam) → cell
  const matrix = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    matrix.set(`${r.fromTeam}|${r.toTeam}`, r);
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

      <Card>
        <CardContent className="p-0">
          <div
            className="px-6 py-3 border-b"
            style={{ borderColor: COLORS.borderSubtle }}
          >
            <h2
              className="text-sm font-semibold"
              style={{ color: COLORS.text1 }}
            >
              Handoff matrix (avg hours)
            </h2>
            <p className="text-xs" style={{ color: COLORS.text3 }}>
              Row = source team, column = destination team. Empty = no direct
              handoffs recorded.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: COLORS.borderSubtle }}>
                  <th className="text-left px-3 py-2 text-xs font-medium text-[#666]">
                    From →
                  </th>
                  {TEAMS.map((t) => (
                    <th
                      key={t}
                      className="text-center px-3 py-2 text-xs font-medium text-[#666] capitalize"
                    >
                      {t.replace(/_/g, " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TEAMS.map((from) => (
                  <tr
                    key={from}
                    className="border-b"
                    style={{ borderColor: COLORS.borderSubtle }}
                  >
                    <td className="px-3 py-2 text-xs font-medium capitalize">
                      {from.replace(/_/g, " ")}
                    </td>
                    {TEAMS.map((to) => {
                      const cell = matrix.get(`${from}|${to}`);
                      if (!cell || from === to) {
                        return (
                          <td
                            key={to}
                            className="text-center px-3 py-2 text-xs"
                            style={{ color: COLORS.text4 }}
                          >
                            —
                          </td>
                        );
                      }
                      return (
                        <td
                          key={to}
                          className="text-center px-3 py-2 text-xs tabular-nums"
                        >
                          <span
                            style={{ color: hoursColor(cell.avgHours) }}
                            className="font-semibold"
                          >
                            {cell.avgHours}h
                          </span>
                          <span
                            className="block text-[10px]"
                            style={{ color: COLORS.text3 }}
                          >
                            {cell.caseCount} case
                            {cell.caseCount === 1 ? "" : "s"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
                      style={{ color: hoursColor(r.avgHours) }}
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
