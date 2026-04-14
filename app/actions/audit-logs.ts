"use server";

import { db } from "@/db/drizzle";
import { auditLog, users } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

export type AuditLogFilters = {
  userId?: string;
  entityType?: string;
  actionPattern?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
};

export type AuditLogEntry = {
  id: string;
  organizationId: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl: string | null;
  } | null;
};

export type AuditLogListResult = {
  logs: AuditLogEntry[];
  totalCount: number;
  hasMore: boolean;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

function buildWhereClause(organizationId: string, filters: AuditLogFilters) {
  const conditions = [eq(auditLog.organizationId, organizationId)];

  if (filters.userId) {
    conditions.push(eq(auditLog.userId, filters.userId));
  }

  if (filters.entityType && filters.entityType !== "all") {
    conditions.push(eq(auditLog.entityType, filters.entityType));
  }

  if (filters.actionPattern) {
    conditions.push(ilike(auditLog.action, `%${filters.actionPattern}%`));
  }

  if (filters.startDate) {
    const start = new Date(filters.startDate);
    if (!Number.isNaN(start.getTime())) {
      conditions.push(gte(auditLog.createdAt, start));
    }
  }

  if (filters.endDate) {
    const end = new Date(filters.endDate);
    if (!Number.isNaN(end.getTime())) {
      conditions.push(lte(auditLog.createdAt, end));
    }
  }

  return and(...conditions);
}

export async function getAuditLogs(
  filters: AuditLogFilters = {},
): Promise<AuditLogListResult> {
  const session = await requireSession();

  const pageSize = Math.min(
    Math.max(filters.pageSize ?? DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const page = Math.max(filters.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  const whereClause = buildWhereClause(session.organizationId, filters);

  try {
    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: auditLog.id,
          organizationId: auditLog.organizationId,
          userId: auditLog.userId,
          entityType: auditLog.entityType,
          entityId: auditLog.entityId,
          action: auditLog.action,
          changes: auditLog.changes,
          metadata: auditLog.metadata,
          ipAddress: auditLog.ipAddress,
          createdAt: auditLog.createdAt,
          userFirstName: users.firstName,
          userLastName: users.lastName,
          userEmail: users.email,
          userAvatarUrl: users.avatarUrl,
          userIdJoined: users.id,
        })
        .from(auditLog)
        .leftJoin(users, eq(auditLog.userId, users.id))
        .where(whereClause)
        .orderBy(desc(auditLog.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLog)
        .where(whereClause),
    ]);

    const totalCount = Number(totalRow[0]?.count ?? 0);

    const logs: AuditLogEntry[] = rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      userId: r.userId,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      changes: (r.changes as Record<string, unknown> | null) ?? null,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt.toISOString(),
      user: r.userIdJoined
        ? {
            id: r.userIdJoined,
            firstName: r.userFirstName ?? "",
            lastName: r.userLastName ?? "",
            email: r.userEmail ?? "",
            avatarUrl: r.userAvatarUrl ?? null,
          }
        : null,
    }));

    return {
      logs,
      totalCount,
      hasMore: offset + logs.length < totalCount,
    };
  } catch (error) {
    logger.error("Failed to load audit logs", { error });
    return { logs: [], totalCount: 0, hasMore: false };
  }
}

export type AuditLogStats = {
  totalEntries: number;
  entriesToday: number;
  byEntityType: Record<string, number>;
  byAction: Record<string, number>;
  byUser: Array<{
    userId: string | null;
    name: string;
    count: number;
  }>;
  mostActiveUser: { name: string; count: number } | null;
  mostActiveEntityType: { entityType: string; count: number } | null;
  peakHour: number;
};

