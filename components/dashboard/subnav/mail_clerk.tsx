"use client";

import {
  SubnavShell,
  SubnavSectionLabel,
  SubnavActionGrid,
  SubnavStatRow,
  SubnavRecentList,
  SubnavAnchorBlock,
} from "./_primitives";
import { markOldestOutboundDeliveredAction } from "@/app/actions/dashboard-quick-actions";
import { COLORS } from "@/lib/design-tokens";
import type { MailClerkSubnavData } from "@/lib/dashboard-subnav/types";

export function MailClerkSubnav({ data }: { data: MailClerkSubnavData }) {
  return (
    <SubnavShell title="Dispatch Floor">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <SubnavActionGrid
        actions={[
          { label: "Match top piece", href: "/mail" },
          { label: "Find case", href: "/mail?focus=search" },
          {
            label: "Mark oldest delivered",
            onAction: markOldestOutboundDeliveredAction,
          },
          { label: "Log outbound", href: "/mail?action=log_outbound" },
        ]}
      />

      {/* Anchor: Persistent fuzzy case-search field — the entire job */}
      <SubnavSectionLabel>Find a case</SubnavSectionLabel>
      <SubnavAnchorBlock label="Name · SSN last 4 · case #">
        <a
          href="/mail?focus=search"
          style={{
            display: "block",
            padding: "8px 10px",
            borderRadius: 6,
            background: "#fff",
            border: `1px solid ${COLORS.borderDefault}`,
            fontSize: 12,
            color: COLORS.text3,
            textDecoration: "none",
          }}
        >
          🔍 Search to match…
        </a>
      </SubnavAnchorBlock>

      <SubnavSectionLabel>Pipeline</SubnavSectionLabel>
      <SubnavStatRow
        label="Inbound queue"
        value={data.inboundCount}
        href="/mail"
      />
      <SubnavStatRow
        label="Unmatched"
        value={data.unmatchedCount}
        tone={data.unmatchedCount > 0 ? "warn" : "ok"}
        href="/mail?filter=unmatched"
      />
      <SubnavStatRow
        label="Outbound in transit"
        value={data.outboundInTransit}
        href="/mail?tab=outbound"
      />
      <SubnavStatRow
        label="Oldest piece"
        value={`${data.oldestPieceDays}d`}
        tone={data.oldestPieceDays >= 7 ? "bad" : data.oldestPieceDays >= 3 ? "warn" : "default"}
      />

      <SubnavSectionLabel>Recently Outbound</SubnavSectionLabel>
      <SubnavRecentList items={data.recentMatched} />
    </SubnavShell>
  );
}
