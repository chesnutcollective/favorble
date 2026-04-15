"use client";

import React, { useState, useEffect, useLayoutEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/actions/auth";
import type { SessionUser } from "@/lib/auth/session";
import type { NavPanelData } from "@/app/actions/nav-data";
import type { CommitEntry } from "@/app/actions/changelog";
import { PersonaDashboardSubnav } from "@/components/dashboard/subnav";
import type { DashboardSubnavData } from "@/lib/dashboard-subnav/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThemeSwitcher } from "./theme-switcher";
import { ViewAsMenu } from "./view-as-menu";
import type { PersonaId } from "@/lib/personas/config";

/* ─── Tooltip descriptions ─── */

const railTooltips: Record<string, string> = {
  dashboard: "Dashboard \u2014 your daily command center",
  supervisor: "Supervisor \u2014 monitor team performance & case health",
  coaching: "Coaching \u2014 flags, action plans & training gaps",
  drafts: "AI Drafts \u2014 review & approve AI-generated documents",
  cases: "Cases \u2014 every active case at a glance",
  leads: "Leads \u2014 intake pipeline & new prospects",
  queue: "Queue \u2014 your personal task list",
  calendar: "Calendar \u2014 hearings, deadlines & appointments",
  messages: "Messages \u2014 client conversations",
  email: "Email \u2014 Outlook integration",
  contacts: "Contacts \u2014 claimants, providers & counsel",
  documents: "Documents \u2014 case files & uploads",
  reports: "Reports \u2014 analytics, win rates & ALJ stats",
  hearings: "Hearings \u2014 upcoming hearing prep",
  filing: "Filing \u2014 SSDI/SSI application queue",
  "phi-writer": "PHI Writer \u2014 pre-hearing intelligence sheets",
  "medical-records": "Medical Records \u2014 MR collection & RFC tracking",
  mail: "Mail \u2014 physical mail processing",
  billing: "Billing \u2014 time, invoices & payments",
  trust: "Trust \u2014 IOLTA accounts & transactions",
  "team-chat": "Team Chat \u2014 internal channels",
  "fee-collection": "Fee Collection \u2014 petitions & collections",
  "appeals-council": "Appeals Council \u2014 AC brief pipeline",
  "post-hearing": "Post-Hearing \u2014 outcome processing",
};

/* ─── Rail nav items ─── */

interface RailItem {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  notification?: boolean;
}

const mainNav: RailItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M4 2h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm12 0h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM4 14h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zm12 0h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z" />
      </svg>
    ),
  },
  {
    id: "cases",
    label: "Cases",
    href: "/cases",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" />
      </svg>
    ),
  },
  {
    id: "leads",
    label: "Leads",
    href: "/leads",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
      </svg>
    ),
  },
  {
    id: "queue",
    label: "Queue",
    href: "/queue",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
      </svg>
    ),
  },
  {
    id: "calendar",
    label: "Calendar",
    href: "/calendar",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z" />
      </svg>
    ),
  },
  {
    id: "messages",
    label: "Messages",
    href: "/messages",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
      </svg>
    ),
    notification: true,
  },
  {
    id: "email",
    label: "Email",
    href: "/email",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
      </svg>
    ),
  },
  {
    id: "contacts",
    label: "Contacts",
    href: "/contacts",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
      </svg>
    ),
  },
  {
    id: "documents",
    label: "Documents",
    href: "/documents",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
      </svg>
    ),
  },
  {
    id: "reports",
    label: "Reports",
    href: "/reports",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
      </svg>
    ),
  },
  {
    id: "hearings",
    label: "Hearings",
    href: "/hearings",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M12 3 1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z" />
      </svg>
    ),
  },
  {
    id: "filing",
    label: "Filing",
    href: "/filing",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM7 18v-2h7v2H7zm10-4H7v-2h10v2zm-4-7V3.5L18.5 9H13z" />
      </svg>
    ),
  },
  {
    id: "phi-writer",
    label: "PHI Writer",
    href: "/phi-writer",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
      </svg>
    ),
  },
  {
    id: "medical-records",
    label: "Medical Records",
    href: "/medical-records",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M19 3H5c-1.11 0-2 .89-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-2 11h-3v3h-2v-3H9v-2h3V9h2v3h3v2z" />
      </svg>
    ),
  },
  {
    id: "mail",
    label: "Mail",
    href: "/mail",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M22 4H2v16h20V4zm-2 4-8 5-8-5V6l8 5 8-5v2z" />
      </svg>
    ),
  },
  {
    id: "billing",
    label: "Billing",
    href: "/billing",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" />
      </svg>
    ),
  },
  {
    id: "trust",
    label: "Trust",
    href: "/trust",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
      </svg>
    ),
  },
  {
    id: "team-chat",
    label: "Team Chat",
    href: "/team-chat",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />
      </svg>
    ),
  },
  {
    id: "fee-collection",
    label: "Fee Collection",
    href: "/fee-collection",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm.88 15.76V19h-1.75v-1.29c-1.12-.24-2.1-.95-2.17-2.2h1.28c.07.73.58 1.3 1.88 1.3 1.39 0 1.7-.69 1.7-1.13 0-.59-.32-1.15-1.94-1.54-1.81-.44-3.05-1.18-3.05-2.67 0-1.25.99-2.06 2.21-2.33V7.84h1.75v1.32c1.33.32 2 1.33 2.04 2.42h-1.28c-.04-.77-.45-1.3-1.59-1.3-1.1 0-1.77.5-1.77 1.21 0 .62.48 1.03 1.95 1.4 1.47.37 3.04.99 3.04 2.83-.01 1.34-1.01 2.07-2.3 2.34z" />
      </svg>
    ),
  },
  {
    id: "appeals-council",
    label: "Appeals Council",
    href: "/appeals-council",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M12 3c-.55 0-1 .45-1 1v.28c-1.16.41-2 1.51-2 2.82v.01l-4 8.89c0 2 2 3 4 3s4-1 4-3l-4-8.89v-.01c0-.65.41-1.2 1-1.41V20H5v2h14v-2h-6V5.72c.59.21 1 .76 1 1.41v.01l-4 8.89c0 2 2 3 4 3s4-1 4-3l-4-8.89v-.01c0-1.31-.84-2.41-2-2.82V4c0-.55-.45-1-1-1zm-5 7.33L8.6 14H5.4L7 10.33zm10 0L18.6 14h-3.2L17 10.33z" />
      </svg>
    ),
  },
  {
    id: "post-hearing",
    label: "Post-Hearing",
    href: "/post-hearing",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
      </svg>
    ),
  },
  {
    id: "supervisor",
    label: "Supervisor",
    href: "/admin/supervisor",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
      </svg>
    ),
  },
  {
    id: "coaching",
    label: "Coaching",
    href: "/coaching",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A1.5 1.5 0 0 0 18.54 8h-2.08a1.5 1.5 0 0 0-1.42 1L13 13.5V22h7zM12.5 11.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5S11 9.17 11 10s.67 1.5 1.5 1.5zM5.5 6c1.11 0 2-.89 2-2s-.89-2-2-2-2 .89-2 2 .89 2 2 2zm2 16v-7H9V9c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v6h1.5v7h4z" />
      </svg>
    ),
  },
  {
    id: "drafts",
    label: "AI Drafts",
    href: "/drafts",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        width="18"
        height="18"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
      </svg>
    ),
  },
];

const settingsIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    width="18"
    height="18"
  >
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
  </svg>
);

/* ─── Settings sub-nav items ─── */

interface SettingsItem {
  label: string;
  href: string;
  description: string;
}

const settingsNav: SettingsItem[] = [
  {
    label: "General",
    href: "/admin/settings",
    description: "Organization and account",
  },
  { label: "Users", href: "/admin/users", description: "Manage team access" },
  {
    label: "Stages",
    href: "/admin/stages",
    description: "Define case progression",
  },
  {
    label: "Fields",
    href: "/admin/fields",
    description: "Customize data fields",
  },
  {
    label: "Templates",
    href: "/admin/templates",
    description: "Document templates",
  },
  {
    label: "Workflows",
    href: "/admin/workflows",
    description: "Automate case actions",
  },
  {
    label: "Integrations",
    href: "/admin/integrations",
    description: "Connect external services",
  },
  {
    label: "Audit Logs",
    href: "/admin/audit-logs",
    description: "Search system event history",
  },
  {
    label: "Feedback",
    href: "/admin/feedback",
    description: "Triage bugs, feature requests, UX issues",
  },
  {
    label: "AI Review",
    href: "/admin/ai-review",
    description: "Verify AI-extracted data",
  },
];

/* ─── Determine active rail item from pathname ─── */

function getActiveRailId(pathname: string, items: RailItem[]): string {
  if (pathname.startsWith("/changelog")) return "changelog";
  for (const item of items) {
    if (item.id === "dashboard") {
      if (pathname === "/dashboard" || pathname === "/") return "dashboard";
      continue;
    }
    if (pathname.startsWith(item.href)) return item.id;
  }
  if (pathname.startsWith("/admin")) return "settings";
  return items[0]?.id ?? "dashboard";
}

/* ─── Component ─── */

