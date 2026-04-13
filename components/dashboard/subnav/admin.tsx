"use client";

import {
  SubnavShell,
  SubnavSectionLabel,
  SubnavActionGrid,
  SubnavStatRow,
  SubnavRecentList,
  SubnavAnchorBlock,
} from "./_primitives";
import { COLORS } from "@/lib/design-tokens";
import type { AdminSubnavData } from "@/lib/dashboard-subnav/types";

export function AdminSubnav({ data }: { data: AdminSubnavData }) {
  return (
    <SubnavShell title="Admin Console">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <SubnavActionGrid
        actions={[
          { label: "Invite user", href: "/admin/users" },
          { label: "Integrations", href: "/admin/integrations" },
          { label: "Audit search", href: "/admin/audit-logs" },
          { label: "Compliance", href: "/admin/compliance" },
        ]}
      />

      <SubnavSectionLabel>System</SubnavSectionLabel>
      <SubnavStatRow label="Active users" value={data.activeUsers} href="/admin/users" />
      <SubnavStatRow
        label="Open compliance"
        value={data.openCompliance}
        tone={data.openCompliance > 0 ? "warn" : "ok"}
        href="/admin/compliance"
      />

      {/* Anchor: Cron schedule live state */}
      <SubnavSectionLabel>Cron Schedule</SubnavSectionLabel>
      <SubnavAnchorBlock label="Last 24h">
        {data.cronStatus.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.text2 }}>
            No cron activity yet today.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
            {data.cronStatus.slice(0, 5).map((c, i) => (
              <li
                key={i}
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
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: c.healthy ? COLORS.emerald : COLORS.bad,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    color: COLORS.text1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: "monospace",
                  }}
                >
                  {c.name}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: COLORS.text3,
                    flexShrink: 0,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {c.lastRunAgo}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SubnavAnchorBlock>

      <SubnavSectionLabel>Recent Activity</SubnavSectionLabel>
      <SubnavRecentList items={data.recentAdminEvents} />
    </SubnavShell>
  );
}
