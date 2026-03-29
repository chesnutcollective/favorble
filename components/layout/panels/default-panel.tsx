"use client";

import Link from "next/link";

type RecentItem = {
  id: string;
  label: string;
  meta?: string;
};

export interface DefaultPanelProps {
  title: string;
  href?: string;
  recentItems?: RecentItem[];
}

export function DefaultPanel({
  title,
  href,
  recentItems = [],
}: DefaultPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#1C1C1E",
          letterSpacing: "-0.02em",
          marginBottom: 12,
          padding: "0 4px",
        }}
      >
        {title}
      </div>

      {/* View all link */}
      {href && (
        <Link
          href={href}
          style={{
            fontSize: 12,
            color: "#10B981",
            textDecoration: "none",
            padding: "0 8px",
            marginBottom: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            transition: "color 0.12s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#059669";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#10B981";
          }}
        >
          View all &rarr;
        </Link>
      )}

      {/* Recent items */}
      {recentItems.length > 0 && (
        <>
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
            Recent
          </div>
          {recentItems.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 12,
                color: "#6B7280",
                padding: "6px 8px",
                borderRadius: 6,
                cursor: "pointer",
                transition: "color 0.12s ease, background 0.12s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#F3F4F6";
                e.currentTarget.style.color = "#374151";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#6B7280";
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.label}
              </span>
              {item.meta && (
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
                    color: "#999",
                    flexShrink: 0,
                    marginLeft: 8,
                  }}
                >
                  {item.meta}
                </span>
              )}
            </div>
          ))}
        </>
      )}

      {recentItems.length === 0 && (
        <div
          style={{
            fontSize: 11,
            color: "#9CA3AF",
            padding: "12px 8px",
            textAlign: "center",
          }}
        >
          No recent items
        </div>
      )}
    </div>
  );
}
