import type { Metadata } from "next";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/db/drizzle";
import { users } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { UsersClient } from "./client";

export const metadata: Metadata = {
	title: "User Management",
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

	return (
		<UsersClient
			users={userRows.map((u) => ({
				...u,
				lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
			}))}
		/>
	);
}
