"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
	DashboardSquare01Icon,
	CheckListIcon,
	Folder01Icon,
	GitBranchIcon,
	Calendar01Icon,
	Message01Icon,
	UserGroupIcon,
	File01Icon,
	AnalyticsUpIcon,
	Settings01Icon,
	WorkflowSquare01Icon,
	Layers01Icon,
	TextField,
	FileAttachmentIcon,
	UserSettings01Icon,
	PlugSocketIcon,
	ArrowDown01Icon,
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
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	SidebarSeparator,
} from "@/components/ui/sidebar";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { UserMenu } from "./user-menu";
import type { SessionUser } from "@/lib/auth/session";

const mainNav: { title: string; href: string; icon: IconSvgElement }[] = [
	{ title: "Dashboard", href: "/dashboard", icon: DashboardSquare01Icon },
	{ title: "My Queue", href: "/queue", icon: CheckListIcon },
	{ title: "Cases", href: "/cases", icon: Folder01Icon },
	{ title: "Leads", href: "/leads", icon: GitBranchIcon },
	{ title: "Calendar", href: "/calendar", icon: Calendar01Icon },
	{ title: "Messages", href: "/messages", icon: Message01Icon },
];

const secondaryNav: { title: string; href: string; icon: IconSvgElement }[] = [
	{ title: "Contacts", href: "/contacts", icon: UserGroupIcon },
	{ title: "Documents", href: "/documents", icon: File01Icon },
	{ title: "Reports", href: "/reports", icon: AnalyticsUpIcon },
];

const adminNav: { title: string; href: string; icon: IconSvgElement }[] = [
	{ title: "Workflows", href: "/admin/workflows", icon: WorkflowSquare01Icon },
	{ title: "Stages", href: "/admin/stages", icon: Layers01Icon },
	{ title: "Fields", href: "/admin/fields", icon: TextField },
	{ title: "Templates", href: "/admin/templates", icon: FileAttachmentIcon },
	{ title: "Users", href: "/admin/users", icon: UserSettings01Icon },
	{ title: "Integrations", href: "/admin/integrations", icon: PlugSocketIcon },
	{ title: "Settings", href: "/admin/settings", icon: Settings01Icon },
];

export function AppSidebar({ user }: { user: SessionUser }) {
	const pathname = usePathname();
	const isAdmin = user.role === "admin";

	function isActive(href: string) {
		if (href === "/dashboard") return pathname === "/dashboard";
		return pathname.startsWith(href);
	}

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild>
							<Link href="/dashboard">
								<Image
									src="/hogansmith-logo.png"
									alt="Hogan Smith Law"
									width={32}
									height={32}
									className="size-8 rounded-md object-cover"
								/>
								<div className="flex flex-col gap-0.5 leading-none">
									<span className="font-semibold">Favorble</span>
									<span className="text-[10px] opacity-50">by Hogan Smith</span>
								</div>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{mainNav.map((item) => (
								<SidebarMenuItem key={item.href}>
									<SidebarMenuButton
										asChild
										isActive={isActive(item.href)}
										tooltip={item.title}
									>
										<Link href={item.href}>
											<HugeiconsIcon icon={item.icon} />
											<span>{item.title}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarSeparator />

				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{secondaryNav.map((item) => (
								<SidebarMenuItem key={item.href}>
									<SidebarMenuButton
										asChild
										isActive={isActive(item.href)}
										tooltip={item.title}
									>
										<Link href={item.href}>
											<HugeiconsIcon icon={item.icon} />
											<span>{item.title}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				{isAdmin && (
					<>
						<SidebarSeparator />
						<Collapsible defaultOpen className="group/collapsible">
							<SidebarGroup>
								<SidebarGroupLabel asChild>
									<CollapsibleTrigger className="flex w-full items-center">
										Admin
										<HugeiconsIcon icon={ArrowDown01Icon} size={16} className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
									</CollapsibleTrigger>
								</SidebarGroupLabel>
								<CollapsibleContent>
									<SidebarGroupContent>
										<SidebarMenu>
											{adminNav.map((item) => (
												<SidebarMenuItem key={item.href}>
													<SidebarMenuButton
														asChild
														isActive={isActive(item.href)}
														tooltip={item.title}
													>
														<Link href={item.href}>
															<HugeiconsIcon icon={item.icon} />
															<span>{item.title}</span>
														</Link>
													</SidebarMenuButton>
												</SidebarMenuItem>
											))}
										</SidebarMenu>
									</SidebarGroupContent>
								</CollapsibleContent>
							</SidebarGroup>
						</Collapsible>
					</>
				)}
			</SidebarContent>

			<SidebarFooter>
				<UserMenu user={user} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
