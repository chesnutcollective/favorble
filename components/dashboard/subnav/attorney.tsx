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
import type { AttorneySubnavData } from "@/lib/dashboard-subnav/types";

export function AttorneySubnav({ data }: { data: AttorneySubnavData }) {
  const next = data.nextHearing;
  return (
    <SubnavShell title="My Docket">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <SubnavActionGrid
        actions={[
          {
            label: "Next hearing",
            href: next?.caseId ? `/hearings/${next.caseId}` : "/hearings",
          },
          { label: "Generate brief", href: "/drafts?type=brief" },
          { label: "Look up ALJ", href: "/reports/alj-stats" },
          {
            label: "Log outcome",
            href: "/hearings",
            disabled: true,
            hint: "Coming soon — wires to post-hearing outcome logger",
          },
        ]}
      />

      {/* Anchor: Next Hearing Prep Strip */}
      <SubnavSectionLabel>Next Hearing</SubnavSectionLabel>
      <SubnavAnchorBlock>
        {next ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: COLORS.text1,
                  letterSpacing: "-0.02em",
                }}
              >
                {next.countdown}
              </span>
              <span style={{ fontSize: 11, color: COLORS.text2 }}>
                · Case {next.caseNumber ?? "—"}
              </span>
            </div>
            {next.alj && (
              <div style={{ fontSize: 11, color: COLORS.text2, marginBottom: 8 }}>
                ALJ {next.alj}
              </div>
            )}
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 3 }}>
              {next.prepCheckList.map((item, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    color: item.ok ? COLORS.text2 : COLORS.text1,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: item.ok ? COLORS.emerald : "transparent",
                      border: `1.5px solid ${item.ok ? COLORS.emerald : COLORS.warn}`,
                      flexShrink: 0,
                    }}
                  />
                  <span>{item.label}</span>
                  {!item.ok && (
                    <Link
                      href={next.caseId ? `/hearings/${next.caseId}` : "/hearings"}
                      style={{
                        marginLeft: "auto",
                        fontSize: 10,
                        color: COLORS.brand,
                        textDecoration: "none",
                      }}
                    >
                      Fix →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div style={{ fontSize: 12, color: COLORS.text2 }}>
            No upcoming hearings in the next 7 days.
          </div>
        )}
      </SubnavAnchorBlock>

      <SubnavSectionLabel>This Week</SubnavSectionLabel>
      <SubnavStatRow label="Hearings (next 7d)" value={data.hearingsThisWeek} href="/hearings" />

      <SubnavSectionLabel>Recent</SubnavSectionLabel>
      <SubnavRecentList items={data.recentFeed} />
    </SubnavShell>
  );
}