export function TwoTierNav({
  user,
  casesCount,
  navData,
  subnavData,
  personaNav,
  isAdmin,
  currentPersonaId,
  isViewingAs,
  changelogCommits,
  initialCollapsed = false,
}: {
  user: SessionUser;
  casesCount?: number;
  navData?: NavPanelData;
  /** Per-persona dashboard sub-nav data (discriminated union) */
  subnavData?: import("@/lib/dashboard-subnav/types").DashboardSubnavData;
  /**
   * Ordered list of rail item IDs this persona is allowed to see.
   * Items not in this list are hidden. Ordering follows this array.
   */
  personaNav: string[];
  /**
   * True when the real signed-in actor is an admin. Controls whether the
   * settings gear and "View as" menu render — independent of the currently
   * previewed persona so admins keep their controls while viewing as others.
   */
  isAdmin: boolean;
  /** The effective persona currently driving the UI (for view-as highlighting). */
  currentPersonaId: PersonaId;
  /** True when the admin is actively previewing another persona. */
  isViewingAs: boolean;
  /** Recent commits for the changelog panel. */
  changelogCommits?: CommitEntry[];
  /**
   * SSR-seeded collapse state read from the `ttn-rail-collapsed` cookie in
   * the server layout. Seeding on the server prevents the hydration flash
   * that used to cause half-drawn labels when localStorage took over.
   */
  initialCollapsed?: boolean;
}) {
  const pathname = usePathname();

  // Sidebar collapse state — SSR-seeded from cookie, persisted back to cookie
  // so the next server render already knows the user's preference.
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  useEffect(() => {
    document.cookie = `ttn-rail-collapsed=${collapsed ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.style.setProperty(
      "--sidebar-w",
      collapsed ? "80px" : "376px",
    );
  }, [collapsed]);

  // Refs + state for rail interactions (auto-scroll active, overflow fades,
  // keyboard roving).
  const activeRailRef = React.useRef<HTMLAnchorElement | null>(null);
  const scrollInnerRef = React.useRef<HTMLDivElement | null>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  // Keyboard shortcut: Cmd/Ctrl+\ toggles the rail (VSCode/Cursor muscle memory).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Arrow-key roving focus between rail items. Keeps focus inside the
  // scroll-inner container; Home/End jump to first/last.
  const onRailKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
      const container = scrollInnerRef.current;
      if (!container) return;
      const items = Array.from(
        container.querySelectorAll<HTMLAnchorElement>("[data-rail-item]"),
      );
      if (items.length === 0) return;
      const idx = items.findIndex((el) => el === document.activeElement);
      let next = idx;
      if (e.key === "ArrowDown")
        next = idx < 0 ? 0 : (idx + 1) % items.length;
      else if (e.key === "ArrowUp")
        next =
          idx < 0 ? items.length - 1 : (idx - 1 + items.length) % items.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = items.length - 1;
      if (next !== idx) {
        e.preventDefault();
        items[next]?.focus();
      }
    },
    [],
  );

  // Build a persona-scoped rail in the persona's preferred order.
  // Items not in personaNav are hidden. Unknown IDs are silently skipped.
  const railItemsById = React.useMemo(() => {
    const map = new Map<string, RailItem>();
    for (const item of mainNav) map.set(item.id, item);
    return map;
  }, []);
  const visibleRailItems = React.useMemo(() => {
    const out: RailItem[] = [];
    const seen = new Set<string>();
    for (const id of personaNav) {
      if (seen.has(id)) continue;
      const item = railItemsById.get(id);
      if (item) {
        out.push(item);
        seen.add(id);
      }
    }
    return out;
  }, [personaNav, railItemsById]);

  const activeRailId = getActiveRailId(pathname, visibleRailItems);

  // Auto-scroll the active rail item into view when the route changes so the
  // user never has to hunt for it in a long list (admin has 21 items).
  // `block: "nearest"` no-ops when the item is already visible.
  useLayoutEffect(() => {
    activeRailRef.current?.scrollIntoView({ block: "nearest" });
  }, [pathname]);

  // Overflow-fade indicators: show a top/bottom gradient when there are
  // more items scrolled off-screen. Re-measures on scroll, resize, and
  // when the item list changes (view-as persona switch).
  useEffect(() => {
    const el = scrollInnerRef.current;
    if (!el) return;
    const update = () => {
      setShowTopFade(el.scrollTop > 4);
      setShowBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [visibleRailItems.length, collapsed]);

  // Panel override: allows non-route panels (e.g. changelog) to show temporarily
  const [panelOverride, setPanelOverride] = useState<string | null>(null);
  // Reset override when the route changes
  useEffect(() => {
    setPanelOverride(null);
  }, [pathname]);
  const visiblePanel = panelOverride ?? activeRailId;

  // Unread changelog badge: compare commit dates against localStorage timestamp.
  // Clear when user navigates to /changelog.
  const [changelogUnread, setChangelogUnread] = useState(0);
  useEffect(() => {
    if (!changelogCommits?.length) return;
    // If the user is currently on /changelog, mark everything as read
    if (pathname.startsWith("/changelog")) {
      localStorage.setItem("changelog:lastViewedAt", new Date().toISOString());
      setChangelogUnread(0);
      return;
    }
    const lastViewed = localStorage.getItem("changelog:lastViewedAt");
    if (!lastViewed) {
      setChangelogUnread(changelogCommits.length);
      return;
    }
    const lastViewedDate = new Date(lastViewed).getTime();
    const unread = changelogCommits.filter(
      (c) => new Date(c.date).getTime() > lastViewedDate,
    ).length;
    setChangelogUnread(unread);
  }, [changelogCommits, pathname]);

  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();

  function isRailActive(item: RailItem) {
    if (item.id === "dashboard")
      return pathname === "/dashboard" || pathname === "/";
    return pathname.startsWith(item.href);
  }

  return (
    <div className="ttn-float" data-collapsed={collapsed}>
      <div className="ttn-card">
        {/* ── Tier 1: Icon Rail ── */}
        <TooltipProvider delayDuration={0}>
        <nav className="ttn-rail">
          {/* Logo */}
          <Link
            href="/dashboard"
            className="ttn-logo"
            aria-label="Hogan Smith — Dashboard"
          >
            <Image
              src="/hogansmith-badge.png"
              alt="Hogan Smith Law"
              width={88}
              height={64}
              priority
            />
          </Link>

          {/* Main nav icons — scroll lives on the inner wrapper, fade
           *  overlays are absolutely positioned siblings so the active
           *  item's ::before accent bar never gets half-faded by a
           *  mask-image. Fades only show when content is actually
           *  clipped above/below the viewport.
           */}
          <div className="ttn-rail-group">
            <div
              ref={scrollInnerRef}
              className="ttn-rail-scroll-inner"
              onKeyDown={onRailKeyDown}
            >
              {visibleRailItems.map((item) => {
                const active = isRailActive(item);
                const tip = railTooltips[item.id] ?? item.label;
                return (
                  <Tooltip
                    key={item.id}
                    // Only render tooltips when collapsed — in expanded
                    // mode the visible label already names the item and
                    // hover tooltips feel noisy.
                    open={collapsed ? undefined : false}
                  >
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        ref={active ? activeRailRef : undefined}
                        className={`ttn-rail-btn${active ? " active" : ""}`}
                        aria-current={active ? "page" : undefined}
                        data-rail-item
                      >
                        {item.icon}
                        <span
                          className={
                            collapsed ? "sr-only" : "ttn-rail-label"
                          }
                        >
                          {item.label}
                        </span>
                        {item.notification && (
                          <span className="ttn-notif-dot" />
                        )}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      sideOffset={10}
                      className="ttn-tooltip"
                    >
                      {tip}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <div
              className={`ttn-rail-fade ttn-rail-fade-top${showTopFade ? " visible" : ""}`}
              aria-hidden="true"
            />
            <div
              className={`ttn-rail-fade ttn-rail-fade-bottom${showBottomFade ? " visible" : ""}`}
              aria-hidden="true"
            />
          </div>

          <div className="ttn-rail-divider" />
          <div className="ttn-rail-spacer" />

          {/* Collapse / expand toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="ttn-collapse-btn"
                aria-pressed={collapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                onClick={() => setCollapsed((c) => !c)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="16"
                  height="16"
                  style={{
                    transform: collapsed ? "rotate(180deg)" : undefined,
                    transition: "transform 0.2s ease",
                  }}
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              sideOffset={10}
              className="ttn-tooltip"
            >
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </TooltipContent>
          </Tooltip>

          {/* User avatar */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    className="ttn-rail-avatar"
                    type="button"
                  >
                    <span>{initials}</span>
                    <span className="ttn-status-dot" />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                sideOffset={10}
                className="ttn-tooltip"
              >
                Your profile & view-as
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              side="right"
              align="end"
              sideOffset={12}
              className="w-56 rounded-lg"
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EAEAEA] text-[11px] font-bold text-[#171717]">
                    {initials}
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {user.firstName} {user.lastName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.role.replace("_", " ")}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Theme
                </span>
                <ThemeSwitcher />
              </div>
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <ViewAsMenu
                    currentPersonaId={currentPersonaId}
                    isViewingAs={isViewingAs}
                  />
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <button
                  type="button"
                  className="w-full"
                  onClick={() => logout()}
                >
                  Sign out
                </button>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Changelog / what's new — navigates to /changelog */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/changelog"
                className={`ttn-rail-btn${pathname.startsWith("/changelog") ? " active" : ""}`}
                style={{ position: "relative" }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  width="18"
                  height="18"
                >
                  <path d="M20 2v3h-2V3H6v2H4V2a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1zM4 7h16v10H4V7zm0 12h16v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1zM8 9v2h8V9H8zm0 4v2h5v-2H8z" />
                </svg>
                {changelogUnread > 0 && (
                  <span className="ttn-notif-badge">
                    {changelogUnread > 9 ? "9+" : changelogUnread}
                  </span>
                )}
              </Link>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              sideOffset={10}
              className="ttn-tooltip"
            >
              What&apos;s new
            </TooltipContent>
          </Tooltip>

          {/* Settings gear — only shown to admins (actor, not previewed persona) */}
          {isAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/admin/settings"
                  className={`ttn-rail-btn${pathname.startsWith("/admin") ? " active" : ""}`}
                >
                  {settingsIcon}
                </Link>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                sideOffset={10}
                className="ttn-tooltip"
              >
                Settings &mdash; firm configuration & admin
              </TooltipContent>
            </Tooltip>
          )}
        </nav>
        </TooltipProvider>

        {/* ── Tier 2: Context Panel ── */}
        <aside className="ttn-panel">
          <div className="ttn-panel-content-wrapper">
            {/* Dashboard Panel — per-persona via dispatcher */}
            <PersonaDashboardPanelWrapper
              active={visiblePanel === "dashboard"}
              casesCount={casesCount}
              subnavData={subnavData}
            />

            {/* Cases Panel */}
            <CasesPanel active={visiblePanel === "cases"} navData={navData} />

            {/* Messages Panel */}
            <MessagesPanel
              active={visiblePanel === "messages"}
              navData={navData}
            />

            {/* Leads Panel */}
            <LeadsPanel active={visiblePanel === "leads"} />

            {/* Queue Panel */}
            <QueuePanel active={visiblePanel === "queue"} navData={navData} />

            {/* Calendar Panel */}
            <CalendarPanel
              active={visiblePanel === "calendar"}
              navData={navData}
            />

            {/* Email Panel */}
            <EmailPanel active={visiblePanel === "email"} navData={navData} />

            {/* Contacts Panel */}
            <ContactsPanel
              active={visiblePanel === "contacts"}
              navData={navData}
            />

            {/* Documents Panel */}
            <DocumentsPanel
              active={visiblePanel === "documents"}
              navData={navData}
            />

            {/* Reports Panel */}
            <ReportsPanel
              active={visiblePanel === "reports"}
              navData={navData}
            />

            {/* Settings Panel */}
            <SettingsPanel
              active={visiblePanel === "settings"}
              pathname={pathname}
            />

            {/* Hearings Panel */}
            <HearingsPanel
              active={visiblePanel === "hearings"}
              navData={navData}
            />

            {/* Filing Panel */}
            <FilingPanel active={visiblePanel === "filing"} navData={navData} />

            {/* PHI Writer Panel */}
            <PhiWriterPanel
              active={visiblePanel === "phi-writer"}
              navData={navData}
            />

            {/* Medical Records Panel */}
            <MedicalRecordsPanel
              active={visiblePanel === "medical-records"}
              navData={navData}
            />

            {/* Mail Panel */}
            <MailPanel active={visiblePanel === "mail"} navData={navData} />

            {/* Billing Panel */}
            <BillingPanel
              active={visiblePanel === "billing"}
              navData={navData}
            />

            {/* Trust Panel */}
            <TrustPanel active={visiblePanel === "trust"} navData={navData} />

            {/* Team Chat Panel */}
            <TeamChatPanel
              active={visiblePanel === "team-chat"}
              navData={navData}
            />

            {/* Supervisor Panel */}
            <SupervisorPanel
              active={visiblePanel === "supervisor"}
              navData={navData}
            />

            {/* Coaching Panel */}
            <CoachingPanel
              active={visiblePanel === "coaching"}
              navData={navData}
            />

            {/* AI Drafts Panel */}
            <AiDraftsPanel
              active={visiblePanel === "drafts"}
              navData={navData}
            />

            {/* Changelog Panel */}
            <ChangelogPanel
              active={visiblePanel === "changelog"}
              commits={changelogCommits}
              onMarkViewed={() => setChangelogUnread(0)}
            />

            {/* Default panels for any remaining items without a custom panel */}
            {visibleRailItems
              .filter(
                (item) =>
                  ![
                    "dashboard",
                    "cases",
                    "messages",
                    "leads",
                    "queue",
                    "calendar",
                    "email",
                    "contacts",
                    "documents",
                    "reports",
                    "hearings",
                    "filing",
                    "phi-writer",
                    "medical-records",
                    "mail",
                    "billing",
                    "trust",
                    "team-chat",
                    "supervisor",
                    "coaching",
                    "drafts",
                  ].includes(item.id),
              )
              .map((item) => (
                <DefaultPanel
                  key={item.id}
                  active={visiblePanel === item.id}
                  label={item.label}
                  href={item.href}
                />
              ))}
          </div>

          {/* Footer */}
          <div className="ttn-panel-footer">
            <span className="ttn-panel-footer-badge">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                width="10"
                height="10"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              Favorble Pro
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ─── Panel Components ─── */

function formatRelativeTime(dateStr: string | Date): string {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "1d";
  return `${diffDay}d`;
}

function formatEventTime(dateStr: string | Date): string {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getInitials(str: string | null): string {
  if (!str) return "?";
  const parts = str.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return str.substring(0, 2).toUpperCase();
}

function getEventColor(eventType: string | null): string {
  switch (eventType) {
    case "hearing":
      return "#185f9b";
    case "deadline":
      return "#F59E0B";
    case "consultation":
      return "#3B82F6";
    case "meeting":
      return "#8B5CF6";
    default:
      return "#185f9b";
  }
}

/**
 * Wrapper that picks per-persona dashboard sub-nav when subnavData is provided,
 * otherwise falls back to the legacy hardcoded DashboardPanel. The wrapper
 * preserves the `active` class state Radix-style panel switching expects.
 */
function PersonaDashboardPanelWrapper({
  active,
  casesCount,
  subnavData,
}: {
  active: boolean;
  casesCount?: number;
  subnavData?: DashboardSubnavData;
}) {
  if (!subnavData) {
    return <DashboardPanel active={active} casesCount={casesCount} />;
  }
  // The dispatcher's SubnavShell already renders ttn-panel-content active;
  // wrap in a div that hides it when not active.
  return (
    <div style={{ display: active ? undefined : "none" }}>
      <PersonaDashboardSubnav data={subnavData} />
    </div>
  );
}

function DashboardPanel({
  active,
  casesCount,
}: {
  active: boolean;
  casesCount?: number;
}) {
  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Dashboard</div>

      <div className="ttn-section-label">Quick Actions</div>
      <div className="ttn-quick-actions">
        <Link href="/cases?action=new" className="ttn-quick-action-btn">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            width="16"
            height="16"
          >
            <path d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z" />
          </svg>
          <span>New Case</span>
        </Link>
        <Link href="/leads?action=new" className="ttn-quick-action-btn">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            width="16"
            height="16"
          >
            <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
          <span>New Lead</span>
        </Link>
        <Link href="/documents" className="ttn-quick-action-btn">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            width="16"
            height="16"
          >
            <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
          </svg>
          <span>Upload Doc</span>
        </Link>
        <Link href="/calendar" className="ttn-quick-action-btn">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            width="16"
            height="16"
          >
            <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z" />
          </svg>
          <span>Schedule</span>
        </Link>
      </div>

      <div className="ttn-section-label">Today&apos;s Numbers</div>
      <div className="ttn-today-number">
        <span>Active Cases</span>
        <span className="num">{casesCount ?? 0}</span>
      </div>
      <div className="ttn-today-number">
        <span>Tasks Due</span>
        <span className="num">3</span>
      </div>
      <div className="ttn-today-number">
        <span>Hearings</span>
        <span className="num">2</span>
      </div>

      <div className="ttn-section-label">Recent Activity</div>
      <div className="ttn-activity">
        {[
          {
            color: "green",
            title: "Martinez status changed to Hearing",
            meta: "12 min ago",
          },
          {
            color: "blue",
            title: "Doc uploaded for Thompson",
            meta: "1 hr ago",
          },
          {
            color: "amber",
            title: "Email from opposing counsel",
            meta: "2 hr ago",
          },
          {
            color: "purple",
            title: "Davis deposition scheduled",
            meta: "3 hr ago",
          },
          {
            color: "green",
            title: "Wilson inquiry converted to case",
            meta: "Yesterday",
          },
        ].map((item, i) => (
          <div key={i} className="ttn-activity-item">
            <span className={`ttn-activity-dot ${item.color}`} />
            <div className="ttn-activity-body">
              <div className="ttn-activity-title">{item.title}</div>
              <div className="ttn-activity-meta">{item.meta}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CasesPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const searchParams = useSearchParams();
  const activeStageId = searchParams.get("stage");
  const currentPathname = usePathname();
  const isCasesPage = currentPathname === "/cases";

  const fallbackStages = [
    { stageId: "intake", stageName: "Intake", count: 8 },
    { stageId: "application", stageName: "Application", count: 12 },
    { stageId: "recon", stageName: "Recon", count: 9 },
    { stageId: "hearing", stageName: "Hearing", count: 6 },
    { stageId: "resolution", stageName: "Resolution", count: 5 },
  ];

  const stages: Array<{ stageId: string; stageName: string; count: number }> =
    navData?.stageCounts?.length
      ? navData.stageCounts.map((sc) => ({
          stageId: sc.stageId ?? "",
          stageName: sc.stageName ?? "Unknown",
          count: sc.count,
        }))
      : fallbackStages;

  const totalCount = stages.reduce((sum, s) => sum + s.count, 0);
  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  const isAllActive = isCasesPage && !activeStageId;

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Cases</div>

      <div className="ttn-section-label">By Stage</div>

      {/* All Cases link */}
      <Link
        href="/cases"
        className="ttn-stage-item"
        style={{
          borderLeft: isAllActive
            ? "2px solid #185f9b"
            : "2px solid transparent",
          backgroundColor: isAllActive ? "#e6f1fa" : undefined,
          paddingLeft: 10,
        }}
      >
        <span
          className="ttn-stage-name"
          style={{
            color: isAllActive ? "#185f9b" : undefined,
            fontWeight: isAllActive ? 600 : undefined,
          }}
        >
          All Cases
        </span>
        <span
          className="ttn-stage-count"
          style={{
            color: isAllActive ? "#185f9b" : undefined,
            fontWeight: isAllActive ? 600 : undefined,
          }}
        >
          {totalCount}
        </span>
      </Link>

      {stages.map((stage) => {
        const isStageActive = isCasesPage && activeStageId === stage.stageId;
        return (
          <Link
            href={isStageActive ? "/cases" : `/cases?stage=${stage.stageId}`}
            key={stage.stageId}
            className="ttn-stage-item"
            style={{
              borderLeft: isStageActive
                ? "2px solid #185f9b"
                : "2px solid transparent",
              backgroundColor: isStageActive ? "#e6f1fa" : undefined,
              paddingLeft: 10,
            }}
          >
            <span
              className="ttn-stage-name"
              style={{
                color: isStageActive ? "#185f9b" : undefined,
                fontWeight: isStageActive ? 600 : undefined,
              }}
            >
              {stage.stageName}
            </span>
            <div className="ttn-stage-bar-track">
              <div
                className="ttn-stage-bar-fill"
                style={{
                  width: `${(stage.count / maxCount) * 100}%`,
                }}
              />
            </div>
            <span
              className="ttn-stage-count"
              style={{
                color: isStageActive ? "#185f9b" : undefined,
                fontWeight: isStageActive ? 600 : undefined,
              }}
            >
              {stage.count}
            </span>
          </Link>
        );
      })}

      <div className="ttn-pinned-label">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none"
          width="10"
          height="10"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        Starred Cases
      </div>
      <div style={{ padding: "6px 12px", fontSize: 11, color: "#999" }}>
        Starred cases coming soon
      </div>
    </div>
  );
}

function MessagesPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const msgs = navData?.messageSummary;
  const unreadCount = msgs?.unreadCount ?? 0;

  const fallbackMessages = [
    {
      initials: "SM",
      unread: true,
      subject: "Martinez Case Update",
      snippet: "Re: Updated medical records received from...",
      time: "12m",
    },
    {
      initials: "JD",
      unread: true,
      subject: "Thompson Hearing Date",
      snippet: "The ALJ has scheduled the hearing for...",
      time: "2h",
    },
    {
      initials: "KL",
      unread: false,
      subject: "Chen Document Review",
      snippet: "Please review the attached brief when...",
      time: "1d",
    },
  ];

  const recentMessages =
    msgs?.recentMessages && msgs.recentMessages.length > 0
      ? msgs.recentMessages.slice(0, 3).map((m) => ({
          id: m.id,
          initials: getInitials(m.fromAddress),
          unread: m.direction === "inbound",
          subject: m.subject ?? "(no subject)",
          snippet: m.body ? m.body.substring(0, 60) + "..." : "",
          time: formatRelativeTime(m.createdAt),
          caseId: m.caseId,
          caseNumber: m.caseNumber,
        }))
      : null;

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Messages</div>

      <div className="ttn-section-label">Folders</div>
      <Link href="/messages" className="ttn-msg-folder active">
        <span>Inbox</span>
        {unreadCount > 0 && (
          <span className="ttn-folder-count">{unreadCount}</span>
        )}
      </Link>

      <div className="ttn-section-label" style={{ marginTop: 16 }}>
        Recent
      </div>
      {(recentMessages ?? fallbackMessages).map((msg, i) => {
        const msgId = "id" in msg ? (msg as { id: string }).id : null;
        const caseId =
          "caseId" in msg ? (msg as { caseId: string | null }).caseId : null;
        const caseNumber =
          "caseNumber" in msg
            ? (msg as { caseNumber: string | null }).caseNumber
            : null;
        return (
          <div key={msgId ?? i}>
            <Link
              href={msgId ? `/messages?highlight=${msgId}` : "/messages"}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="ttn-msg-preview">
                <div className={`ttn-msg-avatar${msg.unread ? " unread" : ""}`}>
                  {msg.initials}
                </div>
                <div className="ttn-msg-body">
                  <div
                    className={`ttn-msg-subject${msg.unread ? " unread" : ""}`}
                  >
                    {msg.subject}
                  </div>
                  <div className="ttn-msg-snippet">{msg.snippet}</div>
                </div>
                <span className="ttn-msg-time">{msg.time}</span>
              </div>
            </Link>
            {caseId && caseNumber && (
              <Link
                href={`/cases/${caseId}`}
                className="ttn-msg-case-link"
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "#666",
                  paddingLeft: 44,
                  marginTop: -4,
                  marginBottom: 4,
                  textDecoration: "none",
                }}
              >
                Case #{caseNumber}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SettingsPanel({
  active,
  pathname,
}: {
  active: boolean;
  pathname: string;
}) {
  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Settings</div>

      {settingsNav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`ttn-panel-item${pathname === item.href || pathname.startsWith(item.href + "/") ? " active" : ""}`}
          style={{ alignItems: "flex-start", paddingTop: 8, paddingBottom: 8 }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
              minWidth: 0,
            }}
          >
            <span>{item.label}</span>
            <span
              style={{
                fontSize: 11,
                color: "#9CA3AF",
                fontWeight: 400,
                lineHeight: 1.3,
              }}
            >
              {item.description}
            </span>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            width="14"
            height="14"
            style={{ opacity: 0.4, flexShrink: 0, marginTop: 2 }}
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        </Link>
      ))}
    </div>
  );
}

function LeadsPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const STAGE_COLORS: Record<string, string> = {
    new: "#1d72b8",
    contacted: "#3B82F6",
    intake_in_progress: "#F59E0B",
    contract_sent: "#8B5CF6",
    contract_signed: "#185f9b",
  };
  const PIPELINE_ORDER = [
    "new",
    "contacted",
    "intake_in_progress",
    "contract_sent",
    "contract_signed",
  ];
  const LABEL_MAP: Record<string, string> = {
    new: "New",
    contacted: "Contacted",
    intake_in_progress: "Intake",
    contract_sent: "Contract Sent",
    contract_signed: "Signed",
  };
  let pipelineStages: Array<{ status: string; label: string; count: number }>;
  if (navData?.leadCounts?.length) {
    const countMap: Record<string, number> = {};
    for (const lc of navData.leadCounts) {
      countMap[lc.status] = lc.count;
    }
    pipelineStages = PIPELINE_ORDER.map((status) => ({
      status,
      label: LABEL_MAP[status] ?? status,
      count: countMap[status] ?? 0,
    }));
  } else {
    pipelineStages = PIPELINE_ORDER.map((status) => ({
      status,
      label: LABEL_MAP[status] ?? status,
      count: 0,
    }));
  }
  const maxCount = Math.max(...pipelineStages.map((s) => s.count), 1);
  const totalLeads = pipelineStages.reduce((sum, s) => sum + s.count, 0);
  const signedCount =
    pipelineStages.find((s) => s.status === "contract_signed")?.count ?? 0;
  const conversionRate =
    totalLeads > 0 ? Math.round((signedCount / totalLeads) * 100) : 0;

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Leads</div>

      <div className="ttn-section-label">Pipeline</div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 0,
          padding: "0 12px",
        }}
      >
        {pipelineStages.map((stage, i) => (
          <React.Fragment key={stage.status}>
            <Link
              href={`/leads?status=${stage.status}`}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "6px 0",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: STAGE_COLORS[stage.status] ?? "#999",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, color: "#1C1C1E", flex: 1 }}>
                  {stage.label}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "monospace",
                    color: "#185f9b",
                    border: "1px solid #185f9b",
                    borderRadius: 9,
                    padding: "0 6px",
                    lineHeight: "18px",
                  }}
                >
                  {stage.count}
                </span>
              </div>
              <div
                style={{
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: "#F0F0F0",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(stage.count / maxCount) * 100}%`,
                    backgroundColor: STAGE_COLORS[stage.status] ?? "#999",
                    borderRadius: 2,
                  }}
                />
              </div>
            </Link>
            {i < pipelineStages.length - 1 && (
              <div
                style={{
                  textAlign: "center",
                  color: "#999",
                  fontSize: 11,
                  lineHeight: "14px",
                }}
              >
                &darr;
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      <div
        style={{
          fontSize: 11,
          fontFamily: "monospace",
          color: "#999",
          padding: "10px 12px 0",
        }}
      >
        {conversionRate}% conversion
      </div>

      <div style={{ padding: "12px 12px 0" }}>
        <Link
          href="/leads"
          style={{
            fontSize: 12,
            color: "#185f9b",
            textDecoration: "none",
          }}
        >
          View pipeline &rarr;
        </Link>
      </div>
    </div>
  );
}

function QueuePanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const fallbackTasks = [
    {
      id: "1",
      title: "Follow up with Martinez on medical records",
      due: "Today",
      overdue: true,
    },
    {
      id: "2",
      title: "File Thompson motion to compel",
      due: "Today",
      overdue: true,
    },
    {
      id: "3",
      title: "Review Chen deposition transcript",
      due: "Yesterday",
      overdue: true,
    },
    {
      id: "4",
      title: "Draft Wilson intake summary",
      due: "Mar 30",
      overdue: false,
    },
    {
      id: "5",
      title: "Schedule Davis hearing prep call",
      due: "Mar 31",
      overdue: false,
    },
  ];

  const taskSummary = navData?.taskSummary;
  const totalTasks = taskSummary?.total ?? 12;
  const overdueCount = taskSummary?.overdue ?? 3;

  function formatTaskDue(dueDate: Date | null): {
    label: string;
    isOverdue: boolean;
  } {
    if (!dueDate) return { label: "No date", isOverdue: false };
    const due = new Date(dueDate);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (due < now) return { label: "Overdue", isOverdue: true };
    if (due < tomorrow) return { label: "Today", isOverdue: false };
    const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    if (diff === 1) return { label: "Tomorrow", isOverdue: false };
    return {
      label: due.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      isOverdue: false,
    };
  }

  const displayTasks: Array<{
    id: string;
    title: string;
    due: string;
    overdue: boolean;
  }> = taskSummary?.topTasks?.length
    ? taskSummary.topTasks.map((t) => {
        const dueInfo = formatTaskDue(t.dueDate);
        return {
          id: t.id,
          title: t.title,
          due: dueInfo.label,
          overdue: dueInfo.isOverdue,
        };
      })
    : fallbackTasks;

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">My Queue</div>

      <div
        style={{
          fontSize: 11,
          color: "#999",
          padding: "0 12px 8px",
        }}
      >
        {totalTasks} task{totalTasks !== 1 ? "s" : ""} &middot;{" "}
        {overdueCount > 0 ? (
          <Link
            href="/queue?tab=overdue"
            style={{ color: "#EE0000", textDecoration: "none" }}
          >
            {overdueCount} overdue
          </Link>
        ) : (
          <span>0 overdue</span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {displayTasks.map((task, i) => (
          <Link
            key={task.id}
            href={`/queue?task=${task.id}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "8px 12px",
              borderBottom:
                i < displayTasks.length - 1 ? "1px solid #F0F0F0" : "none",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                border: "1px solid #E5E7EB",
                flexShrink: 0,
                marginTop: 1,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  color: "#1C1C1E",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {task.title}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: task.overdue ? "#EE0000" : "#999",
                  marginTop: 2,
                }}
              >
                {task.due}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ padding: "12px 12px 0" }}>
        <Link
          href="/queue"
          style={{
            fontSize: 12,
            color: "#185f9b",
            textDecoration: "none",
          }}
        >
          View all tasks &rarr;
        </Link>
      </div>
    </div>
  );
}

function CalendarPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const now = new Date();
  const monthYear = now
    .toLocaleDateString("en-US", { month: "long", year: "numeric" })
    .toUpperCase();

  const today = now.getDate();
  const dayOfWeek = now.getDay();
  const weekDays: {
    label: string;
    date: number;
    isToday: boolean;
    fullDate: string;
  }[] = [];
  for (let i = 0; i < 7; i++) {
    const diff = i - dayOfWeek;
    const d = new Date(now);
    d.setDate(today + diff);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    weekDays.push({
      label: ["S", "M", "T", "W", "T", "F", "S"][i],
      date: d.getDate(),
      isToday: d.getDate() === today && d.getMonth() === now.getMonth(),
      fullDate: `${yyyy}-${mm}-${dd}`,
    });
  }

  const todayEvents = navData?.todayEvents;
  const hasEvents = todayEvents && todayEvents.length > 0;
  const eventCount = todayEvents?.length ?? 0;
  const MAX_DISPLAY_EVENTS = 5;

  const fallbackEvents = [
    {
      time: "10:00 AM",
      title: "Martinez Hearing",
      type: "Hearing",
      color: "#185f9b",
      href: "/calendar",
      caseName: null as string | null,
    },
    {
      time: "1:30 PM",
      title: "Thompson Filing Deadline",
      type: "Deadline",
      color: "#F59E0B",
      href: "/calendar",
      caseName: null as string | null,
    },
    {
      time: "3:00 PM",
      title: "Chen Status Conference",
      type: "Hearing",
      color: "#185f9b",
      href: "/calendar",
      caseName: null as string | null,
    },
  ];

  const events = hasEvents
    ? todayEvents.slice(0, MAX_DISPLAY_EVENTS).map((e) => ({
        id: e.id,
        time: formatEventTime(e.startTime),
        title: e.title,
        type: e.eventType ?? "Event",
        color: getEventColor(e.eventType),
        href: e.caseId ? `/cases/${e.caseId}/calendar` : "/calendar",
        caseName: e.caseNumber ? `Case #${e.caseNumber}` : null,
      }))
    : null;

  const remainingEvents =
    eventCount > MAX_DISPLAY_EVENTS ? eventCount - MAX_DISPLAY_EVENTS : 0;

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div className="ttn-panel-header">Calendar</div>
        <Link
          href="/calendar?action=new"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: "50%",
            backgroundColor: "#e6f1fa",
            color: "#185f9b",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
            lineHeight: 1,
            marginRight: 12,
            marginTop: 12,
          }}
          title="New event"
        >
          +
        </Link>
      </div>

      <div style={{ padding: "0 12px 8px" }}>
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            color: "#999",
            marginBottom: 8,
            letterSpacing: "0.5px",
          }}
        >
          {monthYear}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {weekDays.map((day, i) => (
            <Link
              key={i}
              href={`/calendar?date=${day.fullDate}`}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                textDecoration: "none",
                position: "relative",
              }}
            >
              <span style={{ fontSize: 9, color: "#999" }}>{day.label}</span>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: day.isToday ? 600 : 400,
                  backgroundColor: day.isToday ? "#185f9b" : "transparent",
                  color: day.isToday ? "#fff" : "#999",
                }}
              >
                {day.date}
              </div>
              {day.isToday && hasEvents && (
                <span
                  style={{
                    position: "absolute",
                    bottom: -2,
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    backgroundColor: "#185f9b",
                  }}
                />
              )}
            </Link>
          ))}
        </div>
      </div>

      <div className="ttn-section-label">Today&apos;s Events</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {navData && !hasEvents && (
          <div style={{ padding: "8px 12px", fontSize: 12, color: "#999" }}>
            No events today &#8212; enjoy the breather
          </div>
        )}
        {(events ?? fallbackEvents).map((event, i) => (
          <Link
            key={"id" in event ? (event as { id: string }).id : i}
            href={event.href}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "8px 10px",
                borderLeft: `3px solid ${event.color}`,
                marginBottom: 2,
                minWidth: 0,
              }}
            >
              {/* Time — full-width row on top */}
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "#999",
                  fontWeight: 600,
                }}
              >
                {event.time}
              </div>
              {/* Title — full width, wraps if long */}
              <div
                style={{
                  fontSize: 12,
                  color: "#1C1C1E",
                  lineHeight: 1.35,
                }}
              >
                {event.title}
              </div>
              {/* Meta — case + type badge on one compact row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 2,
                  minWidth: 0,
                }}
              >
                {event.caseName && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "#999",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {event.caseName}
                  </span>
                )}
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 9,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    border: `1px solid ${event.color}`,
                    color: event.color,
                    borderRadius: 3,
                    padding: "0 4px",
                    lineHeight: "16px",
                    marginLeft: event.caseName ? "auto" : 0,
                    flexShrink: 0,
                  }}
                >
                  {event.type}
                </span>
              </div>
            </div>
          </Link>
        ))}
        {remainingEvents > 0 && (
          <Link
            href="/calendar"
            style={{
              padding: "6px 12px",
              fontSize: 11,
              color: "#999",
              textDecoration: "none",
            }}
          >
            and {remainingEvents} more event{remainingEvents === 1 ? "" : "s"}
          </Link>
        )}
      </div>

      <div style={{ padding: "12px 12px 0" }}>
        <Link
          href="/calendar"
          style={{
            fontSize: 12,
            color: "#185f9b",
            textDecoration: "none",
          }}
        >
          View calendar →
        </Link>
      </div>
    </div>
  );
}

function EmailPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const [activeTab, setActiveTab] = useState<"matched" | "unmatched">(
    "matched",
  );
  const emailData = navData?.emailSummary;
  const connected = emailData?.isOutlookConfigured ?? false;
  const unmatchedCount = emailData?.unmatchedCount ?? 0;

  const fallbackEmails = [
    {
      id: "fb-1",
      initials: "JM",
      subject: "RE: Medical records request for Martinez",
      caseLink: "HS-2026-1015" as string | null,
      caseId: null as string | null,
      time: "9:14 AM",
    },
    {
      id: "fb-2",
      initials: "KT",
      subject: "Thompson hearing confirmation from ALJ",
      caseLink: "HS-2026-0987" as string | null,
      caseId: null as string | null,
      time: "8:42 AM",
    },
    {
      id: "fb-3",
      initials: "LD",
      subject: "Davis CE appointment scheduling",
      caseLink: "HS-2026-1102" as string | null,
      caseId: null as string | null,
      time: "Yesterday",
    },
    {
      id: "fb-4",
      initials: "RW",
      subject: "Wilson intake documents received",
      caseLink: "HS-2026-1098" as string | null,
      caseId: null as string | null,
      time: "Yesterday",
    },
  ];

  const realEmails =
    emailData?.recentEmails && emailData.recentEmails.length > 0
      ? emailData.recentEmails.slice(0, 4).map((e) => ({
          id: e.id,
          initials: getInitials(e.fromAddress),
          subject: e.subject ?? "(no subject)",
          caseLink: e.caseNumber ?? null,
          caseId: e.caseId,
          time: formatRelativeTime(e.createdAt),
        }))
      : null;

  const displayEmails = realEmails ?? fallbackEmails;

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Email</div>

      {/* Connection status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 12px 8px",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: connected ? "#1d72b8" : "#9CA3AF",
            flexShrink: 0,
          }}
        />
        <span
          style={{ fontSize: 11, color: connected ? "#1d72b8" : "#9CA3AF" }}
        >
          {connected ? "Outlook Connected" : "Not Connected"}
        </span>
      </div>

      {/* Tabs: Matched / Unmatched */}
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: "0 12px 8px",
          borderBottom: "1px solid #F0F0F0",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("matched")}
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: activeTab === "matched" ? "#1C1C1E" : "#999",
            background: "none",
            border: "none",
            borderBottom:
              activeTab === "matched"
                ? "2px solid #1d72b8"
                : "2px solid transparent",
            padding: "4px 0",
            cursor: "pointer",
          }}
        >
          Matched
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("unmatched")}
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: activeTab === "unmatched" ? "#1C1C1E" : "#999",
            background: "none",
            border: "none",
            borderBottom:
              activeTab === "unmatched"
                ? "2px solid #1d72b8"
                : "2px solid transparent",
            padding: "4px 0",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          Unmatched
          {unmatchedCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 700,
                color: "#fff",
                backgroundColor: "#DC2626",
                borderRadius: "50%",
                minWidth: 16,
                height: 16,
                padding: "0 3px",
                lineHeight: 1,
              }}
            >
              {unmatchedCount > 99 ? "99+" : unmatchedCount}
            </span>
          )}
        </button>
      </div>

      {/* Email list */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {activeTab === "matched" &&
          displayEmails.map((email, i) => (
            <Link
              key={email.id}
              href={`/email?highlight=${email.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "8px 12px",
                  borderBottom:
                    i < displayEmails.length - 1 ? "1px solid #F0F0F0" : "none",
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    backgroundColor: "#E5E7EB",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8,
                    fontWeight: 600,
                    color: "#374151",
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {email.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#1C1C1E",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {email.subject}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 2,
                    }}
                  >
                    {email.caseLink && (
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: "monospace",
                          color: "#999",
                        }}
                      >
                        {email.caseId ? (
                          <span
                            role="link"
                            tabIndex={0}
                            style={{
                              color: "#185f9b",
                              textDecoration: "none",
                              cursor: "pointer",
                            }}
                            onClick={(ev) => {
                              ev.preventDefault();
                              ev.stopPropagation();
                              window.location.href = `/cases/${email.caseId}`;
                            }}
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter") {
                                ev.preventDefault();
                                ev.stopPropagation();
                                window.location.href = `/cases/${email.caseId}`;
                              }
                            }}
                          >
                            &rarr; {email.caseLink}
                          </span>
                        ) : (
                          <>&rarr; {email.caseLink}</>
                        )}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "monospace",
                        color: "#999",
                      }}
                    >
                      {email.time}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        {activeTab === "unmatched" && (
          <div style={{ padding: "12px" }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
              {unmatchedCount > 0
                ? `${unmatchedCount} email${unmatchedCount === 1 ? "" : "s"} need case matching`
                : "No unmatched emails"}
            </div>
            {unmatchedCount > 0 && (
              <Link
                href="/email?filter=unmatched"
                style={{
                  fontSize: 12,
                  color: "#185f9b",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                Review unmatched &rarr;
              </Link>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: "12px 12px 0" }}>
        <Link
          href={
            activeTab === "unmatched" ? "/email?filter=unmatched" : "/email"
          }
          style={{
            fontSize: 12,
            color: "#185f9b",
            textDecoration: "none",
          }}
        >
          View all email &rarr;
        </Link>
      </div>
    </div>
  );
}

function ContactsPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const router = useRouter();
  const typeMap: Record<string, string> = {
    All: "",
    Claimants: "claimant",
    Providers: "medical_provider",
    Attorneys: "attorney",
    SSA: "ssa_office",
    Experts: "expert",
  };
  const TYPE_LABELS: Record<string, string> = {
    claimant: "Claimant",
    medical_provider: "Provider",
    attorney: "Attorney",
    ssa_office: "SSA",
    expert: "Expert",
  };
  const [activeFilter, setActiveFilter] = useState("All");
  const filters = [
    "All",
    "Claimants",
    "Providers",
    "Attorneys",
    "SSA",
    "Experts",
  ];

  const fallbackContacts = [
    {
      id: "",
      initials: "RM",
      name: "Rosa Martinez",
      type: "claimant",
      email: null as string | null,
      phone: null as string | null,
    },
    {
      id: "",
      initials: "DT",
      name: "Dr. David Thompson",
      type: "medical_provider",
      email: null as string | null,
      phone: null as string | null,
    },
    {
      id: "",
      initials: "SC",
      name: "Sarah Chen, Esq.",
      type: "attorney",
      email: null as string | null,
      phone: null as string | null,
    },
    {
      id: "",
      initials: "JW",
      name: "James Wilson",
      type: "claimant",
      email: null as string | null,
      phone: null as string | null,
    },
    {
      id: "",
      initials: "KP",
      name: "Karen Phillips",
      type: "ssa_office",
      email: null as string | null,
      phone: null as string | null,
    },
  ];

  const recentContacts = navData?.contactSummary?.recentContacts;
  const allContacts =
    recentContacts && recentContacts.length > 0
      ? recentContacts.map((c) => ({
          id: c.id,
          initials: getInitials(`${c.firstName} ${c.lastName}`),
          name: `${c.firstName} ${c.lastName}`,
          type: c.contactType,
          email: c.email,
          phone: c.phone,
        }))
      : fallbackContacts;

  const filterTypeValue = typeMap[activeFilter] ?? "";
  const displayContacts = filterTypeValue
    ? allContacts.filter((c) => c.type === filterTypeValue)
    : allContacts;

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Contacts</div>

      {/* Type filter pills */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          padding: "0 12px 8px",
        }}
      >
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => {
              setActiveFilter(filter);
              const typeValue = typeMap[filter];
              router.push(
                typeValue ? `/contacts?type=${typeValue}` : "/contacts",
              );
            }}
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: activeFilter === filter ? "#185f9b" : "#999",
              backgroundColor:
                activeFilter === filter ? "#e6f1fa" : "transparent",
              border: "none",
              borderRadius: 9,
              padding: "2px 8px",
              cursor: "pointer",
              lineHeight: "18px",
            }}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Contact list */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {displayContacts.length === 0 && (
          <div style={{ padding: "12px", fontSize: 12, color: "#999" }}>
            No {activeFilter.toLowerCase()} contacts found
          </div>
        )}
        {displayContacts.map((contact, i) => {
          const secondaryInfo = contact.email || contact.phone || null;
          const contactLink = contact.id
            ? `/contacts/${contact.id}`
            : "/contacts";
          return (
            <Link
              key={contact.id || i}
              href={contactLink}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderBottom:
                    i < displayContacts.length - 1
                      ? "1px solid #F0F0F0"
                      : "none",
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    backgroundColor: "#E5E7EB",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8,
                    fontWeight: 700,
                    color: "#374151",
                    flexShrink: 0,
                  }}
                >
                  {contact.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#1C1C1E" }}>
                    {contact.name}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 1,
                    }}
                  >
                    <span style={{ fontSize: 10, color: "#999" }}>
                      {TYPE_LABELS[contact.type] ?? contact.type}
                    </span>
                  </div>
                  {secondaryInfo && (
                    <div
                      style={{
                        fontSize: 10,
                        color: "#999",
                        marginTop: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {secondaryInfo}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer links */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 12px 0",
        }}
      >
        <Link
          href="/contacts?action=new"
          style={{
            fontSize: 12,
            color: "#185f9b",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Add contact
        </Link>
        <Link
          href="/contacts"
          style={{
            fontSize: 12,
            color: "#185f9b",
            textDecoration: "none",
          }}
        >
          View all &rarr;
        </Link>
      </div>
    </div>
  );
}

function DocumentsPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const docData = navData?.documentSummary;

  const sources = [
    { key: "upload", label: "Uploaded" },
    { key: "ere", label: "ERE" },
    { key: "chronicle", label: "Chronicle" },
    { key: "template", label: "Template" },
    { key: "case_status", label: "Case Status" },
    { key: "email", label: "Email" },
    { key: "esignature", label: "eSignature" },
  ];

  const recentUploads = (docData?.recentUploads ?? []).map((u) => ({
    id: u.id,
    name: u.fileName,
    type: u.fileType?.includes("pdf")
      ? "pdf"
      : u.fileType?.includes("doc")
        ? "doc"
        : u.fileType?.includes("xls")
          ? "xls"
          : "other",
    time: formatRelativeTime(u.createdAt),
    caseNumber: u.caseNumber ?? null,
  }));
  if (recentUploads.length === 0) {
    recentUploads.push(
      {
        id: "fallback-1",
        name: "Martinez_MedRecords.pdf",
        type: "pdf",
        time: "2h ago",
        caseNumber: "HS-2026-1015",
      },
      {
        id: "fallback-2",
        name: "Thompson_Decision.docx",
        type: "doc",
        time: "5h ago",
        caseNumber: null,
      },
      {
        id: "fallback-3",
        name: "Chen_Billing.xlsx",
        type: "xls",
        time: "1d ago",
        caseNumber: null,
      },
    );
  }

  const fileTypeColors: Record<string, string> = {
    pdf: "#EF4444",
    doc: "#3B82F6",
    xls: "#1d72b8",
  };

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Documents</div>

      {/* Stats bar */}
      <div style={{ fontSize: 11, color: "#999", padding: "0 12px 8px" }}>
        {docData?.total ?? 0} documents
      </div>

      {/* Source filters */}
      <div className="ttn-section-label">By Source</div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 1,
          padding: "0 8px",
        }}
      >
        {sources.map((src) => {
          const count = docData?.bySourceCount?.[src.key] ?? 0;
          if (count === 0 && !docData) return null;
          return (
            <Link
              key={src.key}
              href={`/documents?source=${src.key}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "5px 8px",
                borderRadius: 6,
                cursor: "pointer",
                textDecoration: "none",
                color: "inherit",
                transition: "background 0.12s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#F0F0F0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <span style={{ fontSize: 12, color: "#555" }}>{src.label}</span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "'Geist Mono', monospace",
                  color: "#999",
                }}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Recent uploads */}
      <div className="ttn-section-label" style={{ marginTop: 12 }}>
        Recent Uploads
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          padding: "0 8px",
        }}
      >
        {recentUploads.map((file) => (
          <Link
            key={file.id}
            href={`/documents?highlight=${file.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 8px",
              borderRadius: 6,
              cursor: "pointer",
              textDecoration: "none",
              color: "inherit",
              transition: "background 0.12s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#F0F0F0";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {/* File type icon (colored square) */}
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: fileTypeColors[file.type] ?? "#999",
                flexShrink: 0,
              }}
            />
            <div
              style={{
                flex: 1,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "#1C1C1E",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {file.name}
              </div>
              {file.caseNumber && (
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
                    color: "#999",
                    marginTop: 1,
                  }}
                >
                  {file.caseNumber} &middot; {file.time}
                </div>
              )}
            </div>
            {!file.caseNumber && (
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
                  color: "#999",
                  flexShrink: 0,
                }}
              >
                {file.time}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Footer links */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "12px 12px 0",
        }}
      >
        <Link
          href="/documents"
          style={{
            fontSize: 12,
            color: "#185f9b",
            textDecoration: "none",
          }}
        >
          Upload document
        </Link>
        <Link
          href="/documents"
          style={{
            fontSize: 12,
            color: "#185f9b",
            textDecoration: "none",
          }}
        >
          View all &rarr;
        </Link>
      </div>
    </div>
  );
}

function ReportsPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const reportTypes = [
    {
      name: "Cases by Stage",
      slug: "cases-by-stage",
      icon: (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          style={{ flexShrink: 0 }}
        >
          <rect x="1" y="8" width="3" height="5" rx="0.5" fill="#185f9b" />
          <rect x="5.5" y="5" width="3" height="8" rx="0.5" fill="#185f9b" />
          <rect x="10" y="2" width="3" height="11" rx="0.5" fill="#185f9b" />
        </svg>
      ),
    },
    {
      name: "Team Performance",
      slug: "team-member",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="#185f9b"
          width="14"
          height="14"
          style={{ flexShrink: 0 }}
        >
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      ),
    },
    {
      name: "Messaging",
      slug: "messaging",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="#185f9b"
          width="14"
          height="14"
          style={{ flexShrink: 0 }}
        >
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
        </svg>
      ),
    },
    {
      name: "Time in Stage",
      slug: "time-in-stage",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="#185f9b"
          width="14"
          height="14"
          style={{ flexShrink: 0 }}
        >
          <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
        </svg>
      ),
    },
    {
      name: "Case Trends",
      slug: "cases-over-time",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="#185f9b"
          width="14"
          height="14"
          style={{ flexShrink: 0 }}
        >
          <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z" />
        </svg>
      ),
    },
    {
      name: "Pipeline Funnel",
      slug: "pipeline-funnel",
      icon: (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="#185f9b"
          style={{ flexShrink: 0 }}
        >
          <path d="M1 1h12L9 6v5l-4 2V6L1 1z" />
        </svg>
      ),
    },
    {
      name: "Task Completion",
      slug: "task-completion",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="#185f9b"
          width="14"
          height="14"
          style={{ flexShrink: 0 }}
        >
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
      ),
    },
    {
      name: "ROI",
      slug: "roi",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="#185f9b"
          width="14"
          height="14"
          style={{ flexShrink: 0 }}
        >
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93V18h-2v1.93A7.996 7.996 0 0 1 4.07 13H6v-2H4.07A7.996 7.996 0 0 1 11 4.07V6h2V4.07A7.996 7.996 0 0 1 19.93 11H18v2h1.93A7.996 7.996 0 0 1 13 19.93zM15.5 11h-3V8h-1v3H8l4 4 4-4h-.5z" />
        </svg>
      ),
    },
    {
      name: "Staff Usage",
      slug: "staff-usage",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="#185f9b"
          width="14"
          height="14"
          style={{ flexShrink: 0 }}
        >
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      ),
    },
    {
      name: "Client Usage",
      slug: "client-usage",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="#185f9b"
          width="14"
          height="14"
          style={{ flexShrink: 0 }}
        >
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      ),
    },
    {
      name: "Google Reviews",
      slug: "reviews",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="#185f9b"
          width="14"
          height="14"
          style={{ flexShrink: 0 }}
        >
          <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      ),
    },
    {
      name: "NPS",
      slug: "nps",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="#185f9b"
          width="14"
          height="14"
          style={{ flexShrink: 0 }}
        >
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
        </svg>
      ),
    },
  ];

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Reports</div>

      {/* Report type list */}
      <div className="ttn-section-label">Available Reports</div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 1,
          padding: "0 8px",
        }}
      >
        {reportTypes.map((report) => (
          <Link
            key={report.slug}
            href={`/reports/${report.slug}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              borderRadius: 6,
              cursor: "pointer",
              textDecoration: "none",
              transition: "background 0.12s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#F0F0F0";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {report.icon}
            <span style={{ fontSize: 12, color: "#555", flex: 1 }}>
              {report.name}
            </span>
            <span style={{ fontSize: 12, color: "#CCC" }}>&rarr;</span>
          </Link>
        ))}
      </div>

      {/* Quick stats -- live data from navData */}
      <ReportsQuickStats navData={navData} />

      {/* Footer link */}
      <div style={{ padding: "12px 12px 0" }}>
        <Link
          href="/reports"
          style={{
            fontSize: 12,
            color: "#185f9b",
            textDecoration: "none",
          }}
        >
          View dashboard &rarr;
        </Link>
      </div>
    </div>
  );
}

