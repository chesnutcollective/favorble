"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
}: {
  user: SessionUser;
  casesCount?: number;
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
            <CasesPanel active={visiblePanel === "cases"} />

            {/* Messages Panel */}
            <MessagesPanel active={visiblePanel === "messages"} />

            {/* Settings Panel */}
            <SettingsPanel
              active={visiblePanel === "settings"}
              pathname={pathname}
            />

            {/* Default panels for remaining items */}
            {mainNav
              .filter(
                (item) =>
                  !["dashboard", "cases", "messages"].includes(item.id),
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

function CasesPanel({ active }: { active: boolean }) {
  const [activeTab, setActiveTab] = useState("All");

  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Cases</div>

      <div className="ttn-case-tabs">
        {["All", "SSDI", "SSI"].map((tab) => (
          <button
            key={tab}
            type="button"
            className={`ttn-case-tab${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="ttn-section-label">By Stage</div>
      {[
        { name: "Intake", count: 8, pct: 60 },
        { name: "Application", count: 12, pct: 85 },
        { name: "Recon", count: 9, pct: 65 },
        { name: "Hearing", count: 6, pct: 45 },
        { name: "Resolution", count: 5, pct: 35 },
      ].map((stage) => (
        <Link
          href={`/cases?stage=${stage.name.toLowerCase()}`}
          key={stage.name}
          className="ttn-stage-item"
        >
          <span className="ttn-stage-name">{stage.name}</span>
          <div className="ttn-stage-bar-track">
            <div
              className="ttn-stage-bar-fill"
              style={{ width: `${stage.pct}%` }}
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
        Pinned Cases
      </div>
      {["Martinez v. State Farm", "Thompson Estate", "Chen v. Riverside LLC"].map(
        (name) => (
          <div key={name} className="ttn-starred-case">
            <span className="ttn-star">&#9733;</span>
            {name}
          </div>
        ),
      )}
    </div>
  );
}

function MessagesPanel({ active }: { active: boolean }) {
  return (
    <div className={`ttn-panel-content${active ? " active" : ""}`}>
      <div className="ttn-panel-header">Messages</div>

      <div className="ttn-section-label">Folders</div>
      <Link href="/messages" className="ttn-msg-folder active">
        <span>Inbox</span>
        <span className="ttn-folder-count">3</span>
      </Link>
      <Link href="/messages?folder=sent" className="ttn-msg-folder">
        <span>Sent</span>
      </Link>
      <Link href="/messages?folder=drafts" className="ttn-msg-folder">
        <span>Drafts</span>
      </Link>

      <div className="ttn-section-label" style={{ marginTop: 16 }}>
        Recent
      </div>
      {[
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
      ].map((msg, i) => (
        <div key={i} className="ttn-msg-preview">
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
      ))}
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
