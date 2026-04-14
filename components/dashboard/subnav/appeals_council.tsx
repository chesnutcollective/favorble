"use client";

import {
  SubnavShell,
  SubnavSectionLabel,
  SubnavActionGrid,
  SubnavStatRow,
  SubnavAnchorBlock,
} from "./_primitives";
import { COLORS } from "@/lib/design-tokens";
import type { AppealsCouncilSubnavData } from "@/lib/dashboard-subnav/types";

export function AppealsCouncilSubnav({
  data,
}: {
  data: AppealsCouncilSubnavData;
}) {
  return (
    <SubnavShell title="The Chamber">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <SubnavActionGrid
        actions={[
          { label: "Open urgent brief", href: "/appeals-council" },
          {
            label: "AI draft from latest",
            href: "/appeals-council?action=ai_draft",
            disabled: true,
            hint: "Coming soon — needs the latest unfavorable selector",
          },
          {
            label: "Approve & file",
            href: "/appeals-council?action=file",
            disabled: true,
            hint: "Coming soon — needs SSA filing endpoint",
          },
          {
            label: "Mark outcome",
            href: "/appeals-council?action=outcome",
            disabled: true,
            hint: "Coming soon — needs in-page brief context",
          },
        ]}
      />

      <SubnavSectionLabel>Deadlines</SubnavSectionLabel>
      <SubnavStatRow
        label="Briefs due in 7d"
        value={data.briefsDueIn7d}
        tone={data.briefsDueIn7d > 0 ? "warn" : "ok"}
        href="/appeals-council"
      />
      <SubnavStatRow
        label="Grants this month"
        value={data.grantsThisMonth}
        tone="ok"
      />

      {/* Anchor: ALJ Remand Tracker — the compounding knowledge */}
      <SubnavSectionLabel>ALJ Remand Tracker</SubnavSectionLabel>
      <SubnavAnchorBlock label="Where the law tilts in your favor">
        {data.aljRemandTracker.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.text2 }}>
            Not enough decided briefs yet to compute remand patterns.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
            {data.aljRemandTracker.map((a) => {
              const tone =
                a.remandedRate >= 30
                  ? COLORS.emeraldDeep
                  : a.remandedRate >= 10
                    ? COLORS.warn
                    : COLORS.text3;
              return (
                <li
                  key={a.alj}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      color: COLORS.text1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontFamily: "Georgia, serif",
                    }}
                  >
                    {a.alj}
                  </span>
                  <span
                    style={{
                      fontFamily: "monospace",
                      color: COLORS.text3,
                      fontSize: 10,
                    }}
                  >
                    n={a.totalDecisions}
                  </span>
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                      color: tone,
                      minWidth: 32,
                      textAlign: "right",
                    }}
                  >
                    {a.remandedRate}%
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SubnavAnchorBlock>
    </SubnavShell>
  );
}
