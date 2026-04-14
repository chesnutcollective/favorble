"use client";

import {
  SubnavShell,
  SubnavSectionLabel,
  SubnavActionGrid,
  SubnavStatRow,
  SubnavAnchorBlock,
} from "./_primitives";
import { markOldestApprovedFeeCollectedAction } from "@/app/actions/dashboard-quick-actions";
import { COLORS } from "@/lib/design-tokens";
import type { FeeCollectionSubnavData } from "@/lib/dashboard-subnav/types";

export function FeeCollectionSubnav({
  data,
}: {
  data: FeeCollectionSubnavData;
}) {
  return (
    <SubnavShell title="Fees Desk">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <SubnavActionGrid
        actions={[
          {
            label: "Send follow-up",
            href: "/fee-collection",
            disabled: true,
            hint: "Coming soon — wires to dunning template engine",
          },
          { label: "Generate petition", href: "/fee-collection?action=new" },
          {
            label: "Mark oldest collected",
            onAction: markOldestApprovedFeeCollectedAction,
          },
          { label: "Escalate dispute", href: "/fee-collection?tab=disputes" },
        ]}
      />

      {/* Anchor: 24-hour confirmed payments — the dopamine hit */}
      <SubnavSectionLabel>Last 24h Payments</SubnavSectionLabel>
      <SubnavAnchorBlock label={`${data.recentPayments.length} confirmed`}>
        {data.recentPayments.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.text2 }}>
            No payments confirmed in the last 24 hours.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
            {data.recentPayments.slice(0, 5).map((p) => (
              <li
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                }}
              >
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 600,
                    color: COLORS.emeraldDeep,
                    minWidth: 60,
                  }}
                >
                  +${p.amountDollars.toLocaleString()}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    color: COLORS.text1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: "monospace",
                    fontSize: 10,
                  }}
                >
                  {p.caseNumber ?? "—"}
                </span>
                <span style={{ color: COLORS.text3, fontSize: 10 }}>
                  {p.relativeTime}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SubnavAnchorBlock>

      <SubnavSectionLabel>At Risk</SubnavSectionLabel>
      <SubnavStatRow
        label="Dollars at risk"
        value={`$${data.totalAtRiskDollars.toLocaleString()}`}
        tone={data.totalAtRiskDollars > 0 ? "warn" : "ok"}
        href="/fee-collection?tab=delinquent"
      />

      <SubnavSectionLabel>Disputes</SubnavSectionLabel>
      <SubnavStatRow
        label="Open disputes"
        value={data.disputes.opened}
        tone={data.disputes.opened > 0 ? "warn" : "ok"}
        href="/fee-collection?tab=disputes"
      />
      <SubnavStatRow
        label="Resolved · 7d"
        value={data.disputes.resolved7d}
        tone="ok"
      />
    </SubnavShell>
  );
}
