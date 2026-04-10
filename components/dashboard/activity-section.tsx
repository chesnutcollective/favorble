"use client";

import { COLORS } from "@/lib/design-tokens";

interface ActivitySectionProps {
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    description: string;
    userName: string;
    timestamp: string;
  }>;
  recentDecisions: Array<{
    caseId: string;
    caseName: string;
    aljName: string;
    outcome: string;
    pastDueBenefits: number;
    decisionDate: string;
  }>;
  teamActivity: Array<{
    userName: string;
    hourlyActivity: number[];
  }>;
  documentQueue: {
    received: number;
    ocrd: number;
    classified: number;
    reviewed: number;
  };
}

/* ---------- helpers ---------- */

const AVATAR_COLORS = [
  "#0070F3",
  COLORS.ok,
  "#F5A623",
  "#EE0000",
  "#7928CA",
  "#00B4D8",
  "#0D9488",
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const ENTITY_TYPE_BADGES: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  hearing: { label: "Hearing", bg: "#FFF3E0", color: "#E65100" },
  document: { label: "Document", bg: "#E3F2FD", color: "#1565C0" },
  decision: { label: "Decision", bg: "#F3E5F5", color: "#6A1B9A" },
  task: { label: "Task", bg: "#FAFAFA", color: "#666" },
  stage_change: { label: "Stage Change", bg: "#FFF8E1", color: "#F57F17" },
  case: { label: "Case", bg: "#E8F5E9", color: "#2E7D32" },
  note: { label: "Note", bg: "#F5F5F5", color: "#666" },
};

function getEntityBadge(entityType: string): {
  label: string;
  bg: string;
  color: string;
} {
  return (
    ENTITY_TYPE_BADGES[entityType] ?? {
      label: entityType.replace(/_/g, " "),
      bg: "#FAFAFA",
      color: "#666",
    }
  );
}

