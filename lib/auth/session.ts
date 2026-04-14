import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { db } from "@/db/drizzle";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

const AUTH_ENABLED = process.env.ENABLE_CLERK_AUTH === "true";
const DEMO_SIGNED_OUT_COOKIE = "favorble_demo_signed_out";

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

let _cachedDemoUser: SessionUser | null = null;

async function getDemoUser(): Promise<SessionUser | null> {
  if (_cachedDemoUser) return _cachedDemoUser;
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
    if (adminUser) {
      _cachedDemoUser = adminUser;
      return adminUser;
    }
  } catch {
    // DB unavailable
  }
  return {
    id: "demo-user",
    organizationId: "demo-org",
    email: "admin@hogansmith.com",
    firstName: "Demo",
    lastName: "Admin",
    avatarUrl: null,
    role: "admin",
    team: "administration",
  };
}

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
  if (!AUTH_ENABLED) {
    // Demo mode — respect the sign-out cookie so the Sign Out button
    // actually produces a signed-out state on staging / local dev.
    const cookieStore = await cookies();
    if (cookieStore.get(DEMO_SIGNED_OUT_COOKIE)?.value === "1") {
      return null;
    }
    return getDemoUser();
  }
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
    if (AUTH_ENABLED) {
      redirect("/login");
    }
    // Should never reach here when auth is disabled — getDemoUser always returns
    throw new Error("Failed to load session");
  }
  return session;
}
