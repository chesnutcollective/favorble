"use client";

import { useState } from "react";
import {
  SubnavShell,
  SubnavSectionLabel,
  SubnavActionGrid,
  SubnavStatRow,
  SubnavRecentList,
  SubnavAnchorBlock,
} from "./_primitives";
import { FilingRejectDialog } from "./filing-reject-dialog";
import { COLORS } from "@/lib/design-tokens";
import type { FilingAgentSubnavData } from "@/lib/dashboard-subnav/types";

export function FilingAgentSubnav({ data }: { data: FilingAgentSubnavData }) {
  const [rejectOpen, setRejectOpen] = useState(false);

  return (
    <SubnavShell title="QA Reviewer">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <SubnavActionGrid
        actions={[
          { label: "Approve top of queue", href: "/filing" },
          {
            label: "Reject + reason",
            onClick: () => setRejectOpen(true),
          },
          { label: "ERE console", href: "/admin/integrations" },
          { label: "Retry failed", href: "/filing?filter=failed" },
        ]}
      />
      <FilingRejectDialog open={rejectOpen} onOpenChange={setRejectOpen} />

      {/* Anchor: Confidence threshold + error clusters */}
      <SubnavSectionLabel>Auto-Approval Threshold</SubnavSectionLabel>
      <SubnavAnchorBlock label="The dial">
        <div style={{ display: "grid", gap: 6 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 11,
            }}
          >
            <span style={{ color: COLORS.text2 }}>Confidence ≥</span>
            <span
              style={{
                fontFamily: "monospace",
                fontWeight: 600,
                color: COLORS.brand,
              }}
            >
              {data.currentConfidenceThreshold}%
            </span>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: "#F0F3F8",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${data.currentConfidenceThreshold}%`,
                background: COLORS.brand,
              }}
            />
          </div>
          <div
            style={{
              fontSize: 10,
              color: COLORS.text3,
              fontStyle: "italic",
            }}
          >
            Tune in /filing settings (live dial coming next)
          </div>
        </div>
      </SubnavAnchorBlock>

      <SubnavSectionLabel>Pipeline</SubnavSectionLabel>
      <SubnavStatRow
        label="In QA queue"
        value={data.ereQueueCount}
        href="/filing"
      />
      <SubnavStatRow
        label="Failed (7d)"
        value={data.failedLast7d}
        tone={data.failedLast7d > 0 ? "warn" : "ok"}
        href="/filing?filter=failed"
      />

      {data.errorClusters.length > 0 && (
        <>
          <SubnavSectionLabel>Top Error Clusters</SubnavSectionLabel>
          <div style={{ padding: "0 12px 8px", display: "grid", gap: 4 }}>
            {data.errorClusters.map((c) => (
              <div
                key={c.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: COLORS.text2,
                  textTransform: "lowercase",
                }}
              >
                <span style={{ fontFamily: "monospace" }}>{c.label}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: COLORS.bad }}>
                  {c.count}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <SubnavSectionLabel>Recent Rejections</SubnavSectionLabel>
      <SubnavRecentList items={data.recentRejections} />
    </SubnavShell>
  );
}
