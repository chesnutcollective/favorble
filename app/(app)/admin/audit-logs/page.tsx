import type { Metadata } from "next";
import {
  getAuditLogs,
  getAuditLogStats,
  getAuditLogUsers,
  type AuditLogFilters,
} from "@/app/actions/audit-logs";
import { AuditLogsClient } from "./client";

export const metadata: Metadata = {
  title: "Audit Logs",
};

type SearchParams = {
  userId?: string;
  entityType?: string;
  action?: string;
  range?: string;
  startDate?: string;
  endDate?: string;
  severity?: string;
  page?: string;
};

function resolveDateRange(params: SearchParams): {
  startDate?: string;
  endDate?: string;
} {
  if (params.startDate || params.endDate) {
    return { startDate: params.startDate, endDate: params.endDate };
  }

  const range = params.range ?? "7d";
  const now = new Date();
  const end = now.toISOString();

  if (range === "24h") {
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return { startDate: start.toISOString(), endDate: end };
  }
  if (range === "7d") {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { startDate: start.toISOString(), endDate: end };
  }
  if (range === "30d") {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { startDate: start.toISOString(), endDate: end };
  }
  if (range === "all") {
    return {};
  }

  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { startDate: start.toISOString(), endDate: end };
}

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const page = Math.max(Number(params.page ?? "1") || 1, 1);
  const { startDate, endDate } = resolveDateRange(params);

  const filters: AuditLogFilters = {
    userId: params.userId || undefined,
    entityType:
      params.entityType && params.entityType !== "all"
        ? params.entityType
        : undefined,
    actionPattern: params.action || undefined,
    startDate,
    endDate,
    page,
    pageSize: 50,
  };

  const [logsResult, stats, usersList] = await Promise.all([
    getAuditLogs(filters),
    getAuditLogStats(30),
    getAuditLogUsers(),
  ]);

  return (
    <AuditLogsClient
      initialLogs={logsResult.logs}
      totalCount={logsResult.totalCount}
      hasMore={logsResult.hasMore}
      stats={stats}
      users={usersList}
      initialFilters={{
        userId: params.userId ?? "",
        entityType: params.entityType ?? "all",
        action: params.action ?? "",
        range:
          params.range ??
          (params.startDate || params.endDate ? "custom" : "7d"),
        startDate: params.startDate ?? "",
        endDate: params.endDate ?? "",
        severity: params.severity ?? "all",
      }}
      currentPage={page}
      pageSize={50}
    />
  );
}
