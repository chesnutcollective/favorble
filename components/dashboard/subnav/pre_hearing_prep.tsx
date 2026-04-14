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
import type { PreHearingPrepSubnavData } from "@/lib/dashboard-subnav/types";

export function PreHearingPrepSubnav({
  data,
}: {
  data: PreHearingPrepSubnavData;
}) {
  return (
    <SubnavShell title="Pit Stand">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <SubnavActionGrid
        actions={[
          { label: "Open next brief", href: "/phi-writer" },
          {
            label: "Generate AI draft",
            href: "/phi-writer?action=ai_draft",
            disabled: true,
            hint: "Coming soon — needs case context selection",
          },
          { label: "Side-by-side chrono", href: "/phi-writer?layout=split" },
          {
            label: "Mark prep complete",
            onAction: markOldestPhiSheetCompleteAction,
          },
        ]}
      />

      <SubnavSectionLabel>This Week</SubnavSectionLabel>
      <SubnavStatRow
        label="Briefs sent"
        value={data.briefsThisWeek}
        href="/phi-writer"
      />
      {data.heaviestCaseDays !== null && (
        <SubnavStatRow
          label="Heaviest case in"
          value={`${data.heaviestCaseDays}d`}
          tone={
            data.heaviestCaseDays <= 3
              ? "bad"
              : data.heaviestCaseDays <= 7
                ? "warn"
                : "default"
          }
        />
      )}

      {/* Anchor: Per-attorney revision-rate leaderboard */}
      <SubnavSectionLabel>Attorney Revision Rates</SubnavSectionLabel>
      <SubnavAnchorBlock label="Who needs extra polish">
        {data.attorneyRevisionRates.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.text2 }}>
            No active attorney pairings within the 14-day window.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 5 }}>
            {data.attorneyRevisionRates.map((a) => {
              const total = a.inReview + a.completed;
              const pct = total > 0 ? Math.round((a.inReview / total) * 100) : 0;
              const tone =
                pct >= 50 ? COLORS.bad : pct >= 25 ? COLORS.warn : COLORS.emeraldDeep;
              return (
                <li
                  key={a.attorney}
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
                    {a.attorney}
                  </span>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 10,
                      color: COLORS.text3,
                    }}
                  >
                    {a.completed} done
                  </span>
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                      color: tone,
                      minWidth: 32,
                      textAlign: "right",
                    }}
                  >
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SubnavAnchorBlock>

      <SubnavSectionLabel>Recently Sent</SubnavSectionLabel>
      <SubnavRecentList items={data.recentSent} />
    </SubnavShell>
  );
}
