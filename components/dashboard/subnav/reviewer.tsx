"use client";

import Link from "next/link";
import {
  SubnavShell,
  SubnavSectionLabel,
  SubnavActionGrid,
  SubnavStatRow,
  SubnavRecentList,
  SubnavAnchorBlock,
} from "./_primitives";
import { COLORS } from "@/lib/design-tokens";
import type { ReviewerSubnavData } from "@/lib/dashboard-subnav/types";

export function ReviewerSubnav({ data }: { data: ReviewerSubnavData }) {
  return (
    <SubnavShell title="Leadership">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <SubnavActionGrid
        actions={[
          { label: "Drill ALJ stats", href: "/reports/alj-stats" },
          { label: "Coaching loop", href: "/coaching" },
          { label: "Risk queue", href: "/reports/risk" },
          {
            label: "Export PDF",
            href: "/dashboard/exec",
            disabled: true,
            hint: "Coming soon — board-packet PDF export",
          },
        ]}
      />

      {/* Anchor: Needs Your Eyes briefing */}
      <SubnavSectionLabel>Needs Your Eyes</SubnavSectionLabel>
      <SubnavAnchorBlock label={`${data.needsYourEyes.length} ranked items`}>
        {data.needsYourEyes.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.text2 }}>
            All clear — no critical items today.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {data.needsYourEyes.slice(0, 5).map((n, i) => {
              const tone =
                n.severity === "critical"
                  ? COLORS.bad
                  : n.severity === "high"
                    ? COLORS.warn
                    : COLORS.brand;
              return (
                <li
                  key={n.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      fontFamily: "monospace",
                      fontSize: 10,
                      color: COLORS.text3,
                      width: 12,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {n.href ? (
                    <Link
                      href={n.href}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        color: COLORS.text1,
                        textDecoration: "none",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {n.title}
                    </Link>
                  ) : (
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        color: COLORS.text1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {n.title}
                    </span>
                  )}
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: tone,
                      flexShrink: 0,
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </SubnavAnchorBlock>

      <SubnavSectionLabel>Pulse</SubnavSectionLabel>
      <SubnavStatRow
        label="Unacked items"
        value={data.unackedCount}
        tone={data.unackedCount > 5 ? "bad" : data.unackedCount > 0 ? "warn" : "ok"}
      />

      <SubnavSectionLabel>Recent Escalations</SubnavSectionLabel>
      <SubnavRecentList items={data.recentEscalations} />
    </SubnavShell>
  );
}
