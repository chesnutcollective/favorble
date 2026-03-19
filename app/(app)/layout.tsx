import { requireSession } from "@/lib/auth/session";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { cookies } from "next/headers";

export default async function AppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const user = await requireSession();
	const cookieStore = await cookies();
	const sidebarState = cookieStore.get("sidebar_state")?.value;
	const defaultOpen = sidebarState !== "false";

	return (
		<SidebarProvider defaultOpen={defaultOpen}>
			<AppSidebar user={user} />
			<SidebarInset>
				<Header />
				<div className="flex-1 overflow-auto p-4 md:p-6">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