function ReportsQuickStats({ navData }: { navData?: NavPanelData }) {
  const activeCases = navData?.stageCounts
    ? navData.stageCounts.reduce((sum, s) => sum + s.count, 0)
    : null;
  const totalLeads = navData?.leadCounts
    ? navData.leadCounts.reduce((sum, l) => sum + l.count, 0)
    : null;
  const signedLeads = navData?.leadCounts
    ? navData.leadCounts
        .filter((l) => l.status === "contract_signed")
        .reduce((sum, l) => sum + l.count, 0)
    : null;
  const conversionRate =
    totalLeads != null && totalLeads > 0 && signedLeads != null
      ? Math.round((signedLeads / totalLeads) * 100)
      : null;
  const openTasks = navData?.taskSummary ? navData.taskSummary.total : null;

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    textTransform: "uppercase",
    color: "#999",
    letterSpacing: "0.03em",
    marginBottom: 2,
  };
  const valueStyle: React.CSSProperties = {
    fontSize: 16,
    fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
    fontWeight: 600,
    color: "#1C1C1E",
  };
  const boxStyle: React.CSSProperties = {
    textAlign: "center",
    flex: 1,
    padding: "6px 4px",
    borderRadius: 6,
    border: "1px solid transparent",
    textDecoration: "none",
    transition: "border-color 0.15s ease",
    cursor: "pointer",
    display: "block",
  };
  const onEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.borderColor = "#D1D5DB";
  };
  const onLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.borderColor = "transparent";
  };

  return (
    <>
      <div className="ttn-section-label" style={{ marginTop: 12 }}>
        Quick Stats
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "0 12px",
          gap: 8,
        }}
      >
        <Link
          href="/reports/win-rates"
          style={boxStyle}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          <div style={labelStyle}>Conversion</div>
          <div style={{ ...valueStyle, color: "#185f9b" }}>
            {conversionRate != null ? `${conversionRate}%` : "--"}
          </div>
        </Link>
        <Link
          href="/cases"
          style={boxStyle}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          <div style={labelStyle}>Active Cases</div>
          <div style={valueStyle}>
            {activeCases != null ? activeCases : "--"}
          </div>
        </Link>
        <Link
          href="/queue"
          style={boxStyle}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          <div style={labelStyle}>Open Tasks</div>
          <div style={valueStyle}>{openTasks != null ? openTasks : "--"}</div>
        </Link>
      </div>
    </>
  );
}

