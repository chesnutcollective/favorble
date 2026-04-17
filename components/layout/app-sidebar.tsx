"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  CheckListIcon,
  Folder01Icon,
  GitBranchIcon,
  Calendar01Icon,
  Message01Icon,
  Mail01Icon,
  UserGroupIcon,
  File01Icon,
  AnalyticsUpIcon,
  WorkflowSquare01Icon,
  Layers01Icon,
  TextField,
  PlugSocketIcon,
} from "@hugeicons/core-free-icons";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { UserMenu } from "./user-menu";
import type { SessionUser } from "@/lib/auth/session";

interface NavItem {
  title: string;
  href: string;
  icon: IconSvgElement;
  badge?: number;
}

const overviewNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: DashboardSquare01Icon },
  { title: "Cases", href: "/cases", icon: Folder01Icon },
  { title: "My Queue", href: "/queue", icon: CheckListIcon },
  { title: "Calendar", href: "/calendar", icon: Calendar01Icon },
];

const toolsNav: NavItem[] = [
  { title: "Leads", href: "/leads", icon: GitBranchIcon },
  { title: "Messages", href: "/messages", icon: Message01Icon },
  { title: "Email", href: "/email", icon: Mail01Icon },
  { title: "Contacts", href: "/contacts", icon: UserGroupIcon },
  { title: "Documents", href: "/documents", icon: File01Icon },
  { title: "Reports", href: "/reports", icon: AnalyticsUpIcon },
];

const settingsNav: NavItem[] = [
  { title: "Integrations", href: "/admin/integrations", icon: PlugSocketIcon },
  { title: "Workflows", href: "/admin/workflows", icon: WorkflowSquare01Icon },
  { title: "Stages", href: "/admin/stages", icon: Layers01Icon },
  { title: "Fields", href: "/admin/fields", icon: TextField },
];

export function AppSidebar({
  user,
  casesCount,
}: {
  user: SessionUser;
  casesCount?: number;
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  function renderNavSection(label: string, items: NavItem[]) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => {
              const badge =
                item.title === "Cases" && casesCount != null
                  ? casesCount
                  : item.badge;
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <HugeiconsIcon
                        icon={item.icon}
                        size={16}
                        className={
                          isActive(item.href) ? "opacity-100" : "opacity-50"
                        }
                        aria-hidden="true"
                      />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {badge != null && (
                    <SidebarMenuBadge>{badge}</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="mb-6 px-5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex size-6 items-center justify-center rounded-[4px] bg-black">
                  <span className="sr-only">Favorble</span>
                </div>
                <span className="text-[15px] font-semibold tracking-[-0.3px] text-[#171717]">
                  Favorble
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {renderNavSection("Overview", overviewNav)}
        {renderNavSection("Tools", toolsNav)}
        {renderNavSection("Settings", settingsNav)}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
