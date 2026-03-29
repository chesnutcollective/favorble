"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpDownIcon, Logout01Icon } from "@hugeicons/core-free-icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { logout } from "@/actions/auth";
import type { SessionUser } from "@/lib/auth/session";
import { ThemeSwitcher } from "./theme-switcher";

export function UserMenu({ user }: { user: SessionUser }) {
  const { isMobile } = useSidebar();
  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-7 w-7 rounded-full">
                <AvatarImage
                  src={user.avatarUrl || undefined}
                  alt={user.firstName}
                />
                <AvatarFallback className="rounded-full bg-[#EAEAEA] text-[11px] font-bold text-[#171717]">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold text-[#171717]">
                  {user.firstName} {user.lastName}
                </span>
                <span className="truncate text-xs text-[#999]">
                  {user.email}
                </span>
              </div>
              <HugeiconsIcon
                icon={ArrowUpDownIcon}
                size={16}
                className="ml-auto text-[#999]"
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-7 w-7 rounded-full">
                  <AvatarImage
                    src={user.avatarUrl || undefined}
                    alt={user.firstName}
                  />
                  <AvatarFallback className="rounded-full bg-[#EAEAEA] text-[11px] font-bold text-[#171717]">
                    {initials}
                  </AvatarFallback>
                </Avatar>
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
              <button type="button" className="w-full" onClick={() => logout()}>
                <HugeiconsIcon icon={Logout01Icon} />
                Sign out
              </button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