/* ─── Shared panel primitives for the new counter-driven panels ─── */

const panelCounterRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 12px",
  borderBottom: "1px solid #F0F0F0",
  textDecoration: "none",
  color: "inherit",
  fontSize: 12,
};

const panelCounterLabelStyle: React.CSSProperties = {
  color: "#1C1C1E",
};

const panelCounterValueStyle: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: 12,
  color: "#185f9b",
  fontWeight: 600,
};

const panelSubHeaderStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#999",
  padding: "10px 12px 4px",
};

const panelFooterLinkStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#185f9b",
  textDecoration: "none",
};

function PanelCounterRow({
  href,
  label,
  value,
  tone = "default",
  sublabel,
}: {
  href: string;
  label: string;
  value: number | string;
  tone?: "default" | "urgent" | "success" | "warn";
  sublabel?: string;
}) {
  const toneColor =
    tone === "urgent"
      ? "#EE0000"
      : tone === "warn"
        ? "#F59E0B"
        : tone === "success"
          ? "#1d72b8"
          : "#185f9b";
  return (
    <Link href={href} style={panelCounterRowStyle}>
      <span style={panelCounterLabelStyle}>
        {label}
        {sublabel && (
          <span
            style={{
              display: "block",
              fontSize: 10,
              color: "#999",
              fontFamily: "monospace",
              marginTop: 2,
            }}
          >
            {sublabel}
          </span>
        )}
      </span>
      <span style={{ ...panelCounterValueStyle, color: toneColor }}>
        {value}
      </span>
    </Link>
  );
}

