"use client";

import {
  SubnavShell,
  SubnavSectionLabel,
  SubnavActionGrid,
  SubnavStatRow,
  SubnavRecentList,
  SubnavAnchorBlock,
} from "./_primitives";
import {
  completeTopOpenTaskAction,
  snoozeTopTaskAction,
} from "@/app/actions/dashboard-quick-actions";
import { COLORS } from "@/lib/design-tokens";
import type { CaseManagerSubnavData } from "@/lib/dashboard-subnav/types";

export function CaseManagerSubnav({ data }: { data: CaseManagerSubnavData }) {
  return (
    <SubnavShell title="My Day">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <SubnavActionGrid
        actions={[
          { label: "Triage Inbox", href: "/messages?filter=urgent" },
          { label: "Done top task", onAction: completeTopOpenTaskAction },
          { label: "Snooze top 24h", onAction: snoozeTopTaskAction },
          { label: "AI Draft Reply", href: "/drafts" },
        ]}
      />

      <SubnavSectionLabel>Today&apos;s Numbers</SubnavSectionLabel>
      <SubnavStatRow label="Tasks today" value={data.todayTaskCount} href="/queue?tab=today" />
      <SubnavStatRow
        label="Awaiting review"
        value={data.unreadUrgent}
        tone={data.unreadUrgent > 0 ? "warn" : "default"}
        href="/cases?escalations=open"
      />

      {/* Anchor: AI Next-Action Queue — the load-bearing widget */}
      <SubnavSectionLabel>Next Actions</SubnavSectionLabel>
      <SubnavAnchorBlock label="AI Queue · 1 decision per row">
        {data.nextActions.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.text2 }}>
            Inbox zero on urgent items.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {data.nextActions.slice(0, 5).map((a) => {
              const tone =
                a.tone === "bad"
                  ? COLORS.bad
                  : a.tone === "warn"
                    ? COLORS.warn
                    : COLORS.brand;
              return (
                <li
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 0",
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: tone,
                    }}
                  />
                  <a
                    href={a.caseId ? `/cases/${a.caseId}` : "/queue"}
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
                    {a.title}
                  </a>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      color: tone,
                    }}
                  >
                    {a.actionVerb}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SubnavAnchorBlock>

      <SubnavSectionLabel>Cooling Threads</SubnavSectionLabel>
      <SubnavRecentList items={data.coolingThreads} />
    </SubnavShell>
  );
}
