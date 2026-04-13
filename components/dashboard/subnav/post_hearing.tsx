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
import type { PostHearingSubnavData } from "@/lib/dashboard-subnav/types";

export function PostHearingSubnav({
  data,
}: {
  data: PostHearingSubnavData;
}) {
  return (
    <SubnavShell title="Pipeline Conductor">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <SubnavActionGrid
        actions={[
          {
            label: "Approve notification",
            href: "/post-hearing?action=approve_notify",
            disabled: true,
            hint: "Coming soon — needs in-page outcome context",
          },
          {
            label: "Override AI",
            href: "/post-hearing?action=override",
            disabled: true,
            hint: "Coming soon — needs anomaly-row picker",
          },
          { label: "Open ALJ decision", href: "/post-hearing" },
          {
            label: "Mark complete",
            href: "/post-hearing?action=complete",
            disabled: true,
            hint: "Coming soon — needs in-page outcome context",
          },
        ]}
      />

      {/* Anchor: Anomaly Inbox — what makes the role defensible */}
      <SubnavSectionLabel>Anomaly Inbox</SubnavSectionLabel>
      <SubnavAnchorBlock label={`${data.anomalies.length} need a human eye`}>
        {data.anomalies.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.emeraldDeep }}>
            All clear. The pipeline is in tune.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {data.anomalies.slice(0, 4).map((a) => (
              <li
                key={a.id}
                style={{
                  display: "grid",
                  gap: 2,
                }}
              >
                {a.href ? (
                  <Link
                    href={a.href}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: COLORS.text1,
                      textDecoration: "none",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.title}
                  </Link>
                ) : (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: COLORS.text1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.title}
                  </span>
                )}
                <span style={{ fontSize: 10, color: COLORS.warn }}>
                  ⚠ {a.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SubnavAnchorBlock>

      <SubnavSectionLabel>Pipeline</SubnavSectionLabel>
      <SubnavStatRow
        label="Awaiting notification"
        value={data.awaitingNotification}
        tone={data.awaitingNotification > 0 ? "warn" : "ok"}
        href="/post-hearing"
      />
      <SubnavStatRow
        label="Blocked transitions"
        value={data.blockedTransitions}
        tone={data.blockedTransitions > 0 ? "bad" : "ok"}
      />

      <SubnavSectionLabel>Recent Notifications</SubnavSectionLabel>
      <SubnavRecentList items={data.recentInterventions} />
    </SubnavShell>
  );
}
