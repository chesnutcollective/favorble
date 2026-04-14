"use server";

import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { communications, users } from "@/db/schema";

type UserRole =
  | "admin"
  | "attorney"
  | "case_manager"
  | "filing_agent"
  | "intake_agent"
  | "mail_clerk"
  | "medical_records"
  | "phi_sheet_writer"
  | "reviewer"
  | "viewer";

const VALID_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  "admin",
  "attorney",
  "case_manager",
  "filing_agent",
  "intake_agent",
  "mail_clerk",
  "medical_records",
  "phi_sheet_writer",
  "reviewer",
  "viewer",
]);

function coerceRole(role: string | null | undefined): UserRole | null {
  if (!role) return null;
  return VALID_ROLES.has(role as UserRole) ? (role as UserRole) : null;
}
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LeaderboardPeriod = "7" | "30" | "90" | "365";

export type MessagingFrequencyRow = {
  userId: string;
  name: string;
  role: string | null;
  team: string | null;
  totalMessages: number;
  days: number;
  messagesPerDay: number;
};

export type ResponseTimeRow = {
  userId: string;
  name: string;
  role: string | null;
  team: string | null;
  respondedCount: number;
  avgResponseSeconds: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePeriod(period: string | undefined): number {
  switch (period) {
    case "7":
      return 7;
    case "30":
      return 30;
    case "90":
      return 90;
    case "365":
      return 365;
    default:
      return 30;
  }
}

function periodStart(days: number): Date {
  return new Date(Date.now() - days * 86400 * 1000);
}

/**
 * Detect whether a column exists on a table. We use this to gate the
 * messaging/response-time queries on newer columns (fromUserId,
 * respondedAt, responseTimeSeconds) that may not yet be migrated in
 * every environment.
 */
async function columnExists(
  table: string,
  column: string,
): Promise<boolean> {
  try {
    const result = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${table}
          AND column_name = ${column}
      ) AS exists
    `);
    const rows = result as unknown as Array<{ exists: boolean }>;
    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Messaging frequency
// ---------------------------------------------------------------------------

/**
 * Messages sent per staff member per day over the given period.
 *
 * The ideal source column is `communications.fromUserId`, but if that
 * migration hasn't landed yet we fall back to the existing `user_id`
 * column (the historical "who recorded this" field).
 */
export async function getMessagingFrequencyLeaderboard(
  period: string,
  roleFilter?: string | null,
): Promise<MessagingFrequencyRow[]> {
  const session = await requireSession();
  const days = parsePeriod(period);
  const since = periodStart(days);

  try {
    const hasFromUserId = await columnExists("communications", "from_user_id");
    const senderColumn = hasFromUserId
      ? sql`${communications}.from_user_id`
      : sql`${communications}.user_id`;

    const role = coerceRole(roleFilter);
    const roleConds = [
      eq(users.organizationId, session.organizationId),
      isNull(users.deletedAt),
    ];
    if (role) {
      roleConds.push(eq(users.role, role));
    }

    const rows = await db.execute<{
      user_id: string;
      first_name: string;
      last_name: string;
      role: string;
      team: string | null;
      total_messages: string | number;
    }>(sql`
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.role,
        u.team,
        COUNT(c.id)::bigint AS total_messages
      FROM users u
      LEFT JOIN communications c
        ON c.organization_id = ${session.organizationId}
        AND ${senderColumn} = u.id
        AND c.created_at >= ${since.toISOString()}
      WHERE ${and(...roleConds)}
      GROUP BY u.id, u.first_name, u.last_name, u.role, u.team
      ORDER BY total_messages DESC, u.last_name ASC
    `);

    const list = rows as unknown as Array<{
      user_id: string;
      first_name: string;
      last_name: string;
      role: string;
      team: string | null;
      total_messages: string | number;
    }>;

    return list.map((r) => {
      const total = Number(r.total_messages) || 0;
      return {
        userId: r.user_id,
        name: `${r.first_name} ${r.last_name}`.trim(),
        role: r.role,
        team: r.team,
        totalMessages: total,
        days,
        messagesPerDay: Math.round((total / days) * 10) / 10,
      };
    });
  } catch (error) {
    logger.error("Failed to load messaging-frequency leaderboard", {
      period,
      error,
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Response time
// ---------------------------------------------------------------------------

/**
 * Average response time (seconds) per staff member over the given period.
 *
 * Requires `communications.responded_at`, `communications.responded_by`,
 * and `communications.response_time_seconds`. If those columns are
 * missing (pre-migration), we return an empty array so the UI can
 * render a "no data yet" state.
 */
export async function getResponseTimeLeaderboard(
  period: string,
  roleFilter?: string | null,
): Promise<ResponseTimeRow[]> {
  const session = await requireSession();
  const days = parsePeriod(period);
  const since = periodStart(days);

  try {
    const [hasRespondedAt, hasRespondedBy, hasResponseTime] = await Promise.all([
      columnExists("communications", "responded_at"),
      columnExists("communications", "responded_by"),
      columnExists("communications", "response_time_seconds"),
    ]);
    if (!hasRespondedAt || !hasRespondedBy || !hasResponseTime) {
      return [];
    }

    const role = coerceRole(roleFilter);
    const roleConds = [
      eq(users.organizationId, session.organizationId),
      isNull(users.deletedAt),
    ];
    if (role) {
      roleConds.push(eq(users.role, role));
    }

    const rows = await db.execute<{
      user_id: string;
      first_name: string;
      last_name: string;
      role: string;
      team: string | null;
      responded_count: string | number;
      avg_seconds: string | number | null;
    }>(sql`
      SELECT
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.role,
        u.team,
        COUNT(c.id)::bigint AS responded_count,
        AVG(c.response_time_seconds)::float8 AS avg_seconds
      FROM users u
      INNER JOIN communications c
        ON c.organization_id = ${session.organizationId}
        AND c.responded_by = u.id
        AND c.responded_at IS NOT NULL
        AND c.responded_at >= ${since.toISOString()}
      WHERE ${and(...roleConds)}
      GROUP BY u.id, u.first_name, u.last_name, u.role, u.team
      HAVING COUNT(c.id) > 0
      ORDER BY avg_seconds ASC, responded_count DESC
    `);

    const list = rows as unknown as Array<{
      user_id: string;
      first_name: string;
      last_name: string;
      role: string;
      team: string | null;
      responded_count: string | number;
      avg_seconds: string | number | null;
    }>;

    return list.map((r) => ({
      userId: r.user_id,
      name: `${r.first_name} ${r.last_name}`.trim(),
      role: r.role,
      team: r.team,
      respondedCount: Number(r.responded_count) || 0,
      avgResponseSeconds: Math.round(Number(r.avg_seconds ?? 0)),
    }));
  } catch (error) {
    logger.error("Failed to load response-time leaderboard", {
      period,
      error,
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Composite (default)
// ---------------------------------------------------------------------------

export type CompositeLeaderboardRow = {
  userId: string;
  name: string;
  role: string | null;
  team: string | null;
  messages: number;
  respondedCount: number;
};

/**
 * The existing "single composite view" — one row per active staff member
 * with basic activity signals. Preserved so the existing page chrome
 * has a stable default tab.
 */
export async function getCompositeLeaderboard(
  period: string,
  roleFilter?: string | null,
): Promise<CompositeLeaderboardRow[]> {
  const session = await requireSession();
  const days = parsePeriod(period);
  const since = periodStart(days);

  try {
    const role = coerceRole(roleFilter);
    const msgRows = await db
      .select({
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        team: users.team,
        messages: sql<number>`COUNT(${communications.id})::int`,
      })
      .from(users)
      .leftJoin(
        communications,
        and(
          eq(communications.userId, users.id),
          eq(communications.organizationId, session.organizationId),
          gte(communications.createdAt, since),
        ),
      )
      .where(
        and(
          eq(users.organizationId, session.organizationId),
          isNull(users.deletedAt),
          role ? eq(users.role, role) : undefined,
        ),
      )
      .groupBy(
        users.id,
        users.firstName,
        users.lastName,
        users.role,
        users.team,
      )
      .orderBy(desc(sql`COUNT(${communications.id})`));

    return msgRows.map((r) => ({
      userId: r.userId,
      name: `${r.firstName} ${r.lastName}`.trim(),
      role: r.role,
      team: r.team,
      messages: Number(r.messages) || 0,
      respondedCount: 0,
    }));
  } catch (error) {
    logger.error("Failed to load composite leaderboard", { period, error });
    return [];
  }
}
