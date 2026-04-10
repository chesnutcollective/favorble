"use client";

import { COLORS } from "@/lib/design-tokens";

interface EvidenceSectionProps {
  rfcLimitations: Array<{
    limitation: string;
    count: number;
    type: "physical" | "mental";
  }>;
  ceOutcomes: { supportive: number; neutral: number; unsupportive: number };
  vocationalExperts: Array<{
    dotCode: string;
    jobTitle: string;
    exertionalLevel: string;
    frequency: number;
  }>;
  upcomingHearings: Array<{
    caseId: string;
    caseName: string;
    aljName: string;
    hearingDate: string;
    prepProgress: number;
    daysUntil: number;
  }>;
  clientSatisfaction: { score: number; trend: number };
}

/* ---------- helpers ---------- */

function getMaxCount(items: EvidenceSectionProps["rfcLimitations"]): number {
  return Math.max(...items.map((i) => i.count), 1);
}

function prepColor(progress: number): string {
  if (progress >= 70) return COLORS.ok;
  if (progress >= 40) return "#F5A623";
  return "#EE0000";
}

function prepBadge(progress: number): {
  label: string;
  bg: string;
  color: string;
} {
  if (progress >= 70)
    return { label: "Ready", bg: "#EDFCF2", color: "#2E7D32" };
  if (progress >= 40)
    return { label: "In Progress", bg: "#FEF7EC", color: "#E65100" };
  return { label: "Behind", bg: "#FFF0F0", color: "#EE0000" };
}

/* ---------- sub-components ---------- */

