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
	const supabase = await createClient();
	const {
		data: { user: authUser },
	} = await supabase.auth.getUser();

	if (!authUser) {
		return null;
	}

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

	if (!appUser) {
		return null;
	}

	return appUser;
}

export async function requireSession(): Promise<SessionUser> {
	const session = await getSession();
	if (!session) {
		redirect("/login");
	}
	return session;
}