/* ─── Hearings ─── */

function HearingsPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const s = navData?.hearingsSummary;
  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Hearings</div>
      <div style={{ fontSize: 11, color: "#999", padding: "0 12px 8px" }}>
        {s?.next30dCount ?? 0} upcoming &middot; next 30d
      </div>

      <PanelCounterRow
        href="/hearings?window=48h"
        label="Next 48 hours"
        value={s?.next48hCount ?? 0}
        tone={s && s.next48hCount > 0 ? "urgent" : "default"}
      />
      <PanelCounterRow
        href="/hearings?window=7d"
        label="This week"
        value={s?.next7dCount ?? 0}
      />
      <PanelCounterRow
        href="/hearings?window=30d&mrIncomplete=1"
        label="MR blocking"
        sublabel="< 14d, MR incomplete"
        value={s?.mrBlocking14dCount ?? 0}
        tone={s && s.mrBlocking14dCount > 0 ? "warn" : "default"}
      />

      <div style={{ padding: "12px 12px 0" }}>
        <Link href="/hearings" style={panelFooterLinkStyle}>
          View all hearings &rarr;
        </Link>
      </div>
    </div>
  );
}

/* ─── Filing ─── */

function FilingPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const s = navData?.filingSummary;
  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Filing</div>
      <div style={{ fontSize: 11, color: "#999", padding: "0 12px 8px" }}>
        Submission lifecycle
      </div>

      <PanelCounterRow
        href="/filing?status=ready"
        label="Ready to submit"
        value={s?.readyToSubmit ?? 0}
        tone={s && s.readyToSubmit > 0 ? "success" : "default"}
      />
      <PanelCounterRow
        href="/filing?status=bundles"
        label="Bundles for review"
        value={s?.bundlesReady ?? 0}
        tone={s && s.bundlesReady > 0 ? "warn" : "default"}
      />
      <PanelCounterRow
        href="/filing?status=submitted"
        label="Submitted this week"
        value={s?.submittedThisWeek ?? 0}
      />

      <div style={panelSubHeaderStyle}>Statutory Clocks</div>
      <div
        style={{
          fontSize: 11,
          color: "#999",
          padding: "0 12px 8px",
          fontFamily: "monospace",
        }}
      >
        Loaded on open &mdash; coming soon
      </div>

      <div style={{ padding: "12px 12px 0" }}>
        <Link href="/filing" style={panelFooterLinkStyle}>
          View filing queue &rarr;
        </Link>
      </div>
    </div>
  );
}

