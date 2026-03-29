"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import { ThemeSwitcher } from "./theme-switcher";

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
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
        <path d="M4 2h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm12 0h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM4 14h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zm12 0h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z" />
      </svg>
    ),
  },
  {
    id: "cases",
    label: "Cases",
    href: "/cases",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
        <path d="M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" />
      </svg>
    ),
  },
  {
    id: "leads",
    label: "Leads",
    href: "/leads",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
        <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
      </svg>
    ),
  },
  {
    id: "queue",
    label: "Queue",
    href: "/queue",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
        <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
      </svg>
    ),
  },
  {
    id: "calendar",
    label: "Calendar",
    href: "/calendar",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
        <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z" />
      </svg>
    ),
  },
  {
    id: "messages",
    label: "Messages",
    href: "/messages",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
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
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
      </svg>
    ),
  },
  {
    id: "contacts",
    label: "Contacts",
    href: "/contacts",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
      </svg>
    ),
  },
  {
    id: "documents",
    label: "Documents",
    href: "/documents",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
      </svg>
    ),
  },
  {
    id: "reports",
    label: "Reports",
    href: "/reports",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
        <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
      </svg>
    ),
  },
];

const settingsIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
  </svg>
);

/* ─── Settings sub-nav items ─── */

interface SettingsItem {
  label: string;
  href: string;
}

const settingsNav: SettingsItem[] = [
  { label: "Integrations", href: "/admin/integrations" },
  { label: "Workflows", href: "/admin/workflows" },
  { label: "Stages", href: "/admin/stages" },
  { label: "Fields", href: "/admin/fields" },
  { label: "Users", href: "/admin/users" },
  { label: "Templates", href: "/admin/templates" },
];

/* ─── Determine active rail item from pathname ─── */

function getActiveRailId(pathname: string): string {
  if (pathname.startsWith("/admin")) return "settings";
  for (const item of mainNav) {
    if (item.id === "dashboard") {
      if (pathname === "/dashboard" || pathname === "/") return "dashboard";
      continue;
    }
    if (pathname.startsWith(item.href)) return item.id;
  }
  return "dashboard";
}

/* ─── Component ─── */

