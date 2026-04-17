"use client";

import { FolderPlus, UserPlus, Upload, CalendarPlus } from "lucide-react";

type ActivityItem = {
  id: string;
  color: "green" | "blue" | "amber" | "red" | "purple";
  text: string;
  time: string;
};

export interface DashboardPanelProps {
  activeCases?: number;
  tasksDue?: number;
  hearings?: number;
  recentActivity?: ActivityItem[];
}

const defaultActivity: ActivityItem[] = [
  {
    id: "1",
    color: "green",
    text: "Martinez status changed to Hearing",
    time: "12 min ago",
  },
  {
    id: "2",
    color: "blue",
    text: "Doc uploaded for Thompson",
    time: "1 hr ago",
  },
  {
    id: "3",
    color: "amber",
    text: "Email from opposing counsel",
    time: "2 hr ago",
  },
  {
    id: "4",
    color: "purple",
    text: "Davis deposition scheduled",
    time: "3 hr ago",
  },
  {
    id: "5",
    color: "green",
    text: "Wilson inquiry converted to case",
    time: "Yesterday",
  },
];

const dotColors: Record<string, string> = {
  green: "#1d72b8",
  blue: "#3B82F6",
  amber: "#F59E0B",
  red: "#EF4444",
  purple: "#8B5CF6",
};

export function DashboardPanel({
  activeCases = 44,
  tasksDue = 12,
  hearings = 2,
  recentActivity = defaultActivity,
}: DashboardPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Quick Actions */}
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
        Quick Actions
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          marginBottom: 16,
        }}
      >
        <QuickActionButton
          icon={<FolderPlus size={16} aria-hidden="true" />}
          label="New Case"
          primary
        />
        <QuickActionButton icon={<UserPlus size={16} aria-hidden="true" />} label="New Lead" />
        <QuickActionButton icon={<Upload size={16} aria-hidden="true" />} label="Upload Doc" />
        <QuickActionButton icon={<CalendarPlus size={16} aria-hidden="true" />} label="Schedule" />
      </div>

      {/* Today's Numbers */}
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
        Today&apos;s Numbers
      </div>
      <StatRow label="Active Cases" value={activeCases} />
      <StatRow label="Tasks Due" value={tasksDue} />
      <StatRow label="Hearings" value={hearings} />

      {/* Recent Activity */}
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
        }}
      >
        Recent Activity
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {recentActivity.map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "6px 8px",
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
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: dotColors[item.color] ?? "#1d72b8",
                flexShrink: 0,
                marginTop: 5,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "#334155",
                  fontWeight: 500,
                  lineHeight: 1.3,
                }}
              >
                {item.text}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
                  color: "#9CA3AF",
                  marginTop: 1,
                }}
              >
                {item.time}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickActionButton({
  icon,
  label,
  primary = false,
}: {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: "10px 4px",
        border: primary ? "none" : "1px solid #E5E7EB",
        borderRadius: 6,
        background: primary ? "#1d72b8" : "#FFF",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all 0.15s ease",
        color: primary ? "#FFF" : "#1d72b8",
      }}
      onMouseEnter={(e) => {
        if (!primary) {
          e.currentTarget.style.background = "#F5F5F5";
        }
      }}
      onMouseLeave={(e) => {
        if (!primary) {
          e.currentTarget.style.background = "#FFF";
        }
      }}
    >
      {icon}
      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: primary ? "#FFF" : "#1C1C1E",
        }}
      >
        {label}
      </span>
    </button>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 8px",
      }}
    >
      <span style={{ fontSize: 10, textTransform: "uppercase", color: "#999" }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 18,
          fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
          color: "#1C1C1E",
          fontWeight: 600,
        }}
      >
        {value}
      </span>
    </div>
  );
}
