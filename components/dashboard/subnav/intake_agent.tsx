"use client";

import Link from "next/link";
import {
  SubnavShell,
  SubnavSectionLabel,
  SubnavStatRow,
  SubnavRecentList,
  SubnavAnchorBlock,
} from "./_primitives";
import { IntakeDeclineDialog } from "./intake-decline-dialog";
import { IntakeWelcomeCallDialog } from "./intake-welcome-call-dialog";
import { COLORS } from "@/lib/design-tokens";
import type { IntakeAgentSubnavData } from "@/lib/dashboard-subnav/types";

function QuickActionIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width="14"
      height="14"
      aria-hidden
    >
      <path
        d="M9 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}

export function IntakeAgentSubnav({ data }: { data: IntakeAgentSubnavData }) {
  const buckets = data.aiConfidenceBuckets;
  const total = buckets.autoApproved + buckets.borderline + buckets.declined;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));

  return (
    <SubnavShell title="Intake Floor">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <div className="ttn-quick-actions">
        <IntakeWelcomeCallDialog
          trigger={
            <button type="button" className="ttn-quick-action-btn">
              <QuickActionIcon />
              <span>Welcome call</span>
            </button>
          }
        />
        <Link
          href="/leads?status=contract_sent"
          className="ttn-quick-action-btn"
        >
          <QuickActionIcon />
          <span>Send contract</span>
        </Link>
        <IntakeDeclineDialog
          trigger={
            <button type="button" className="ttn-quick-action-btn">
              <QuickActionIcon />
              <span>Decline w/ reason</span>
            </button>
          }
        />
        <Link
          href="/intake/hogansmith?lang=es"
          className="ttn-quick-action-btn"
        >
          <QuickActionIcon />
          <span>Open Spanish form</span>
        </Link>
      </div>

      {/* Anchor: AI confidence histogram — borderline = where humans focus */}
      <SubnavSectionLabel>AI Triage · 30d</SubnavSectionLabel>
      <SubnavAnchorBlock label="Where the AI lands new leads">
        {total === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.text2 }}>
            No leads in the last 30 days.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {[
              {
                label: "Auto-approved",
                value: buckets.autoApproved,
                color: COLORS.emerald,
              },
              {
                label: "Borderline (you decide)",
                value: buckets.borderline,
                color: COLORS.warn,
              },
              {
                label: "Declined",
                value: buckets.declined,
                color: COLORS.text3,
              },
            ].map((row) => (
              <div key={row.label}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    color: COLORS.text2,
                    marginBottom: 2,
                  }}
                >
                  <span>{row.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {row.value} · {pct(row.value)}%
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    borderRadius: 2,
                    background: "#F0F3F8",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${pct(row.value)}%`,
                      background: row.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </SubnavAnchorBlock>

      <SubnavSectionLabel>Pipeline</SubnavSectionLabel>
      <SubnavStatRow label="New today" value={data.newToday} href="/leads" />
      <SubnavStatRow
        label="Contracts pending"
        value={data.contractsPendingSignature}
        href="/leads?status=contract_sent"
      />

      {data.declineReasonTrends.length > 0 && (
        <>
          <SubnavSectionLabel>Decline Reasons · 30d</SubnavSectionLabel>
          <div style={{ padding: "0 12px 8px", display: "grid", gap: 4 }}>
            {data.declineReasonTrends.slice(0, 3).map((r) => (
              <div
                key={r.reason}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: COLORS.text2,
                  textTransform: "capitalize",
                }}
              >
                <span>{r.reason}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {r.count}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <SubnavSectionLabel>Recent Conversions</SubnavSectionLabel>
      <SubnavRecentList items={data.recentConversions} />
    </SubnavShell>
  );
}