export async function getAuditLogStats(
  periodDays = 30,
): Promise<AuditLogStats> {
  const session = await requireSession();

  const since = new Date();
  since.setDate(since.getDate() - periodDays);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const orgCondition = eq(auditLog.organizationId, session.organizationId);
  const periodCondition = and(orgCondition, gte(auditLog.createdAt, since));

  try {
    const [
      totalRow,
      todayRow,
      byEntityTypeRows,
      byActionRows,
      byUserRows,
      peakHourRows,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLog)
        .where(periodCondition),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLog)
        .where(and(orgCondition, gte(auditLog.createdAt, startOfToday))),
      db
        .select({
          entityType: auditLog.entityType,
          count: sql<number>`count(*)::int`,
        })
        .from(auditLog)
        .where(periodCondition)
        .groupBy(auditLog.entityType)
        .orderBy(sql`count(*) desc`),
      db
        .select({
          action: auditLog.action,
          count: sql<number>`count(*)::int`,
        })
        .from(auditLog)
        .where(periodCondition)
        .groupBy(auditLog.action)
        .orderBy(sql`count(*) desc`)
        .limit(20),
      db
        .select({
          userId: auditLog.userId,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          count: sql<number>`count(*)::int`,
        })
        .from(auditLog)
        .leftJoin(users, eq(auditLog.userId, users.id))
        .where(periodCondition)
        .groupBy(auditLog.userId, users.firstName, users.lastName, users.email)
        .orderBy(sql`count(*) desc`)
        .limit(10),
      db
        .select({
          hour: sql<number>`extract(hour from ${auditLog.createdAt})::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(auditLog)
        .where(periodCondition)
        .groupBy(sql`extract(hour from ${auditLog.createdAt})`)
        .orderBy(sql`count(*) desc`)
        .limit(1),
    ]);

    const byEntityType: Record<string, number> = {};
    for (const row of byEntityTypeRows) {
      byEntityType[row.entityType] = Number(row.count);
    }

    const byAction: Record<string, number> = {};
    for (const row of byActionRows) {
      byAction[row.action] = Number(row.count);
    }

    const byUser = byUserRows.map((row) => {
      const name =
        row.firstName || row.lastName
          ? `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim()
          : (row.email ?? "System");
      return {
        userId: row.userId,
        name,
        count: Number(row.count),
      };
    });

    const topUser = byUser[0] ?? null;
    const topEntity = byEntityTypeRows[0] ?? null;

    return {
      totalEntries: Number(totalRow[0]?.count ?? 0),
      entriesToday: Number(todayRow[0]?.count ?? 0),
      byEntityType,
      byAction,
      byUser,
      mostActiveUser: topUser
        ? { name: topUser.name, count: topUser.count }
        : null,
      mostActiveEntityType: topEntity
        ? {
            entityType: topEntity.entityType,
            count: Number(topEntity.count),
          }
        : null,
      peakHour: Number(peakHourRows[0]?.hour ?? 0),
    };
  } catch (error) {
    logger.error("Failed to load audit log stats", { error });
    return {
      totalEntries: 0,
      entriesToday: 0,
      byEntityType: {},
      byAction: {},
      byUser: [],
      mostActiveUser: null,
      mostActiveEntityType: null,
      peakHour: 0,
    };
  }
}

export type AuditLogUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  count: number;
};

export async function getAuditLogUsers(): Promise<AuditLogUser[]> {
  const session = await requireSession();

  try {
    const rows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        count: sql<number>`count(${auditLog.id})::int`,
      })
      .from(auditLog)
      .innerJoin(users, eq(auditLog.userId, users.id))
      .where(eq(auditLog.organizationId, session.organizationId))
      .groupBy(users.id, users.firstName, users.lastName, users.email)
      .orderBy(users.lastName, users.firstName);

    return rows.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      count: Number(r.count),
    }));
  } catch (error) {
    logger.error("Failed to load audit log users", { error });
    return [];
  }
}

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportAuditLogsCsv(
  filters: AuditLogFilters = {},
): Promise<string> {
  const session = await requireSession();

  const whereClause = buildWhereClause(session.organizationId, filters);

  try {
    const rows = await db
      .select({
        id: auditLog.id,
        createdAt: auditLog.createdAt,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        ipAddress: auditLog.ipAddress,
        changes: auditLog.changes,
        metadata: auditLog.metadata,
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.userId, users.id))
      .where(whereClause)
      .orderBy(desc(auditLog.createdAt))
      .limit(10000);

    const header = [
      "id",
      "timestamp",
      "user_name",
      "user_email",
      "action",
      "entity_type",
      "entity_id",
      "ip_address",
      "changes",
      "metadata",
    ].join(",");

    const lines = rows.map((r) => {
      const userName =
        r.userFirstName || r.userLastName
          ? `${r.userFirstName ?? ""} ${r.userLastName ?? ""}`.trim()
          : "";
      return [
        escapeCsvField(r.id),
        escapeCsvField(r.createdAt.toISOString()),
        escapeCsvField(userName),
        escapeCsvField(r.userEmail ?? ""),
        escapeCsvField(r.action),
        escapeCsvField(r.entityType),
        escapeCsvField(r.entityId),
        escapeCsvField(r.ipAddress ?? ""),
        escapeCsvField(r.changes),
        escapeCsvField(r.metadata),
      ].join(",");
    });

    return [header, ...lines].join("\n");
  } catch (error) {
    logger.error("Failed to export audit logs", { error });
    return "";
  }
}
