import "server-only";
import { createClient } from "@/db/server";
import { db } from "@/db/drizzle";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export type SessionUser = {
	id: string;
	organizationId: string;
	email: string;
	firstName: string;
	lastName: string;
	avatarUrl: string | null;
	role: string;
	team: string | null;
};

export async function getSession(): Promise<SessionUser | null> {
	// Try real auth first
	try {
		const supabase = await createClient();
		const {
			data: { user: authUser },
		} = await supabase.auth.getUser();

		if (authUser) {
			const [appUser] = await db
				.select({
					id: users.id,
					organizationId: users.organizationId,
					email: users.email,
					firstName: users.firstName,
					lastName: users.lastName,
					avatarUrl: users.avatarUrl,
					role: users.role,
					team: users.team,
				})
				.from(users)
				.where(eq(users.authUserId, authUser.id))
				.limit(1);

			if (appUser) return appUser;
		}
	} catch {
		// Auth unavailable, fall through to demo user
	}

	// Return first admin user from DB as demo fallback
	try {
		const [adminUser] = await db
			.select({
				id: users.id,
				organizationId: users.organizationId,
				email: users.email,
				firstName: users.firstName,
				lastName: users.lastName,
				avatarUrl: users.avatarUrl,
				role: users.role,
				team: users.team,
			})
			.from(users)
			.where(eq(users.role, "admin"))
			.limit(1);

		if (adminUser) return adminUser;
	} catch {
		// DB unavailable
	}

	// Hardcoded fallback
	return {
		id: "demo-user",
		organizationId: "demo-org",
		email: "admin@hogansmith.com",
		firstName: "Jake",
		lastName: "Admin",
		avatarUrl: null,
		role: "admin",
		team: "administration",
	};
}

export async function requireSession(): Promise<SessionUser> {
	const session = await getSession();
	if (!session) {
		// Should never happen with demo fallback, but just in case
		return {
			id: "demo-user",
			organizationId: "demo-org",
			email: "admin@hogansmith.com",
			firstName: "Jake",
			lastName: "Admin",
			avatarUrl: null,
			role: "admin",
			team: "administration",
		};
	}
	return session;
}
