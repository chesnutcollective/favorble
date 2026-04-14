"use client";

import {
  SubnavShell,
  SubnavSectionLabel,
  SubnavActionGrid,
  SubnavStatRow,
  SubnavRecentList,
  SubnavAnchorBlock,
} from "./_primitives";
import { markOldestPhiSheetCompleteAction } from "@/app/actions/dashboard-quick-actions";
import { COLORS } from "@/lib/design-tokens";
import type { PhiSheetWriterSubnavData } from "@/lib/dashboard-subnav/types";

export function PhiSheetWriterSubnav({
  data,
}: {
  data: PhiSheetWriterSubnavData;
}) {
  return (
    <SubnavShell title="The Bench">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <SubnavActionGrid
        actions={[
          { label: "Pick next sheet", href: "/phi-writer" },
          {
            label: "Generate AI draft",
            href: "/phi-writer?action=ai_draft",
            disabled: true,
            hint: "Coming soon — needs in-page case context",
          },
          { label: "Side-by-side", href: "/phi-writer?layout=split" },
          {
            label: "Mark oldest complete",
            onAction: markOldestPhiSheetCompleteAction,
          },
        ]}
      />

      {/* Anchor: Silent-rewrite alerts (the editor's reality check) */}
      <SubnavSectionLabel>Silent Rewrites</SubnavSectionLabel>
      <SubnavAnchorBlock label="Sheets the attorney quietly rewrote">
        {data.silentRewriteCount === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.emeraldDeep }}>
            No silent rewrites detected. Your drafts stuck.
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: COLORS.warn,
                  fontFamily: "Georgia, serif",
                  lineHeight: 1,
                }}
              >
                {data.silentRewriteCount}
              </span>
              <span style={{ fontSize: 11, color: COLORS.text2 }}>
                returned to review · last 30d
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: COLORS.text2,
                fontStyle: "italic",
              }}
            >
              The honest quality metric. Each one is a learning moment.
            </div>
          </>
        )}
      </SubnavAnchorBlock>

      <SubnavSectionLabel>This Week</SubnavSectionLabel>
      <SubnavStatRow label="Sheets drafted" value={data.sheetsThisWeek} href="/phi-writer" />

      {data.attorneyPairings.length > 0 && (
        <>
          <SubnavSectionLabel>Attorney Pairings · 30d</SubnavSectionLabel>
          <div style={{ padding: "0 12px 8px", display: "grid", gap: 4 }}>
            {data.attorneyPairings.map((p) => (
              <div
                key={p.attorney}
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
                  }}
                >
                  {p.attorney}
                </span>
                <span style={{ color: COLORS.text3, fontVariantNumeric: "tabular-nums" }}>
                  {p.sheetsCount}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <SubnavSectionLabel>Recently Approved</SubnavSectionLabel>
      <SubnavRecentList items={data.recentApproved} />
    </SubnavShell>
  );
}