export function TwoTierNav({
  user,
  casesCount,
  navData,
}: {
  user: SessionUser;
  casesCount?: number;
  navData?: NavPanelData;
}) {
  const pathname = usePathname();
  const activeRailId = getActiveRailId(pathname);
  const [hoveredPanel, setHoveredPanel] = useState<string | null>(null);
  const visiblePanel = hoveredPanel ?? activeRailId;

  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();

  function isRailActive(item: RailItem) {
    if (item.id === "dashboard")
      return pathname === "/dashboard" || pathname === "/";
    return pathname.startsWith(item.href);
  }

  return (
    <div className="ttn-float">
      <div className="ttn-card">
        {/* ── Tier 1: Icon Rail ── */}
        <nav className="ttn-rail">
          {/* Logo */}
          <Link href="/dashboard" className="ttn-logo">
            <span>F</span>
          </Link>

          {/* Main nav icons */}
          <div className="ttn-rail-group">
            {mainNav.map((item) => {
              const active = isRailActive(item);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`ttn-rail-btn${active ? " active" : ""}`}
                  onMouseEnter={() => setHoveredPanel(item.id)}
                  onMouseLeave={() => setHoveredPanel(null)}
                  title={item.label}
                >
                  {item.icon}
                  {item.notification && <span className="ttn-notif-dot" />}
                </Link>
              );
            })}
          </div>

          <div className="ttn-rail-divider" />
          <div className="ttn-rail-spacer" />

          {/* User avatar */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="ttn-rail-avatar"
                type="button"
                title={`${user.firstName} ${user.lastName}`}
              >
                <span>{initials}</span>
                <span className="ttn-status-dot" />
              </button>
            </DropdownMenuTrigger>
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

          {/* Settings gear */}
          <Link
            href="/admin/integrations"
            className={`ttn-rail-btn${pathname.startsWith("/admin") ? " active" : ""}`}
            onMouseEnter={() => setHoveredPanel("settings")}
            onMouseLeave={() => setHoveredPanel(null)}
            title="Settings"
          >
            {settingsIcon}
          </Link>
        </nav>

        {/* ── Tier 2: Context Panel ── */}
        <aside className="ttn-panel">
          {/* Search trigger */}
          <div className="ttn-search-trigger">
            <span className="ttn-search-placeholder">Search...</span>
            <kbd className="ttn-search-badge">{"\u2318"}K</kbd>
          </div>

          <div className="ttn-panel-content-wrapper">
            {/* Dashboard Panel */}
            <DashboardPanel
              active={visiblePanel === "dashboard"}
              casesCount={casesCount}
            />

            {/* Cases Panel */}
            <CasesPanel active={visiblePanel === "cases"} navData={navData} />

            {/* Messages Panel */}
            <MessagesPanel active={visiblePanel === "messages"} navData={navData} />

            {/* Leads Panel */}
            <LeadsPanel active={visiblePanel === "leads"} />

            {/* Queue Panel */}
            <QueuePanel active={visiblePanel === "queue"} />

            {/* Calendar Panel */}
            <CalendarPanel active={visiblePanel === "calendar"} navData={navData} />

            {/* Email Panel */}
            <EmailPanel active={visiblePanel === "email"} navData={navData} />

            {/* Contacts Panel */}
            <ContactsPanel active={visiblePanel === "contacts"} />

            {/* Documents Panel */}
            <DocumentsPanel active={visiblePanel === "documents"} navData={navData} />

            {/* Reports Panel */}
            <ReportsPanel active={visiblePanel === "reports"} />

            {/* Settings Panel */}
            <SettingsPanel
              active={visiblePanel === "settings"}
              pathname={pathname}
            />

            {/* Default panels for remaining items */}
            {mainNav
              .filter(
                (item) =>
                  !["dashboard", "cases", "messages", "leads", "queue", "calendar", "email", "contacts", "documents", "reports"].includes(item.id),
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
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function getInitials(str: string | null): string {
  if (!str) return "?";
  const parts = str.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return str.substring(0, 2).toUpperCase();
}

function getEventColor(eventType: string | null): string {
  switch (eventType) {
    case "hearing": return "#059669";
    case "deadline": return "#F59E0B";
    case "consultation": return "#3B82F6";
    case "meeting": return "#8B5CF6";
    default: return "#059669";
  }
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

function CasesPanel({ active, navData }: { active: boolean; navData?: NavPanelData }) {
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

  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Cases</div>

      <div className="ttn-section-label">By Stage</div>
      {stages.map((stage) => (
        <Link
          href={`/cases?stage=${stage.stageId}`}
          key={stage.stageId}
          className="ttn-stage-item"
        >
          <span className="ttn-stage-name">{stage.stageName}</span>
          <div className="ttn-stage-bar-track">
            <div
              className="ttn-stage-bar-fill"
              style={{ width: `${(stage.count / maxCount) * 100}%` }}
            />
          </div>
          <span className="ttn-stage-count">{stage.count}</span>
        </Link>
      ))}

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

function MessagesPanel({ active, navData }: { active: boolean; navData?: NavPanelData }) {
  const msgs = navData?.messageSummary;
  const unreadCount = msgs?.unreadCount ?? 0;

  const fallbackMessages = [
    { initials: "SM", unread: true, subject: "Martinez Case Update", snippet: "Re: Updated medical records received from...", time: "12m" },
    { initials: "JD", unread: true, subject: "Thompson Hearing Date", snippet: "The ALJ has scheduled the hearing for...", time: "2h" },
    { initials: "KL", unread: false, subject: "Chen Document Review", snippet: "Please review the attached brief when...", time: "1d" },
  ];

  const recentMessages = msgs?.recentMessages && msgs.recentMessages.length > 0
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
        {unreadCount > 0 && <span className="ttn-folder-count">{unreadCount}</span>}
      </Link>

      <div className="ttn-section-label" style={{ marginTop: 16 }}>
        Recent
      </div>
      {(recentMessages ?? fallbackMessages).map((msg, i) => {
        const msgId = "id" in msg ? (msg as { id: string }).id : null;
        const caseId = "caseId" in msg ? (msg as { caseId: string | null }).caseId : null;
        const caseNumber = "caseNumber" in msg ? (msg as { caseNumber: string | null }).caseNumber : null;
        return (
          <div key={msgId ?? i}>
            <Link href={msgId ? `/messages?highlight=${msgId}` : "/messages"} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="ttn-msg-preview">
                <div className={`ttn-msg-avatar${msg.unread ? " unread" : ""}`}>
                  {msg.initials}
                </div>
                <div className="ttn-msg-body">
                  <div className={`ttn-msg-subject${msg.unread ? " unread" : ""}`}>
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
                style={{ display: "block", fontSize: 11, color: "#666", paddingLeft: 44, marginTop: -4, marginBottom: 4, textDecoration: "none" }}
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
        >
          <span>{item.label}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            width="14"
            height="14"
            style={{ opacity: 0.4 }}
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

function LeadsPanel({ active, navData }: { active: boolean; navData?: NavPanelData }) {
  const STAGE_COLORS: Record<string, string> = {
    new: "#10B981",
    contacted: "#3B82F6",
    intake_in_progress: "#F59E0B",
    contract_sent: "#8B5CF6",
    contract_signed: "#059669",
  };
  const PIPELINE_ORDER = ["new", "contacted", "intake_in_progress", "contract_sent", "contract_signed"];
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
  const signedCount = pipelineStages.find((s) => s.status === "contract_signed")?.count ?? 0;
  const conversionRate = totalLeads > 0 ? Math.round((signedCount / totalLeads) * 100) : 0;

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Leads</div>

      <div className="ttn-section-label">Pipeline</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0, padding: "0 12px" }}>
        {pipelineStages.map((stage, i) => (
          <React.Fragment key={stage.status}>
            <Link
              href="/leads"
              style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 0", textDecoration: "none", color: "inherit" }}
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
                <span style={{ fontSize: 12, color: "#1C1C1E", flex: 1 }}>{stage.label}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "monospace",
                    color: "#059669",
                    border: "1px solid #059669",
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
            color: "#059669",
            textDecoration: "none",
          }}
        >
          View pipeline &rarr;
        </Link>
      </div>
    </div>
  );
}

function QueuePanel({ active, navData }: { active: boolean; navData?: NavPanelData }) {
  const fallbackTasks = [
    { id: "1", title: "Follow up with Martinez on medical records", due: "Today", overdue: true },
    { id: "2", title: "File Thompson motion to compel", due: "Today", overdue: true },
    { id: "3", title: "Review Chen deposition transcript", due: "Yesterday", overdue: true },
    { id: "4", title: "Draft Wilson intake summary", due: "Mar 30", overdue: false },
    { id: "5", title: "Schedule Davis hearing prep call", due: "Mar 31", overdue: false },
  ];

  const taskSummary = navData?.taskSummary;
  const totalTasks = taskSummary?.total ?? 12;
  const overdueCount = taskSummary?.overdue ?? 3;

  function formatTaskDue(dueDate: Date | null): { label: string; isOverdue: boolean } {
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
      label: due.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      isOverdue: false,
    };
  }

  const displayTasks: Array<{ id: string; title: string; due: string; overdue: boolean }> =
    taskSummary?.topTasks?.length
      ? taskSummary.topTasks.map((t) => {
          const dueInfo = formatTaskDue(t.dueDate);
          return { id: t.id, title: t.title, due: dueInfo.label, overdue: dueInfo.isOverdue };
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
          <Link href="/queue?tab=overdue" style={{ color: "#EE0000", textDecoration: "none" }}>
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
            href="/queue"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "8px 12px",
              borderBottom: i < displayTasks.length - 1 ? "1px solid #F0F0F0" : "none",
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
            color: "#059669",
            textDecoration: "none",
          }}
        >
          View all tasks &rarr;
        </Link>
      </div>
    </div>
  );
}

function CalendarPanel({ active, navData }: { active: boolean; navData?: NavPanelData }) {
  const now = new Date();
  const monthYear = now
    .toLocaleDateString("en-US", { month: "long", year: "numeric" })
    .toUpperCase();

  const today = now.getDate();
  const dayOfWeek = now.getDay();
  const weekDays: { label: string; date: number; isToday: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const diff = i - dayOfWeek;
    const d = new Date(now);
    d.setDate(today + diff);
    weekDays.push({
      label: ["S", "M", "T", "W", "T", "F", "S"][i],
      date: d.getDate(),
      isToday: d.getDate() === today && d.getMonth() === now.getMonth(),
    });
  }

  const todayEvents = navData?.todayEvents;
  const hasEvents = todayEvents && todayEvents.length > 0;

  const fallbackEvents = [
    { time: "10:00 AM", title: "Martinez Hearing", type: "Hearing", color: "#059669", href: "/calendar" },
    { time: "1:30 PM", title: "Thompson Filing Deadline", type: "Deadline", color: "#F59E0B", href: "/calendar" },
    { time: "3:00 PM", title: "Chen Status Conference", type: "Hearing", color: "#059669", href: "/calendar" },
  ];

  const events = hasEvents
    ? todayEvents.slice(0, 3).map((e) => ({
        id: e.id,
        time: formatEventTime(e.startTime),
        title: e.title,
        type: e.eventType ?? "Event",
        color: getEventColor(e.eventType),
        href: e.caseId ? `/cases/${e.caseId}/calendar` : "/calendar",
      }))
    : null;

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Calendar</div>

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
              href="/calendar"
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
                  backgroundColor: day.isToday ? "#059669" : "transparent",
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
                    backgroundColor: "#059669",
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
            No events today
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
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 12px",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "#999",
                  whiteSpace: "nowrap",
                  marginTop: 1,
                  minWidth: 54,
                }}
              >
                {event.time}
              </span>
              <div
                style={{
                  width: 3,
                  alignSelf: "stretch",
                  borderRadius: 2,
                  backgroundColor: event.color,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "#1C1C1E" }}>{event.title}</div>
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
                    marginTop: 3,
                  }}
                >
                  {event.type}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ padding: "12px 12px 0" }}>
        <Link
          href="/calendar"
          style={{
            fontSize: 12,
            color: "#059669",
            textDecoration: "none",
          }}
        >
          View calendar →
        </Link>
      </div>
    </div>
  );
}