/* ─── PHI Writer ─── */

function PhiWriterPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const s = navData?.phiWriterSummary;
  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">PHI Writer</div>
      <div style={{ fontSize: 11, color: "#999", padding: "0 12px 8px" }}>
        {s?.myAssigned ?? 0} mine &middot; {s?.myInProgress ?? 0} in progress
      </div>

      <PanelCounterRow
        href="/phi-writer?assignedTo=me"
        label="My queue"
        value={s?.myAssigned ?? 0}
      />
      <PanelCounterRow
        href="/phi-writer?urgency=week"
        label="Due this week"
        value={s?.dueThisWeek ?? 0}
        tone={s && s.dueThisWeek > 0 ? "warn" : "default"}
      />
      <PanelCounterRow
        href="/phi-writer?status=unassigned"
        label="Unassigned"
        value={s?.unassigned ?? 0}
        tone={s && s.unassigned > 0 ? "urgent" : "default"}
      />

      <div style={{ padding: "12px 12px 0" }}>
        <Link href="/phi-writer" style={panelFooterLinkStyle}>
          Open PHI Writer &rarr;
        </Link>
      </div>
    </div>
  );
}

/* ─── Medical Records ─── */

const TEAM_PILL_STYLES: Record<
  string,
  { bg: string; fg: string; label: string }
