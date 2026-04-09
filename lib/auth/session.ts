import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
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

async function findOrCreateUser(
	clerkUserId: string,
): Promise<SessionUser | null> {
	// Look up user by Clerk auth ID
	const [existingUser] = await db
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
		.where(eq(users.authUserId, clerkUserId))
		.limit(1);

	if (existingUser) return existingUser;

	// User signed in via Clerk but doesn't exist in our DB yet.
	// Try to match by email from Clerk profile.
	const clerkUser = await currentUser();
	if (!clerkUser?.emailAddresses?.[0]?.emailAddress) return null;

	const email = clerkUser.emailAddresses[0].emailAddress;
	const [matchedByEmail] = await db
		.select({
			id: users.id,
			organizationId: users.organizationId,
			email: users.email,
			firstName: users.firstName,
			lastName: users.lastName,
			avatarUrl: users.avatarUrl,
			role: users.role,
			team: users.team,
			authUserId: users.authUserId,
		})
		.from(users)
		.where(eq(users.email, email))
		.limit(1);

	if (matchedByEmail) {
		// Link Clerk user to existing DB user
		if (!matchedByEmail.authUserId) {
			await db
				.update(users)
				.set({ authUserId: clerkUserId })
				.where(eq(users.id, matchedByEmail.id));
		}
		return matchedByEmail;
	}

	return null;
}

export async function getSession(): Promise<SessionUser | null> {
	const { userId } = await auth();
	if (!userId) return null;

	try {
		return await findOrCreateUser(userId);
	} catch {
		return null;
	}
}

export async function requireSession(): Promise<SessionUser> {
	const session = await getSession();
	if (!session) {
		redirect("/login");
	}
	return session;
}