function EmailPanel({ active, navData }: { active: boolean; navData?: NavPanelData }) {
  const [activeTab, setActiveTab] = useState<"matched" | "unmatched">("matched");
  const emailData = navData?.emailSummary;
  const connected = emailData?.isOutlookConfigured ?? false;
  const unmatchedCount = emailData?.unmatchedCount ?? 0;

  const fallbackEmails = [
    { initials: "JM", subject: "RE: Medical records request for Martinez", caseLink: "HS-2026-1015" as string | null, caseId: null as string | null, time: "9:14 AM" },
    { initials: "KT", subject: "Thompson hearing confirmation from ALJ", caseLink: "HS-2026-0987" as string | null, caseId: null as string | null, time: "8:42 AM" },
    { initials: "LD", subject: "Davis CE appointment scheduling", caseLink: "HS-2026-1102" as string | null, caseId: null as string | null, time: "Yesterday" },
    { initials: "RW", subject: "Wilson intake documents received", caseLink: "HS-2026-1098" as string | null, caseId: null as string | null, time: "Yesterday" },
  ];

  const realEmails = emailData?.recentEmails && emailData.recentEmails.length > 0
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
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px 8px" }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: connected ? "#10B981" : "#9CA3AF",
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 11, color: connected ? "#10B981" : "#9CA3AF" }}>
          {connected ? "Outlook Connected" : "Not Connected"}
        </span>
      </div>

      {/* Tabs: Matched / Unmatched */}
      <div style={{ display: "flex", gap: 12, padding: "0 12px 8px", borderBottom: "1px solid #F0F0F0" }}>
        <button
          type="button"
          onClick={() => setActiveTab("matched")}
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: activeTab === "matched" ? "#1C1C1E" : "#999",
            background: "none",
            border: "none",
            borderBottom: activeTab === "matched" ? "2px solid #10B981" : "2px solid transparent",
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
            borderBottom: activeTab === "unmatched" ? "2px solid #10B981" : "2px solid transparent",
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
                fontSize: 11,
                color: "#D97706",
                border: "1px solid #D97706",
                borderRadius: 9,
                padding: "0 6px",
                lineHeight: "18px",
                fontFamily: "monospace",
              }}
            >
              {unmatchedCount}
            </span>
          )}
        </button>
      </div>

      {/* Email list */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {activeTab === "matched" &&
          displayEmails.map((email, i) => (
            <Link
              key={"id" in email ? (email as { id: string }).id : i}
              href="/email"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "8px 12px",
                  borderBottom: i < displayEmails.length - 1 ? "1px solid #F0F0F0" : "none",
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
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                    {email.caseLink && (
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: "monospace",
                          color: "#999",
                        }}
                      >
                        {email.caseId ? (
                          <Link href={`/cases/${email.caseId}`} style={{ color: "#059669", textDecoration: "none" }} onClick={(ev) => ev.stopPropagation()}>
                            &rarr; {email.caseLink}
                          </Link>
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
          <Link href="/email?filter=unmatched" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ padding: "12px", fontSize: 12, color: "#999" }}>
              {unmatchedCount > 0
                ? `${unmatchedCount} email${unmatchedCount === 1 ? "" : "s"} need case matching`
                : "No unmatched emails"}
            </div>
          </Link>
        )}
      </div>

      <div style={{ padding: "12px 12px 0" }}>
        <Link
          href={activeTab === "unmatched" ? "/email?filter=unmatched" : "/email"}
          style={{
            fontSize: 12,
            color: "#059669",
            textDecoration: "none",
          }}
        >
          View all email &rarr;
        </Link>
      </div>
    </div>
  );
}

