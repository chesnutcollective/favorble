"use client";

import {
  SubnavShell,
  SubnavSectionLabel,
  SubnavActionGrid,
  SubnavStatRow,
  SubnavRecentList,
  SubnavAnchorBlock,
} from "./_primitives";
import { markOldestMrCompleteAction } from "@/app/actions/dashboard-quick-actions";
import { COLORS } from "@/lib/design-tokens";
import type { MedicalRecordsSubnavData } from "@/lib/dashboard-subnav/types";

export function MedicalRecordsSubnav({
  data,
}: {
  data: MedicalRecordsSubnavData;
}) {
  return (
    <SubnavShell title="Records Desk">
      <SubnavSectionLabel>Quick Actions</SubnavSectionLabel>
      <SubnavActionGrid
        actions={[
          {
            label: "Send AI follow-up",
            href: "/medical-records",
            disabled: true,
            hint: "Coming soon — wires to provider auto-follow-up flow",
          },
          {
            label: "Mark oldest complete",
            onAction: markOldestMrCompleteAction,
          },
          { label: "Generate RFC", href: "/medical-records?tab=rfc" },
          { label: "Open vault", href: "/medical-records?tab=credentials" },
        ]}
      />

      <SubnavSectionLabel>Watch List</SubnavSectionLabel>
      <SubnavStatRow
        label="Expiring credentials"
        value={data.expiringCredentials}
        tone={data.expiringCredentials > 0 ? "warn" : "ok"}
        href="/medical-records?tab=credentials"
      />
      <SubnavStatRow
        label="RFC awaiting doctor"
        value={data.rfcAwaitingDoctor}
        tone={data.rfcAwaitingDoctor > 0 ? "warn" : "default"}
        href="/medical-records?tab=rfc"
      />

      {/* Anchor: Provider response-time intelligence — ranked slowest first */}
      <SubnavSectionLabel>Slowest Providers</SubnavSectionLabel>
      <SubnavAnchorBlock label="Days since last response">
        {data.providerResponseTimes.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.text2 }}>
            No provider activity yet.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
            {data.providerResponseTimes.map((p) => {
              const days = p.avgDays ?? 0;
              const tone =
                days > 30 ? COLORS.bad : days > 14 ? COLORS.warn : COLORS.text2;
              return (
                <li
                  key={p.name}
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
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      color: tone,
                    }}
                  >
                    {p.avgDays === null ? "—" : `${p.avgDays}d`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SubnavAnchorBlock>

      <SubnavSectionLabel>Recently Completed</SubnavSectionLabel>
      <SubnavRecentList items={data.recentCompleted} />
    </SubnavShell>
  );
}
