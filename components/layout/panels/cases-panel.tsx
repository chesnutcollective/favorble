"use client";

import { useState } from "react";

type StageData = {
  name: string;
  count: number;
  percentage: number;
};

type PinnedCase = {
  id: string;
  name: string;
  caseNumber: string;
};

export interface CasesPanelProps {
  stages?: StageData[];
  pinnedCases?: PinnedCase[];
}

const defaultStages: StageData[] = [
  { name: "Intake", count: 8, percentage: 60 },
  { name: "Application", count: 12, percentage: 85 },
  { name: "Reconsideration", count: 9, percentage: 65 },
  { name: "Hearing", count: 6, percentage: 45 },
  { name: "Resolution", count: 5, percentage: 35 },
];

const defaultPinned: PinnedCase[] = [
  { id: "p1", name: "Martinez v. SSA", caseNumber: "CF-4201" },
  { id: "p2", name: "Thompson v. SSA", caseNumber: "CF-4187" },
  { id: "p3", name: "Chen v. SSA", caseNumber: "CF-4156" },
];

const tabs = ["All", "SSDI", "SSI"] as const;

export function CasesPanel({
  stages = defaultStages,
  pinnedCases = defaultPinned,
}: CasesPanelProps) {
  const [activeTab, setActiveTab] = useState<string>("All");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Tabs */}
      <div
        style={{
          display: "flex",
          border: "1px solid #E5E7EB",
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        {tabs.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: "5px 0",
              fontSize: 11,
              fontWeight: 600,
              textAlign: "center",
              background: activeTab === tab ? "#ECFDF5" : "#FFF",
              border: "none",
              borderRight: i < tabs.length - 1 ? "1px solid #E5E7EB" : "none",
              cursor: "pointer",
              color: activeTab === tab ? "#059669" : "#999",
              fontFamily: "inherit",
              transition: "all 0.12s ease",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Stage Breakdown */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#9CA3AF",
          marginBottom: 6,
          padding: "0 8px",
        }}
      >
        By Stage
      </div>
      {stages.map((stage) => (
        <div
          key={stage.name}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 8px",
            fontSize: 12,
            color: "#555",
            borderRadius: 6,
            cursor: "pointer",
            transition: "background 0.12s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#F3F4F6";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>{stage.name}</span>
          <div
            style={{
              width: 32,
              height: 3,
              background: "#EAEAEA",
              borderRadius: 2,
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${stage.percentage}%`,
                background: "#10B981",
                borderRadius: 2,
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
              fontSize: 12,
              fontWeight: 500,
              color: "#10B981",
              minWidth: 16,
              textAlign: "right",
            }}
          >
            {stage.count}
          </span>
        </div>
      ))}

      {/* Pinned Cases */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#9CA3AF",
          marginTop: 16,
          marginBottom: 6,
          padding: "0 8px",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="#D1D5DB"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        Pinned Cases
      </div>
      {pinnedCases.map((c) => (
        <div
          key={c.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 8px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
            color: "#6B7280",
            transition: "background 0.12s ease, color 0.12s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#F0F0F0";
            e.currentTarget.style.color = "#374151";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "#6B7280";
          }}
        >
          <span style={{ color: "#10B981", fontSize: 11, flexShrink: 0 }}>
            &#9733;
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12 }}>{c.name}</span>
          <span
            style={{
              fontSize: 10,
              fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
              color: "#999",
            }}
          >
            {c.caseNumber}
          </span>
        </div>
      ))}
    </div>
  );
}