/** Group activity items by date label (Today / Yesterday / date string) */
function groupByDate(
  items: ActivitySectionProps["recentActivity"],
): Map<string, ActivitySectionProps["recentActivity"]> {
  const groups = new Map<string, ActivitySectionProps["recentActivity"]>();
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  for (const item of items) {
    const itemDate = new Date(item.timestamp);
    const itemDateStr = itemDate.toDateString();

    let label: string;
    if (itemDateStr === todayStr) {
      label = "Today";
    } else if (itemDateStr === yesterdayStr) {
      label = "Yesterday";
    } else {
      label = itemDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }

    const group = groups.get(label) ?? [];
    group.push(item);
    groups.set(label, group);
  }

  return groups;
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24 && date.toDateString() === now.toDateString()) {
    return `${diffHrs} hr${diffHrs > 1 ? "s" : ""} ago`;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Heatmap cell background color based on activity intensity */
function heatmapColor(count: number, maxCount: number): string {
  if (count === 0) return "#FAFAFA";
  const ratio = count / maxCount;
  if (ratio > 0.8) return "#42A5F5";
  if (ratio > 0.6) return "#64B5F6";
  if (ratio > 0.4) return "#90CAF9";
  if (ratio > 0.2) return "#BBDEFB";
  return "#E3F2FD";
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/* ---------- sub-components ---------- */

function LiveActivityFeed({
  data,
}: {
  data: ActivitySectionProps["recentActivity"];
}) {
  const grouped = groupByDate(data);

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-md p-5 hover:border-[#CCC] transition-colors duration-200">
      <div className="text-xs font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
        Live Activity Feed
      </div>
      <div
        className="max-h-[400px] overflow-y-auto"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "#EAEAEA transparent",
        }}
      >
        {Array.from(grouped.entries()).map(([label, items]) => (
          <div key={label}>
            <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#999] py-3 sticky top-0 bg-white z-[1] border-b border-[#EAEAEA] mb-2">
              {label}
            </div>
            {items.map((item) => {
              const badge = getEntityBadge(item.entityType);
              return (
                <div
                  key={item.id}
                  className="flex gap-3 py-3 border-b border-[#F0F0F0] last:border-b-0 hover:bg-[#F7F7F7] transition-colors duration-200 cursor-pointer"
                >
                  <div
                    className="w-7 h-7 min-w-[28px] rounded-full flex items-center justify-center text-[11px] font-semibold text-white mt-0.5"
                    style={{ background: getAvatarColor(item.userName) }}
                  >
                    {getInitials(item.userName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] leading-[1.4] text-[#171717]">
                      <strong className="font-semibold">{item.userName}</strong>{" "}
                      <span
                        dangerouslySetInnerHTML={{
                          __html: item.description,
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#999]">
                      <span
                        className="inline-flex items-center px-1.5 py-px rounded text-[10px] font-medium uppercase tracking-[0.03em]"
                        style={{
                          background: badge.bg,
                          color: badge.color,
                          border:
                            badge.bg === "#FAFAFA"
                              ? "1px solid #EAEAEA"
                              : "none",
                        }}
                      >
                        {badge.label}
                      </span>
                      <span className="font-mono">
                        {formatTimestamp(item.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentDecisions({
  data,
}: {
  data: ActivitySectionProps["recentDecisions"];
}) {
  return (
    <div className="bg-white border border-[#EAEAEA] rounded-md p-5 hover:border-[#CCC] transition-colors duration-200">
      <div className="text-xs font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
        Recent Decisions
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        {data.map((decision) => {
          const isFavorable =
            decision.outcome.toLowerCase() === "favorable" ||
            decision.outcome.toLowerCase() === "won";
          const isUnfavorable =
            decision.outcome.toLowerCase() === "unfavorable" ||
            decision.outcome.toLowerCase() === "lost" ||
            decision.outcome.toLowerCase() === "denied";
          const isRemand =
            decision.outcome.toLowerCase() === "remand" ||
            decision.outcome.toLowerCase() === "remanded";

          const borderClass = isFavorable
            ? "border-l-[3px] border-l-[#1d72b8]"
            : isUnfavorable
              ? "border-l-[3px] border-l-[#EE0000]"
              : "border-l-[3px] border-l-[#F5A623]";

          const outcomeStyle = isFavorable
            ? { background: "#EDFCF2", color: "#2E7D32" }
            : isUnfavorable
              ? { background: "#FFF0F0", color: "#EE0000" }
              : { background: "#FEF7EC", color: "#E65100" };

          const outcomeLabel = isFavorable
            ? "Favorable"
            : isUnfavorable
              ? "Unfavorable"
              : isRemand
                ? "Remand"
                : decision.outcome;

          const outcomeIcon = isFavorable
            ? "\u2713"
            : isUnfavorable
              ? "\u2717"
              : "\u21BB";

          return (
            <div
              key={decision.caseId}
              className={`p-3 border border-[#EAEAEA] rounded-md mb-3 last:mb-0 hover:border-[#CCC] transition-colors duration-200 cursor-pointer ${borderClass}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px] font-semibold text-[#171717]">
                  {decision.caseName}
                </div>
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-[10px]"
                  style={outcomeStyle}
                >
                  {outcomeIcon} {outcomeLabel}
                </span>
              </div>
              <div className="flex gap-4 text-xs text-[#666]">
                <div>
                  <span className="text-[11px] text-[#999]">ALJ</span>{" "}
                  {decision.aljName}
                </div>
                {isFavorable && decision.pastDueBenefits > 0 && (
                  <div>
                    <span className="text-[11px] text-[#999]">Benefits</span>{" "}
                    <strong className="font-mono" style={{ color: COLORS.ok }}>
                      {formatCurrency(decision.pastDueBenefits)}
                    </strong>
                  </div>
                )}
                <div>
                  <span className="text-[11px] text-[#999]">Date</span>{" "}
                  {decision.decisionDate}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamActivityHeatmap({
  data,
}: {
  data: ActivitySectionProps["teamActivity"];
}) {
  const hourLabels = [
    "8a",
    "9a",
    "10a",
    "11a",
    "12p",
    "1p",
    "2p",
    "3p",
    "4p",
    "5p",
    "6p",
    "7p",
  ];

  const globalMax = Math.max(...data.flatMap((m) => m.hourlyActivity), 1);

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-md p-5 hover:border-[#CCC] transition-colors duration-200">
      <div className="text-xs font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
        Team Activity Heatmap
      </div>
      <div className="overflow-x-auto">
        <div
          className="grid gap-0.5 text-[10px]"
          style={{
            gridTemplateColumns: `100px repeat(${hourLabels.length}, 1fr)`,
          }}
        >
          {/* Header row */}
          <div className="font-medium text-[#999] uppercase tracking-[0.05em] p-1 px-2 text-left" />
          {hourLabels.map((label) => (
            <div
              key={label}
              className="font-medium text-[#999] uppercase tracking-[0.05em] p-1 px-2 text-center"
            >
              {label}
            </div>
          ))}

          {/* Data rows */}
          {data.map((member) => (
            <div key={member.userName} className="contents">
              <div className="text-[11px] text-[#666] p-1 px-2 flex items-center">
                {member.userName}
              </div>
              {member.hourlyActivity
                .slice(0, hourLabels.length)
                .map((count, i) => (
                  <div
                    key={i}
                    className="rounded-sm flex items-center justify-center font-mono text-[9px] p-1 min-h-[24px]"
                    style={{
                      background: heatmapColor(count, globalMax),
                      color: count > globalMax * 0.6 ? "#fff" : "#666",
                    }}
                  >
                    {count}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
      <div className="text-[10px] text-[#999] font-mono mt-2 text-center">
        Actions per hour &mdash; Today
      </div>
    </div>
  );
}

function DocumentProcessingQueue({
  data,
}: {
  data: ActivitySectionProps["documentQueue"];
}) {
  const stages = [
    { label: "Received", count: data.received, color: "#F5A623" },
    { label: "OCR\u2019d", count: data.ocrd, color: "#0070F3" },
    { label: "Classified", count: data.classified, color: "#7928CA" },
    { label: "Reviewed", count: data.reviewed, color: COLORS.ok },
  ];

  const total = stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="bg-white border border-[#EAEAEA] rounded-md p-5 hover:border-[#CCC] transition-colors duration-200">
      <div className="text-xs font-medium text-[#999] uppercase tracking-[0.04em] mb-3">
        Document Processing Queue
      </div>

      {/* Pipeline stages */}
      <div className="grid grid-cols-4 gap-3 mt-4">
        {stages.map((stage, i) => (
          <div
            key={stage.label}
            className="text-center p-3 border rounded-md relative"
            style={{ borderColor: stage.color }}
          >
            <div
              className="text-2xl font-semibold font-mono tracking-tight"
              style={{ color: stage.color }}
            >
              {stage.count}
            </div>
            <div className="text-[11px] text-[#999] uppercase tracking-[0.04em] mt-0.5">
              {stage.label}
            </div>
            {/* Arrow connector */}
            {i < stages.length - 1 && (
              <div
                className="absolute top-1/2 -right-[10px] w-4 h-0.5"
                style={{ background: "#EAEAEA" }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Throughput progress bar */}
      <div className="mt-6">
        <div className="text-[11px] text-[#999] uppercase tracking-[0.05em] mb-2">
          Processing Stats
        </div>
        <div className="h-2 bg-[#F7F7F7] rounded-full overflow-hidden mb-3">
          {total > 0 && (
            <div
              className="h-full rounded-full transition-[width] duration-[600ms] ease-out"
              style={{
                width: `${Math.round((data.reviewed / total) * 100)}%`,
                background: COLORS.ok,
              }}
            />
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] text-[#999]">Total in Pipeline</div>
            <div className="text-base font-semibold font-mono">{total}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#999]">Completed</div>
            <div className="text-base font-semibold font-mono">
              {data.reviewed}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#999]">Throughput</div>
            <div className="text-base font-semibold font-mono">
              {total > 0 ? Math.round((data.reviewed / total) * 100) : 0}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- main component ---------- */

export function ActivitySection({
  recentActivity,
  recentDecisions,
  teamActivity,
  documentQueue,
}: ActivitySectionProps) {
  return (
    <div className="mb-8">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#999] mb-3 pb-2 border-b border-[#EAEAEA]">
        Activity &amp; Feeds
      </div>

      {/* Row 1: Live Feed + Recent Decisions */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <LiveActivityFeed data={recentActivity} />
        <RecentDecisions data={recentDecisions} />
      </div>

      {/* Row 2: Heatmap + Document Queue */}
      <div className="grid grid-cols-2 gap-4">
        <TeamActivityHeatmap data={teamActivity} />
        <DocumentProcessingQueue data={documentQueue} />
      </div>
    </div>
  );
}
