import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { users } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserGroupIcon } from "@hugeicons/core-free-icons";

export const metadata: Metadata = {
	title: "User Management",
};

const ROLE_LABELS: Record<string, string> = {
	admin: "Admin",
	attorney: "Attorney",
	case_manager: "Case Manager",
	filing_agent: "Filing Agent",
	intake_agent: "Intake Agent",
	mail_clerk: "Mail Clerk",
	medical_records: "Medical Records",
	viewer: "Viewer",
};

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
	admin: "default",
	attorney: "default",
	case_manager: "secondary",
	filing_agent: "secondary",
	intake_agent: "secondary",
	mail_clerk: "outline",
	medical_records: "secondary",
	viewer: "outline",
};

const TEAM_LABELS: Record<string, string> = {
	intake: "Intake",
	filing: "Filing",
	medical_records: "Medical Records",
	mail_sorting: "Mail Sorting",
	case_management: "Case Mgmt",
	hearings: "Hearings",
	administration: "Admin",
};

export default async function UsersPage() {
	const session = await requireSession();

	let userRows: {
		id: string;
		firstName: string;
		lastName: string;
		email: string;
		role: string;
		team: string | null;
		isActive: boolean;
		lastLoginAt: Date | null;
	}[] = [];

	try {
		userRows = await db
			.select({
				id: users.id,
				firstName: users.firstName,
				lastName: users.lastName,
				email: users.email,
				role: users.role,
				team: users.team,
				isActive: users.isActive,
				lastLoginAt: users.lastLoginAt,
			})
			.from(users)
			.where(
				eq(users.organizationId, session.organizationId),
			)
			.orderBy(asc(users.lastName), asc(users.firstName));
	} catch {
		// DB unavailable
	}

	const activeUsers = userRows.filter((u) => u.isActive);
	const inactiveUsers = userRows.filter((u) => !u.isActive);

	return (
		<div className="space-y-6">
			<PageHeader
				title="Users & Teams"
				description="Manage user accounts, roles, and team assignments."
			/>

			<div className="flex items-center gap-4 text-sm text-muted-foreground">
				<span>{userRows.length} total users</span>
				<span>{activeUsers.length} active</span>
				{inactiveUsers.length > 0 && (
					<span>{inactiveUsers.length} inactive</span>
				)}
			</div>

			{userRows.length === 0 ? (
				<EmptyState
					icon={UserGroupIcon}
					title="No users found"
					description="No user accounts have been created for this organization."
				/>
			) : (
				<Card>
					<CardContent className="p-0">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Email</TableHead>
									<TableHead>Role</TableHead>
									<TableHead>Team</TableHead>
									<TableHead>Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{userRows.map((user) => (
									<TableRow key={user.id}>
										<TableCell className="font-medium">
											{user.firstName} {user.lastName}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{user.email}
										</TableCell>
										<TableCell>
											<Badge variant={ROLE_VARIANTS[user.role] ?? "outline"}>
												{ROLE_LABELS[user.role] ?? user.role}
											</Badge>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{user.team
												? TEAM_LABELS[user.team] ?? user.team
												: "---"}
										</TableCell>
										<TableCell>
											<Badge
												variant={user.isActive ? "outline" : "secondary"}
												className={
													user.isActive
														? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
														: ""
												}
											>
												{user.isActive ? "Active" : "Inactive"}
											</Badge>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