function ContactsPanel({ active }: { active: boolean }) {
  const router = useRouter();
  const typeMap: Record<string, string> = {
    "All": "",
    "Claimants": "claimant",
    "Providers": "medical_provider",
    "Attorneys": "attorney",
    "SSA": "ssa_office",
    "Experts": "expert",
  };
  const [activeFilter, setActiveFilter] = useState("All");
  const filters = ["All", "Claimants", "Providers", "Attorneys", "SSA", "Experts"];

  const contacts = [
    { initials: "RM", name: "Rosa Martinez", type: "Claimant", cases: 1 },
    { initials: "DT", name: "Dr. David Thompson", type: "Provider", cases: 3 },
    { initials: "SC", name: "Sarah Chen, Esq.", type: "Attorney", cases: 2 },
    { initials: "JW", name: "James Wilson", type: "Claimant", cases: 1 },
    { initials: "KP", name: "Karen Phillips", type: "SSA", cases: 5 },
  ];

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Contacts</div>

      {/* Type filter pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 12px 8px" }}>
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => {
              setActiveFilter(filter);
              const typeValue = typeMap[filter];
              router.push(typeValue ? `/contacts?type=${typeValue}` : "/contacts");
            }}
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: activeFilter === filter ? "#059669" : "#999",
              backgroundColor: activeFilter === filter ? "#ECFDF5" : "transparent",
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
        {contacts.map((contact, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderBottom: i < contacts.length - 1 ? "1px solid #F0F0F0" : "none",
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
              <div style={{ fontSize: 12, color: "#1C1C1E" }}>{contact.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 1 }}>
                <span style={{ fontSize: 10, color: "#999" }}>{contact.type}</span>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: "#999" }}>
                  {contact.cases} {contact.cases === 1 ? "case" : "cases"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer links */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 12px 0" }}>
        <Link
          href="/contacts?action=new"
          style={{
            fontSize: 12,
            color: "#059669",
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
            color: "#059669",
            textDecoration: "none",
          }}
        >
          View all &rarr;
        </Link>
      </div>
    </div>
  );
}

