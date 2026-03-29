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

// Demo user — try to load the real admin from DB, fall back to hardcoded
let _cachedDemoUser: SessionUser | null = null;

async function getDemoUser(): Promise<SessionUser> {
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
  // Last resort: try raw SQL to avoid ORM initialization issues
  try {
    const pg = (await import("postgres")).default;
    const connStr = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
    if (connStr) {
      const sql = pg(connStr, { prepare: false, max: 1 });
      const rows =
        await sql`SELECT id, organization_id, email, first_name, last_name, avatar_url, role, team FROM users WHERE role = 'admin' LIMIT 1`;
      await sql.end();
      if (rows[0]) {
        const r = rows[0];
        _cachedDemoUser = {
          id: r.id,
          organizationId: r.organization_id,
          email: r.email,
          firstName: r.first_name,
          lastName: r.last_name,
          avatarUrl: r.avatar_url,
          role: r.role,
          team: r.team,
        };
        return _cachedDemoUser;
      }
    }
  } catch {
    // truly unavailable
  }
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

export async function getSession(): Promise<SessionUser | null> {
  return getDemoUser();
}

export async function requireSession(): Promise<SessionUser> {
  return getDemoUser();
}
