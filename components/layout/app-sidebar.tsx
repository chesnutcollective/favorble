"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
	LayoutDashboard,
	ListTodo,
	FolderOpen,
	GitBranch,
	Calendar,
	MessageSquare,
	Users,
	FileText,
	BarChart3,
	Settings,
	Workflow,
	Layers,
	FormInput,
	FileType,
	UserCog,
	Plug,
	ChevronDown,
} from "lucide-react";
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

const mainNav = [
	{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
	{ title: "My Queue", href: "/queue", icon: ListTodo },
	{ title: "Cases", href: "/cases", icon: FolderOpen },
	{ title: "Leads", href: "/leads", icon: GitBranch },
	{ title: "Calendar", href: "/calendar", icon: Calendar },
	{ title: "Messages", href: "/messages", icon: MessageSquare },
];

const secondaryNav = [
	{ title: "Contacts", href: "/contacts", icon: Users },
	{ title: "Documents", href: "/documents", icon: FileText },
	{ title: "Reports", href: "/reports", icon: BarChart3 },
];

const adminNav = [
	{ title: "Workflows", href: "/admin/workflows", icon: Workflow },
	{ title: "Stages", href: "/admin/stages", icon: Layers },
	{ title: "Fields", href: "/admin/fields", icon: FormInput },
	{ title: "Templates", href: "/admin/templates", icon: FileType },
	{ title: "Users", href: "/admin/users", icon: UserCog },
	{ title: "Integrations", href: "/admin/integrations", icon: Plug },
	{ title: "Settings", href: "/admin/settings", icon: Settings },
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
									<span className="font-semibold">Hogan Smith</span>
									<span className="text-xs opacity-60">CaseFlow</span>
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
											<item.icon />
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
											<item.icon />
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
										<ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
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
															<item.icon />
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
