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

const DEMO_USER: SessionUser = {
	id: "demo-user",
	organizationId: "demo-org",
	email: "admin@hogansmith.com",
	firstName: "Jake",
	lastName: "Admin",
	avatarUrl: null,
	role: "admin",
	team: "administration",
};

export async function getSession(): Promise<SessionUser | null> {
	// Demo mode — return hardcoded user immediately
	return DEMO_USER;
}

export async function requireSession(): Promise<SessionUser> {
	return DEMO_USER;
}