function DocumentsPanel({ active, navData }: { active: boolean; navData?: NavPanelData }) {
  const router = useRouter();
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
    name: u.fileName,
    type: u.fileType?.includes("pdf") ? "pdf" : u.fileType?.includes("doc") ? "doc" : u.fileType?.includes("xls") ? "xls" : "other",
    time: formatRelativeTime(u.createdAt),
  }));
  if (recentUploads.length === 0) {
    recentUploads.push(
      { name: "Martinez_MedRecords.pdf", type: "pdf", time: "2h ago" },
      { name: "Thompson_Decision.docx", type: "doc", time: "5h ago" },
      { name: "Chen_Billing.xlsx", type: "xls", time: "1d ago" },
    );
  }

  const fileTypeColors: Record<string, string> = {
    pdf: "#EF4444",
    doc: "#3B82F6",
    xls: "#10B981",
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
      <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "0 8px" }}>
        {sources.map((src) => {
          const count = docData?.bySourceCount?.[src.key] ?? 0;
          if (count === 0 && !docData) return null;
          return (
            <div
              key={src.key}
              onClick={() => router.push(`/documents?source=${src.key}`)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "5px 8px",
                borderRadius: 6,
                cursor: "pointer",
                transition: "background 0.12s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#F0F0F0"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <span style={{ fontSize: 12, color: "#555" }}>{src.label}</span>
              <span style={{ fontSize: 10, fontFamily: "'Geist Mono', monospace", color: "#999" }}>
                {count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Recent uploads */}
      <div className="ttn-section-label" style={{ marginTop: 12 }}>Recent Uploads</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 8px" }}>
        {recentUploads.map((file, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 8px",
              borderRadius: 6,
              cursor: "pointer",
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
            <span
              style={{
                fontSize: 11,
                color: "#1C1C1E",
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {file.name}
            </span>
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
          </div>
        ))}
      </div>

      {/* Footer links */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 12px 0" }}>
        <Link
          href="/documents"
          style={{
            fontSize: 12,
            color: "#059669",
            textDecoration: "none",
          }}
        >
          Upload document
        </Link>
        <Link
          href="/documents"
          style={{
            fontSize: 12,
            color: "#059669",
            textDecoration: "none",
          }}
        >
          View all &rarr;
        </Link>
      </div>
    </div>
  );
}

function ReportsPanel({ active }: { active: boolean }) {
  const reportTypes = [
    {
      name: "Cases by Stage",
      slug: "cases-by-stage",
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
          <rect x="1" y="8" width="3" height="5" rx="0.5" fill="#059669" />
          <rect x="5.5" y="5" width="3" height="8" rx="0.5" fill="#059669" />
          <rect x="10" y="2" width="3" height="11" rx="0.5" fill="#059669" />
        </svg>
      ),
    },
    {
      name: "Team Performance",
      slug: "team-member",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#059669" width="14" height="14" style={{ flexShrink: 0 }}>
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      ),
    },
    {
      name: "Time in Stage",
      slug: "time-in-stage",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#059669" width="14" height="14" style={{ flexShrink: 0 }}>
          <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
        </svg>
      ),
    },
    {
      name: "Case Trends",
      slug: "cases-over-time",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#059669" width="14" height="14" style={{ flexShrink: 0 }}>
          <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z" />
        </svg>
      ),
    },
    {
      name: "Pipeline Funnel",
      slug: "pipeline-funnel",
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="#059669" style={{ flexShrink: 0 }}>
          <path d="M1 1h12L9 6v5l-4 2V6L1 1z" />
        </svg>
      ),
    },
    {
      name: "Task Completion",
      slug: "task-completion",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#059669" width="14" height="14" style={{ flexShrink: 0 }}>
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
      ),
    },
  ];

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Reports</div>

      {/* Report type list */}
      <div className="ttn-section-label">Available Reports</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "0 8px" }}>
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
            <span style={{ fontSize: 12, color: "#CCC" }}>&rsaquo;</span>
          </Link>
        ))}
      </div>

      {/* Quick stats */}
      <div className="ttn-section-label" style={{ marginTop: 12 }}>Quick Stats</div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "0 12px",
          gap: 8,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 9,
              textTransform: "uppercase",
              color: "#999",
              letterSpacing: "0.03em",
              marginBottom: 2,
            }}
          >
            Win Rate
          </div>
          <div
            style={{
              fontSize: 16,
              fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
              fontWeight: 600,
              color: "#059669",
            }}
          >
            67%
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 9,
              textTransform: "uppercase",
              color: "#999",
              letterSpacing: "0.03em",
              marginBottom: 2,
            }}
          >
            Avg Days
          </div>
          <div
            style={{
              fontSize: 16,
              fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
              fontWeight: 600,
              color: "#1C1C1E",
            }}
          >
            142
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 9,
              textTransform: "uppercase",
              color: "#999",
              letterSpacing: "0.03em",
              marginBottom: 2,
            }}
          >
            Revenue MTD
          </div>
          <div
            style={{
              fontSize: 16,
              fontFamily: "'Geist Mono', 'SF Mono', 'Menlo', monospace",
              fontWeight: 600,
              color: "#1C1C1E",
            }}
          >
            $45K
          </div>
        </div>
      </div>

      {/* Footer link */}
      <div style={{ padding: "12px 12px 0" }}>
        <Link
          href="/reports"
          style={{
            fontSize: 12,
            color: "#059669",
            textDecoration: "none",
          }}
        >
          View dashboard &rarr;
        </Link>
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