> = {
  blue: { bg: "rgba(59,130,246,0.12)", fg: "#2563eb", label: "Blue" },
  orange: { bg: "rgba(249,115,22,0.12)", fg: "#ea580c", label: "Orange" },
  green: { bg: "rgba(29,114,184,0.12)", fg: "#1d72b8", label: "Green" },
  yellow: { bg: "rgba(245,158,11,0.14)", fg: "#b45309", label: "Yellow" },
  purple: { bg: "rgba(139,92,246,0.12)", fg: "#7c3aed", label: "Purple" },
};

function MedicalRecordsPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const s = navData?.medicalRecordsSummary;
  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Medical Records</div>
      <div style={{ fontSize: 11, color: "#999", padding: "0 12px 8px" }}>
        Records blocking hearings
      </div>

      <PanelCounterRow
        href="/medical-records?urgent=1"
        label="Urgent (< 14d)"
        value={s?.urgentBlocking14d ?? 0}
        tone={s && s.urgentBlocking14d > 0 ? "urgent" : "default"}
      />

      <div style={panelSubHeaderStyle}>RFC Pipeline</div>
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "4px 12px 10px",
          fontSize: 10,
          fontFamily: "monospace",
        }}
      >
        <Link
          href="/medical-records?tab=rfc&status=not_requested"
          style={{ textDecoration: "none", color: "#999" }}
        >
          Req {s?.rfcRequested ?? 0}
        </Link>
        <Link
          href="/medical-records?tab=rfc&status=requested"
          style={{ textDecoration: "none", color: "#F59E0B" }}
        >
          Await {s?.rfcAwaiting ?? 0}
        </Link>
        <Link
          href="/medical-records?tab=rfc&status=received"
          style={{ textDecoration: "none", color: "#1d72b8" }}
        >
          Recv {s?.rfcReceived ?? 0}
        </Link>
      </div>

      <div style={panelSubHeaderStyle}>Team Workload</div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          padding: "0 12px 8px",
        }}
      >
        {(s?.teamWorkload ?? []).map((team) => {
          const style = TEAM_PILL_STYLES[team.color];
          if (!style) return null;
          return (
            <Link
              key={team.color}
              href={`/medical-records?tab=workload&team=${team.color}`}
              style={{
                backgroundColor: style.bg,
                color: style.fg,
                padding: "3px 8px",
                borderRadius: 10,
                fontSize: 10,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {style.label} {team.count}
            </Link>
          );
        })}
        {(!s?.teamWorkload || s.teamWorkload.length === 0) && (
          <span style={{ fontSize: 10, color: "#999" }}>No team cases</span>
        )}
      </div>

      <div style={{ padding: "12px 12px 0" }}>
        <Link href="/medical-records" style={panelFooterLinkStyle}>
          Open Medical Records &rarr;
        </Link>
      </div>
    </div>
  );
}

/* ─── Mail ─── */

function MailPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const s = navData?.mailSummary;
  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Mail</div>
      <div style={{ fontSize: 11, color: "#999", padding: "0 12px 8px" }}>
        Postal intake &middot; tracking
      </div>

      <PanelCounterRow
        href="/mail?tab=inbound&status=pending"
        label="Pending inbox"
        value={s?.pendingInbound ?? 0}
        tone={s && s.pendingInbound > 5 ? "urgent" : "default"}
      />
      <PanelCounterRow
        href="/mail?tab=inbound&unmatched=1"
        label="Unmatched"
        value={s?.unmatched ?? 0}
        tone={s && s.unmatched > 0 ? "warn" : "default"}
      />
      <PanelCounterRow
        href="/mail?tab=outbound&status=in_transit"
        label="In transit"
        sublabel={
          s && s.certifiedInTransit > 0
            ? `${s.certifiedInTransit} certified`
            : undefined
        }
        value={s?.inTransit ?? 0}
      />

      <div style={{ padding: "12px 12px 0" }}>
        <Link href="/mail" style={panelFooterLinkStyle}>
          Open mail inbox &rarr;
        </Link>
      </div>
    </div>
  );
}

/* ─── Billing ─── */

function formatCents(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 10000) {
    return `$${(dollars / 1000).toFixed(1)}k`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(dollars);
}

function BillingPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const s = navData?.billingSummary;
  const unbilledHours = ((s?.unbilledMinutes ?? 0) / 60).toFixed(1);
  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Billing</div>
      <div style={{ fontSize: 11, color: "#999", padding: "0 12px 8px" }}>
        Money to capture
      </div>

      <PanelCounterRow
        href="/billing/invoices"
        label="Outstanding"
        sublabel={
          s && s.overdueCount > 0
            ? `${s.overdueCount} overdue`
            : s
              ? `${s.outstandingCount} invoice${s.outstandingCount === 1 ? "" : "s"}`
              : undefined
        }
        value={formatCents(s?.outstandingCents ?? 0)}
        tone={s && s.overdueCount > 0 ? "urgent" : "default"}
      />
      <PanelCounterRow
        href="/billing/time"
        label="Unbilled time"
        sublabel={
          s
            ? `${s.unbilledTimeCount} entr${s.unbilledTimeCount === 1 ? "y" : "ies"}`
            : undefined
        }
        value={`${unbilledHours}h`}
      />
      <PanelCounterRow
        href="/billing"
        label="Unbilled expenses"
        sublabel={
          s
            ? `${s.unbilledExpenseCount} item${s.unbilledExpenseCount === 1 ? "" : "s"}`
            : undefined
        }
        value={formatCents(s?.unbilledExpenseCents ?? 0)}
      />
      <PanelCounterRow
        href="/billing/invoices"
        label="Draft invoices"
        value={s?.draftInvoiceCount ?? 0}
        tone={s && s.draftInvoiceCount > 0 ? "warn" : "default"}
      />

      <div style={{ padding: "12px 12px 0" }}>
        <Link href="/billing" style={panelFooterLinkStyle}>
          View all billing &rarr;
        </Link>
      </div>
    </div>
  );
}

/* ─── Trust ─── */

function TrustPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const s = navData?.trustSummary;
  const reconTone =
    s && s.oldestUnreconciledDays != null && s.oldestUnreconciledDays > 30
      ? "urgent"
      : s && s.unreconciledCount > 0
        ? "warn"
        : "default";
  const lastTone =
    s && s.daysSinceLastReconciled != null && s.daysSinceLastReconciled > 30
      ? "urgent"
      : s && s.daysSinceLastReconciled != null && s.daysSinceLastReconciled > 14
        ? "warn"
        : "default";
  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div
        className="ttn-panel-header"
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        <span>Trust</span>
        {s?.hasNegativeBalance && (
          <span
            title="Negative account balance"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: "#EE0000",
              display: "inline-block",
            }}
          />
        )}
      </div>
      <div style={{ fontSize: 11, color: "#999", padding: "0 12px 8px" }}>
        {formatCents(s?.totalBalanceCents ?? 0)} &middot; {s?.accountCount ?? 0}{" "}
        account{s?.accountCount === 1 ? "" : "s"}
      </div>

      <PanelCounterRow
        href="/trust"
        label="Pending reconciliation"
        sublabel={
          s?.oldestUnreconciledDays != null && s.unreconciledCount > 0
            ? `${s.oldestUnreconciledDays}d oldest`
            : undefined
        }
        value={s?.unreconciledCount ?? 0}
        tone={reconTone}
      />
      <PanelCounterRow
        href="/trust"
        label="Last reconciled"
        value={
          s?.daysSinceLastReconciled != null
            ? `${s.daysSinceLastReconciled}d ago`
            : "never"
        }
        tone={lastTone}
      />

      <div style={{ padding: "12px 12px 0" }}>
        <Link href="/trust" style={panelFooterLinkStyle}>
          Open trust accounting &rarr;
        </Link>
      </div>
    </div>
  );
}

