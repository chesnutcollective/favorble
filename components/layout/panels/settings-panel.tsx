"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

type AdminItem = {
  label: string;
  href: string;
};

type ToggleSetting = {
  label: string;
  defaultOn: boolean;
};

export interface SettingsPanelProps {
  adminItems?: AdminItem[];
  toggles?: ToggleSetting[];
}

const defaultAdminItems: AdminItem[] = [
  { label: "Integrations", href: "/settings/integrations" },
  { label: "Workflows", href: "/settings/workflows" },
  { label: "Stages", href: "/settings/stages" },
  { label: "Fields", href: "/settings/fields" },
  { label: "Users", href: "/settings/users" },
  { label: "Templates", href: "/settings/templates" },
  { label: "Preferences", href: "/settings/preferences" },
];

const defaultToggles: ToggleSetting[] = [
  { label: "ERE Sync", defaultOn: true },
  { label: "Email Sync", defaultOn: true },
  { label: "Notifications", defaultOn: true },
];

export function SettingsPanel({
  adminItems = defaultAdminItems,
  toggles = defaultToggles,
}: SettingsPanelProps) {
  const pathname = usePathname();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Admin Items */}
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
        Administration
      </div>
      {adminItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 12,
              color: isActive ? "#185f9b" : "#555",
              fontWeight: isActive ? 500 : 400,
              textDecoration: "none",
              padding: "6px 8px",
              borderRadius: 6,
              cursor: "pointer",
              background: isActive ? "#e6f1fa" : "transparent",
              transition: "color 0.12s ease, background 0.12s ease",
              lineHeight: 1.4,
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "#F0F0F0";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "transparent";
              }
            }}
          >
            <span>{item.label}</span>
            <span style={{ color: "#D1D5DB", fontSize: 14, lineHeight: 1 }}>
              &#8250;
            </span>
          </Link>
        );
      })}

      {/* Toggle Switches */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#9CA3AF",
          marginTop: 20,
          marginBottom: 6,
          padding: "0 8px",
        }}
      >
        Integrations
      </div>
      {toggles.map((toggle) => (
        <ToggleRow
          key={toggle.label}
          label={toggle.label}
          defaultOn={toggle.defaultOn}
        />
      ))}
    </div>
  );
}

function ToggleRow({
  label,
  defaultOn,
}: {
  label: string;
  defaultOn: boolean;
}) {
  const [on, setOn] = useState(defaultOn);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 8px",
        borderBottom: "1px solid #F3F4F6",
      }}
    >
      <span style={{ fontSize: 12, color: "#374151", fontWeight: 500 }}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn(!on)}
        style={{
          position: "relative",
          width: 28,
          height: 16,
          borderRadius: 8,
          border: "none",
          background: on ? "#1d72b8" : "#E5E7EB",
          cursor: "pointer",
          transition: "background 0.2s ease",
          padding: 0,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: on ? 14 : 2,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "#FFF",
            transition: "left 0.2s ease",
            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          }}
        />
      </button>
    </div>
  );
}