function RfcLimitationPatterns({
  data,
}: {
  data: EvidenceSectionProps["rfcLimitations"];
}) {
  const physical = data.filter((d) => d.type === "physical");
  const mental = data.filter((d) => d.type === "mental");
  const maxCount = getMaxCount(data);

  // Merge by limitation name to create side-by-side rows
  const allNames = Array.from(new Set(data.map((d) => d.limitation)));
  const rows = allNames.map((name) => ({
    limitation: name,
    physical: physical.find((p) => p.limitation === name)?.count ?? 0,
    mental: mental.find((m) => m.limitation === name)?.count ?? 0,
  }));

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-md p-5 hover:border-[#CCC] transition-colors duration-200">
      <div className="text-xs font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
        RFC Limitation Patterns
      </div>
      <div className="mt-3">
        {rows.map((row) => {
          const physPct = Math.round((row.physical / maxCount) * 100);
          const mentPct = Math.round((row.mental / maxCount) * 100);
          return (
            <div key={row.limitation} className="flex items-center gap-3 mb-2">
              <div className="w-[120px] text-[11px] text-[#666] text-right shrink-0">
                {row.limitation}
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <div className="h-3.5 bg-[#F7F7F7] rounded overflow-hidden">
                  <div
                    className="h-full rounded flex items-center pl-1 transition-[width] duration-[600ms] ease-out"
                    style={{
                      width: `${physPct}%`,
                      background: "#0070F3",
                    }}
                  >
                    {physPct > 15 && (
                      <span className="text-[9px] font-mono font-medium text-white">
                        {row.physical}
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-3.5 bg-[#F7F7F7] rounded overflow-hidden">
                  <div
                    className="h-full rounded flex items-center pl-1 transition-[width] duration-[600ms] ease-out"
                    style={{
                      width: `${mentPct}%`,
                      background: "#7928CA",
                    }}
                  >
                    {mentPct > 15 && (
                      <span className="text-[9px] font-mono font-medium text-white">
                        {row.mental}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-3">
        <div className="flex items-center gap-2 text-[11px] font-mono text-[#666]">
          <div
            className="w-2 h-2 rounded-sm"
            style={{ background: "#0070F3" }}
          />
          Physical
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-[#666]">
          <div
            className="w-2 h-2 rounded-sm"
            style={{ background: "#7928CA" }}
          />
          Mental
        </div>
      </div>
    </div>
  );
}

function CeOutcomesDonut({
  data,
}: {
  data: EvidenceSectionProps["ceOutcomes"];
}) {
  const total = data.supportive + data.neutral + data.unsupportive;
  if (total === 0) {
    return (
      <div className="bg-white border border-[#EAEAEA] rounded-md p-5 hover:border-[#CCC] transition-colors duration-200">
        <div className="text-xs font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
          CE Outcomes
        </div>
        <p className="text-[13px] text-[#666] py-4 text-center">No CE data</p>
      </div>
    );
  }

  const supportivePct = Math.round((data.supportive / total) * 100);
  const neutralPct = Math.round((data.neutral / total) * 100);
  const unsupportivePct = 100 - supportivePct - neutralPct;

  const circumference = 2 * Math.PI * 50; // r=50
  const supportiveLen = (supportivePct / 100) * circumference;
  const neutralLen = (neutralPct / 100) * circumference;
  const unsupportiveLen = (unsupportivePct / 100) * circumference;

  // Rotation offsets (starting from 12 o'clock = -90deg)
  const supportiveRotation = -90;
  const neutralRotation = supportiveRotation + (supportivePct / 100) * 360;
  const unsupportiveRotation = neutralRotation + (neutralPct / 100) * 360;

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-md p-5 hover:border-[#CCC] transition-colors duration-200">
      <div className="text-xs font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
        CE Outcomes
      </div>
      <div className="flex items-center justify-center gap-6 mt-3">
        <svg viewBox="0 0 140 140" className="w-[140px] h-[140px]">
          {/* Background ring */}
          <circle
            cx="70"
            cy="70"
            r="50"
            fill="none"
            stroke="#EAEAEA"
            strokeWidth="14"
          />
          {/* Supportive (green) */}
          <circle
            cx="70"
            cy="70"
            r="50"
            fill="none"
            stroke={COLORS.ok}
            strokeWidth="14"
            strokeDasharray={`${supportiveLen} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(${supportiveRotation} 70 70)`}
          />
          {/* Neutral (amber) */}
          <circle
            cx="70"
            cy="70"
            r="50"
            fill="none"
            stroke="#F5A623"
            strokeWidth="14"
            strokeDasharray={`${neutralLen} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(${neutralRotation} 70 70)`}
          />
          {/* Unsupportive (red) */}
          <circle
            cx="70"
            cy="70"
            r="50"
            fill="none"
            stroke="#EE0000"
            strokeWidth="14"
            strokeDasharray={`${unsupportiveLen} ${circumference}`}
            strokeLinecap="round"
            strokeOpacity="0.7"
            transform={`rotate(${unsupportiveRotation} 70 70)`}
          />
          {/* Center text */}
          <text
            x="70"
            y="66"
            textAnchor="middle"
            fontFamily="var(--font-mono, 'Geist Mono', monospace)"
            fontWeight="600"
            fontSize="18"
            fill="#171717"
          >
            {total}
          </text>
          <text
            x="70"
            y="82"
            textAnchor="middle"
            fontFamily="var(--font-mono, 'Geist Mono', monospace)"
            fontSize="9"
            fill="#999"
            letterSpacing="0.05em"
          >
            TOTAL CEs
          </text>
        </svg>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-[#666]">
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{ background: COLORS.ok }}
            />
            Supportive: {supportivePct}%
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#666]">
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{ background: "#F5A623" }}
            />
            Neutral: {neutralPct}%
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#666]">
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{ background: "#EE0000", opacity: 0.7 }}
            />
            Unsupportive: {unsupportivePct}%
          </div>
        </div>
      </div>
    </div>
  );
}

function VocationalExpertTable({
  data,
}: {
  data: EvidenceSectionProps["vocationalExperts"];
}) {
  const maxFreq = Math.max(...data.map((d) => d.frequency), 1);

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-md p-5 hover:border-[#CCC] transition-colors duration-200">
      <div className="text-xs font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
        Vocational Expert Analysis
      </div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#999] py-2 px-3 text-left border-b border-[#EAEAEA]">
              DOT Code
            </th>
            <th className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#999] py-2 px-3 text-left border-b border-[#EAEAEA]">
              Job Title
            </th>
            <th className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#999] py-2 px-3 text-left border-b border-[#EAEAEA]">
              Exertional Level
            </th>
            <th className="text-[10px] font-medium uppercase tracking-[0.04em] text-[#999] py-2 px-3 text-left border-b border-[#EAEAEA] w-[40%]">
              Frequency
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const pct = Math.round((row.frequency / maxFreq) * 100);
            const barColor =
              pct >= 60
                ? COLORS.ok
                : pct >= 40
                  ? "#0070F3"
                  : "rgba(238, 0, 0, 0.7)";
            return (
              <tr key={row.dotCode}>
                <td className="py-2 px-3 border-b border-[#F0F0F0] text-[#666] font-mono">
                  {row.dotCode}
                </td>
                <td className="py-2 px-3 border-b border-[#F0F0F0] text-[#666]">
                  {row.jobTitle}
                </td>
                <td className="py-2 px-3 border-b border-[#F0F0F0] text-[#666]">
                  {row.exertionalLevel}
                </td>
                <td className="py-2 px-3 border-b border-[#F0F0F0]">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3.5 rounded inline-block align-middle"
                      style={{
                        width: `${pct}%`,
                        background: barColor,
                      }}
                    />
                    <span className="text-[11px] font-mono text-[#666]">
                      {row.frequency}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HearingPrepReadiness({
  data,
}: {
  data: EvidenceSectionProps["upcomingHearings"];
}) {
  return (
    <div className="bg-white border border-[#EAEAEA] rounded-md p-5 hover:border-[#CCC] transition-colors duration-200">
      <div className="text-xs font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
        Hearing Prep Readiness
      </div>
      <div>
        {data.map((hearing) => {
          const color = prepColor(hearing.prepProgress);
          const badge = prepBadge(hearing.prepProgress);
          return (
            <div
              key={hearing.caseId}
              className="flex items-center gap-3 py-3 border-b border-[#F0F0F0] last:border-b-0"
            >
              <div className="w-[160px] shrink-0">
                <div className="text-[13px] font-medium text-[#171717]">
                  {hearing.caseName}
                </div>
                <div className="text-[11px] font-mono text-[#999]">
                  {hearing.daysUntil} days &mdash; {hearing.hearingDate}
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-[3px]">
                <div className="h-2 bg-[#F7F7F7] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-[600ms] ease-out"
                    style={{
                      width: `${hearing.prepProgress}%`,
                      background: color,
                    }}
                  />
                </div>
                <div className="text-[11px] font-mono text-[#666]">
                  {hearing.prepProgress}% complete
                </div>
              </div>
              <div className="w-20 shrink-0 text-right">
                <span
                  className="inline-block px-2 py-0.5 rounded-[10px] text-[11px] font-medium"
                  style={{ background: badge.bg, color: badge.color }}
                >
                  {badge.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClientSatisfactionGauge({
  data,
}: {
  data: EvidenceSectionProps["clientSatisfaction"];
}) {
  const { score, trend } = data;
  const circumference = 2 * Math.PI * 48; // r=48
  const arcLen = (score / 100) * circumference;
  const trendPositive = trend >= 0;

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-md p-5 hover:border-[#CCC] transition-colors duration-200">
      <div className="text-xs font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
        Client Satisfaction Score
      </div>
      <div className="flex items-center justify-center gap-6 py-3">
        <svg viewBox="0 0 120 120" className="w-[120px] h-[120px]">
          {/* Background ring */}
          <circle
            cx="60"
            cy="60"
            r="48"
            fill="none"
            stroke="#EAEAEA"
            strokeWidth="10"
          />
          {/* Score arc */}
          <circle
            cx="60"
            cy="60"
            r="48"
            fill="none"
            stroke={COLORS.ok}
            strokeWidth="10"
            strokeDasharray={`${arcLen} ${circumference}`}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
          />
          {/* Center number */}
          <text
            x="60"
            y="58"
            textAnchor="middle"
            fontFamily="var(--font-mono, 'Geist Mono', monospace)"
            fontWeight="700"
            fontSize="26"
            fill="#171717"
          >
            {score}
          </text>
          <text
            x="60"
            y="74"
            textAnchor="middle"
            fontFamily="var(--font-mono, 'Geist Mono', monospace)"
            fontSize="9"
            fill="#999"
          >
            / 100
          </text>
        </svg>
        <div className="flex flex-col gap-3">
          <div
            className="flex items-center gap-2 text-xs font-mono"
            style={{ color: trendPositive ? COLORS.ok : "#EE0000" }}
          >
            {trendPositive ? "\u2191" : "\u2193"} {trendPositive ? "+" : ""}
            {trend} vs last quarter
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- main component ---------- */

export function EvidenceSection({
  rfcLimitations,
  ceOutcomes,
  vocationalExperts,
  upcomingHearings,
  clientSatisfaction,
}: EvidenceSectionProps) {
  return (
    <div className="mb-8">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#999] mb-3 pb-2 border-b border-[#EAEAEA]">
        Evidence &amp; Hearings
      </div>

      {/* 2-column grid: RFC + CE, VE + Hearing Prep */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <RfcLimitationPatterns data={rfcLimitations} />
        <CeOutcomesDonut data={ceOutcomes} />
        <VocationalExpertTable data={vocationalExperts} />
        <HearingPrepReadiness data={upcomingHearings} />
      </div>

      {/* Client Satisfaction - 3-col grid, single card */}
      <div className="grid grid-cols-3 gap-4">
        <ClientSatisfactionGauge data={clientSatisfaction} />
      </div>
    </div>
  );
}