/* ─── Team Chat ─── */

function TeamChatPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const s = navData?.teamChatSummary;
  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Team Chat</div>
      <div style={{ fontSize: 11, color: "#999", padding: "0 12px 8px" }}>
        Internal staff only
      </div>

      <PanelCounterRow
        href="/team-chat"
        label="Mentions"
        sublabel="@you"
        value={s?.mentionCount ?? 0}
        tone={s && s.mentionCount > 0 ? "urgent" : "default"}
      />
      <PanelCounterRow
        href="/team-chat"
        label="Direct messages"
        value={s?.dmUnreadCount ?? 0}
        tone={s && s.dmUnreadCount > 0 ? "warn" : "default"}
      />

      <div style={{ padding: "12px 12px 0" }}>
        <Link href="/team-chat" style={panelFooterLinkStyle}>
          Open team chat &rarr;
        </Link>
      </div>
    </div>
  );
}

/* ─── Supervisor ─── */

function SupervisorPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const s = navData?.supervisorSummary;
  const topOverloaded = s?.topOverloaded ?? [];
  const maxOpen = Math.max(
    1,
    ...topOverloaded.map((r) => r.openTaskCount),
  );

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Supervisor</div>
      <div style={{ fontSize: 11, color: "#999", padding: "0 12px 8px" }}>
        {s?.openEvents ?? 0} open events &middot; {s?.highRisk ?? 0} high-risk
      </div>

      <PanelCounterRow
        href="/reports/risk"
        label="High-risk cases"
        value={s?.highRisk ?? 0}
        tone={s && s.highRisk > 0 ? "urgent" : "default"}
      />
      <PanelCounterRow
        href="/admin/compliance"
        label="Compliance findings"
        sublabel="bar · ethics · HIPAA"
        value={s?.openFindings ?? 0}
        tone={s && s.openFindings > 0 ? "urgent" : "default"}
      />
      <PanelCounterRow
        href="/coaching"
        label="Coaching flags"
        value={s?.openFlags ?? 0}
        tone={s && s.openFlags > 0 ? "warn" : "default"}
      />

      <div style={panelSubHeaderStyle}>Review queue</div>
      <PanelCounterRow
        href="/admin/supervisor/drafts"
        label="Drafts awaiting review"
        value={s?.openDrafts ?? 0}
        tone={s && s.openDrafts > 0 ? "warn" : "default"}
      />
      <PanelCounterRow
        href="/cases?filter=supervisor-events"
        label="Supervisor events"
        sublabel="across all cases"
        value={s?.openEvents ?? 0}
      />

      <div style={panelSubHeaderStyle}>Top overloaded</div>
      {topOverloaded.length === 0 ? (
        <div style={{ padding: "6px 12px", fontSize: 11, color: "#999" }}>
          No overload detected
        </div>
      ) : (
        <div style={{ padding: "2px 12px 8px" }}>
          {topOverloaded.map((row) => {
            const pct = Math.round(
              (row.openTaskCount / maxOpen) * 100,
            );
            return (
              <Link
                key={row.userId}
                href={`/admin/supervisor/workload?user=${row.userId}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 0",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: "#1C1C1E",
                    flex: "0 0 40%",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.name}
                </span>
                <span
                  style={{
                    flex: 1,
                    height: 4,
                    backgroundColor: "#F0F0F0",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      height: "100%",
                      width: `${pct}%`,
                      backgroundColor: "#185f9b",
                    }}
                  />
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#EE0000",
                    fontWeight: 600,
                    minWidth: 20,
                    textAlign: "right",
                  }}
                >
                  {row.overdueTaskCount}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <div
        style={{
          padding: "12px 12px 0",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <Link href="/admin/supervisor" style={panelFooterLinkStyle}>
          Open supervisor hub &rarr;
        </Link>
        <Link href="/admin/supervisor/workload" style={panelFooterLinkStyle}>
          Workload matrix &rarr;
        </Link>
      </div>
    </div>
  );
}

/* ─── Coaching ─── */

function CoachingPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const s = navData?.coachingSummary;
  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Coaching</div>
      <div style={{ fontSize: 11, color: "#999", padding: "0 12px 8px" }}>
        {s?.openTotal ?? 0} open &middot; {s?.inProgress ?? 0} in progress
      </div>

      <PanelCounterRow
        href="/coaching?severity=high"
        label="Needs attention"
        sublabel="severity ≥ 6"
        value={s?.openHighSeverity ?? 0}
        tone={s && s.openHighSeverity > 0 ? "urgent" : "default"}
      />
      <PanelCounterRow
        href="/coaching?status=in_progress"
        label="In progress"
        value={s?.inProgress ?? 0}
      />
      <PanelCounterRow
        href="/coaching?status=resolved&window=7d"
        label="Resolved this week"
        value={s?.resolvedThisWeek ?? 0}
        tone={s && s.resolvedThisWeek > 0 ? "success" : "default"}
      />

      <div style={panelSubHeaderStyle}>Problem Type</div>
      <PanelCounterRow
        href="/coaching?classification=people"
        label="People problems"
        value={s?.peopleCount ?? 0}
        tone={s && s.peopleCount > 0 ? "warn" : "default"}
      />
      <PanelCounterRow
        href="/coaching?classification=process"
        label="Process problems"
        value={s?.processCount ?? 0}
      />
      {(s?.unclassifiedCount ?? 0) > 0 && (
        <PanelCounterRow
          href="/coaching?classification=none"
          label="Unclassified"
          value={s?.unclassifiedCount ?? 0}
          tone="warn"
        />
      )}

      <div style={panelSubHeaderStyle}>Training Gaps</div>
      <PanelCounterRow
        href="/coaching/training-gaps"
        label="Role-level gaps"
        sublabel="≥50% below target"
        value={s?.trainingGapCount ?? 0}
        tone={s && s.trainingGapCount > 0 ? "warn" : "default"}
      />

      <div style={{ padding: "12px 12px 0" }}>
        <Link href="/coaching" style={panelFooterLinkStyle}>
          View all flags &rarr;
        </Link>
      </div>
    </div>
  );
}

/* ─── AI Drafts ─── */

const AI_DRAFT_SHORT_LABEL: Record<string, string> = {
  client_message: "Client msg",
  client_letter: "Letter",
  call_script: "Call script",
  appeal_form: "Appeal",
  reconsideration_request: "Recon req",
  pre_hearing_brief: "Brief",
  appeals_council_brief: "AC brief",
  medical_records_request: "MR request",
  fee_petition: "Fee pet.",
  task_instructions: "Task instr.",
  status_update: "Status",
  rfc_letter: "RFC letter",
  coaching_conversation: "Coaching",
  other: "Other",
};

function AiDraftsPanel({
  active,
  navData,
}: {
  active: boolean;
  navData?: NavPanelData;
}) {
  const s = navData?.aiDraftsSummary;

  const topTypes = Object.entries(s?.byType ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const needsReviewTone =
    s && s.errorCount > 0
      ? "urgent"
      : s && s.needsReview > 0
        ? "warn"
        : "default";

  const recent = s?.recent ?? [];

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">AI Drafts</div>
      <div style={{ fontSize: 11, color: "#999", padding: "0 12px 8px" }}>
        {s?.myQueue ?? 0} mine &middot; {s?.needsReview ?? 0} in review
      </div>

      <PanelCounterRow
        href="/drafts?mine=1"
        label="My queue"
        value={s?.myQueue ?? 0}
      />
      <PanelCounterRow
        href="/drafts?status=draft_ready"
        label="Needs review"
        value={s?.needsReview ?? 0}
        tone={needsReviewTone}
      />
      <PanelCounterRow
        href="/drafts?confidence=low"
        label="Low confidence"
        value={s?.lowConfidence ?? 0}
        tone={s && s.lowConfidence > 0 ? "urgent" : "default"}
      />

      <div style={panelSubHeaderStyle}>By type</div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          padding: "4px 12px 10px",
          fontSize: 10,
          fontFamily: "monospace",
        }}
      >
        {topTypes.length === 0 ? (
          <span style={{ fontSize: 10, color: "#999" }}>No active drafts</span>
        ) : (
          topTypes.map(([type, n]) => (
            <Link
              key={type}
              href={`/drafts?type=${type}`}
              style={{ textDecoration: "none", color: "#185f9b" }}
            >
              {AI_DRAFT_SHORT_LABEL[type] ?? type} {n}
            </Link>
          ))
        )}
      </div>

      <div style={panelSubHeaderStyle}>Recent</div>
      {recent.length === 0 ? (
        <div style={{ padding: "6px 12px", fontSize: 11, color: "#999" }}>
          No recent drafts
        </div>
      ) : (
        recent.map((r) => (
          <Link
            key={r.id}
            href={`/drafts/${r.id}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="ttn-msg-preview">
              <div className="ttn-msg-avatar">{r.authorInitials}</div>
              <div className="ttn-msg-body">
                <div
                  className="ttn-msg-subject"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.title}
                </div>
                <div
                  className="ttn-msg-snippet"
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: "monospace",
                      backgroundColor: "rgba(24,95,155,0.1)",
                      color: "#185f9b",
                      padding: "1px 4px",
                      borderRadius: 3,
                    }}
                  >
                    {AI_DRAFT_SHORT_LABEL[r.type] ?? r.type}
                  </span>
                  {r.caseNumber && <span>#{r.caseNumber}</span>}
                </div>
              </div>
              <span className="ttn-msg-time">
                {formatRelativeTime(r.createdAt)}
              </span>
            </div>
          </Link>
        ))
      )}

      <div style={{ padding: "12px 12px 0" }}>
        <Link href="/drafts" style={panelFooterLinkStyle}>
          Open drafts inbox &rarr;
        </Link>
      </div>
    </div>
  );
}

function ChangelogPanel({
  active,
  commits,
  onMarkViewed,
}: {
  active: boolean;
  commits?: CommitEntry[];
  onMarkViewed: () => void;
}) {
  useEffect(() => {
    if (active) {
      localStorage.setItem("changelog:lastViewedAt", new Date().toISOString());
      onMarkViewed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const displayCommits = (commits ?? []).slice(0, 8);

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">What&apos;s New</div>

      {displayCommits.length === 0 ? (
        <div style={{ padding: "6px 8px", fontSize: 12, color: "#999" }}>
          No recent updates
        </div>
      ) : (
        <div className="ttn-changelog-list">
          {displayCommits.map((c) => (
            <div key={c.hash} className="ttn-changelog-item">
              <div className="ttn-changelog-item-header">
                <span className={`ttn-changelog-type ${c.type}`}>
                  {c.type}
                </span>
                <span className="ttn-changelog-time">
                  {formatRelativeTime(c.date)}
                </span>
              </div>
              <div className="ttn-changelog-subject" title={c.subject}>
                {c.subject}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="ttn-changelog-footer">
        <Link href="/changelog">View full changelog &rarr;</Link>
      </div>
    </div>
  );
}

function DefaultPanel({
  active,
  label,
  href,
}: {
  active: boolean;
  label: string;
  href: string;
}) {
  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">{label}</div>
      <Link href={href} className="ttn-panel-item">
        <span>View all &rarr;</span>
      </Link>
    </div>
  );
}
