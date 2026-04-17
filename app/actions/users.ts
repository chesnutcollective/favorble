"use server";

import { db } from "@/db/drizzle";
import { users } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

type UserRole =
  | "admin"
  | "attorney"
  | "case_manager"
  | "filing_agent"
  | "intake_agent"
  | "mail_clerk"
  | "medical_records"
  | "viewer";

type Team =
  | "intake"
  | "filing"
  | "medical_records"
  | "mail_sorting"
  | "case_management"
  | "hearings"
  | "administration";

/**
 * Invite (create) a new user in the organization.
 */
export async function inviteUser(data: {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  team?: Team;
}) {
  const session = await requireSession();

  const [user] = await db
    .insert(users)
    .values({
      organizationId: session.organizationId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      team: data.team ?? null,
    })
    .returning();

  logger.info("User invited", {
    userId: user.id,
    email: data.email,
  });

  revalidatePath("/admin/users");
  return user;
}

/**
 * Update a user's role and team.
 */
export async function updateUserRoleTeam(data: {
  userId: string;
  role: UserRole;
  team?: Team | null;
}) {
  const session = await requireSession();

  const [updated] = await db
    .update(users)
    .set({
      role: data.role,
      team: data.team ?? null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, data.userId))
    .returning();

  logger.info("User role/team updated", {
    userId: data.userId,
    role: data.role,
    team: data.team,
  });

  revalidatePath("/admin/users");
  return updated;
}

/**
 * Toggle a user's active status.
 */
export async function toggleUserActive(data: {
  userId: string;
  isActive: boolean;
}) {
  const session = await requireSession();

  const [updated] = await db
    .update(users)
    .set({
      isActive: data.isActive,
      updatedAt: new Date(),
    })
    .where(eq(users.id, data.userId))
    .returning();

  logger.info("User active status toggled", {
    userId: data.userId,
    isActive: data.isActive,
  });

  revalidatePath("/admin/users");
  return updated;
}

/**
 * Bulk deactivate users. Refuses to touch the caller themselves — use the
 * single toggle action if you need to step out of your own account.
 */
export async function bulkDeactivateUsers(userIds: string[]) {
  const session = await requireSession();
  if (userIds.length === 0) return { updated: 0 };

  const targetIds = userIds.filter((id) => id !== session.id);
  if (targetIds.length === 0) return { updated: 0 };

  const updated = await db
    .update(users)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        inArray(users.id, targetIds),
        eq(users.organizationId, session.organizationId),
      ),
    )
    .returning({ id: users.id });

  logger.info("Users bulk deactivated", {
    count: updated.length,
    requested: userIds.length,
  });

  revalidatePath("/admin/users");
  return { updated: updated.length };
}

/**
 * Bulk re-invite (reactivate) users. For this app "invite" == create a user
 * row, so re-inviting an existing inactive user really means flipping
 * `isActive` back to true. Hooking real Clerk invites can layer on later.
 */
export async function bulkReinviteUsers(userIds: string[]) {
  const session = await requireSession();
  if (userIds.length === 0) return { updated: 0 };

  const updated = await db
    .update(users)
    .set({ isActive: true, updatedAt: new Date() })
    .where(
      and(
        inArray(users.id, userIds),
        eq(users.organizationId, session.organizationId),
      ),
    )
    .returning({ id: users.id });

  logger.info("Users bulk reinvited", {
    count: updated.length,
    requested: userIds.length,
  });

  revalidatePath("/admin/users");
  return { updated: updated.length };
}
