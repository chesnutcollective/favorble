import "server-only";
import { db } from "@/db/drizzle";
import {
  ereJobs,
  documentProcessingResults,
  medicalChronologyEntries,
  users,
  auditLog,
  cases,
  documents,
} from "@/db/schema";
import { desc, eq, isNotNull } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

export type ActivityItem = {
  id: string;
  timestamp: string; // ISO
  category: "ere" | "langextract" | "user" | "case" | "document" | "system";
  status: "ok" | "warn" | "bad" | "info";
  iconLabel: string; // 2-letter abbreviation like "LE", "DB", "ER"
  message: string; // main line, can include simple HTML-safe formatting
  detail: string | null; // sub-line, often technical detail
};

const DEFAULT_LIMIT = 12;
const PER_SOURCE_LIMIT = 10;
const CHRONOLOGY_LIMIT = 5;

/**
 * Fetch recent ERE scrape job activity.
 * Joins cases for the case number.
 */
async function fetchEreJobActivity(): Promise<ActivityItem[]> {
  try {
    const rows = await db
      .select({
        id: ereJobs.id,
        status: ereJobs.status,
        errorMessage: ereJobs.errorMessage,
        documentsFound: ereJobs.documentsFound,
        documentsDownloaded: ereJobs.documentsDownloaded,
        createdAt: ereJobs.createdAt,
        completedAt: ereJobs.completedAt,
        startedAt: ereJobs.startedAt,
        caseNumber: cases.caseNumber,
      })
      .from(ereJobs)
      .leftJoin(cases, eq(cases.id, ereJobs.caseId))
      .orderBy(desc(ereJobs.createdAt))
      .limit(PER_SOURCE_LIMIT);

    return rows.map((row): ActivityItem => {
      const caseLabel = row.caseNumber ?? "(unknown case)";
      const timestamp = (
        row.completedAt ??
        row.startedAt ??
        row.createdAt
      ).toISOString();

      if (row.status === "completed") {
        const counts =
          row.documentsDownloaded != null || row.documentsFound != null
            ? `${row.documentsDownloaded ?? 0}/${row.documentsFound ?? 0} documents`
            : null;
        return {
          id: `ere-${row.id}`,
          timestamp,
          category: "ere",
          status: "ok",
          iconLabel: "ER",
          message: `ERE scrape completed for case ${caseLabel}`,
          detail: counts,
        };
      }

      if (row.status === "failed") {
        return {
          id: `ere-${row.id}`,
          timestamp,
          category: "ere",
          status: "bad",
          iconLabel: "ER",
          message: `ERE scrape failed for case ${caseLabel}`,
          detail: row.errorMessage ?? null,
        };
      }

      if (row.status === "running") {
        return {
          id: `ere-${row.id}`,
          timestamp,
          category: "ere",
          status: "info",
          iconLabel: "ER",
          message: `ERE scrape running for case ${caseLabel}`,
          detail: null,
        };
      }

      // pending or other
      return {
        id: `ere-${row.id}`,
        timestamp,
        category: "ere",
        status: "info",
        iconLabel: "ER",
        message: `ERE scrape queued for case ${caseLabel}`,
        detail: row.status,
      };
    });
  } catch (error) {
    logger.error("Failed to fetch ERE job activity", { error });
    return [];
  }
}

/**
 * Fetch recent LangExtract document processing runs.
 * Joins documents for the file name.
 */
async function fetchDocumentProcessingActivity(): Promise<ActivityItem[]> {
  try {
    const rows = await db
      .select({
        id: documentProcessingResults.id,
        status: documentProcessingResults.status,
        providerName: documentProcessingResults.providerName,
        processingTimeMs: documentProcessingResults.processingTimeMs,
        errorMessage: documentProcessingResults.errorMessage,
        createdAt: documentProcessingResults.createdAt,
        updatedAt: documentProcessingResults.updatedAt,
        fileName: documents.fileName,
      })
      .from(documentProcessingResults)
      .leftJoin(documents, eq(documents.id, documentProcessingResults.documentId))
      .orderBy(desc(documentProcessingResults.updatedAt))
      .limit(PER_SOURCE_LIMIT);

    return rows.map((row): ActivityItem => {
      const fileLabel = row.fileName ?? "(unknown file)";
      const timestamp = (row.updatedAt ?? row.createdAt).toISOString();

      if (row.status === "completed") {
        const detailParts: string[] = [];
        if (row.providerName) detailParts.push(row.providerName);
        if (row.processingTimeMs != null) {
          detailParts.push(`${row.processingTimeMs}ms`);
        }
        return {
          id: `docproc-${row.id}`,
          timestamp,
          category: "langextract",
          status: "ok",
          iconLabel: "LE",
          message: `LangExtract processed ${fileLabel}`,
          detail: detailParts.length > 0 ? detailParts.join(" · ") : null,
        };
      }

      if (row.status === "failed") {
        return {
          id: `docproc-${row.id}`,
          timestamp,
          category: "langextract",
          status: "bad",
          iconLabel: "LE",
          message: `LangExtract failed for ${fileLabel}`,
          detail: row.errorMessage ?? null,
        };
      }

      return {
        id: `docproc-${row.id}`,
        timestamp,
        category: "langextract",
        status: "info",
        iconLabel: "LE",
        message: `LangExtract ${row.status} for ${fileLabel}`,
        detail: null,
      };
    });
  } catch (error) {
    logger.error("Failed to fetch document processing activity", { error });
    return [];
  }
}

/**
 * Fetch recent medical chronology entries.
 * Joins documents for the source file name.
 */
async function fetchChronologyActivity(): Promise<ActivityItem[]> {
  try {
    const rows = await db
      .select({
        id: medicalChronologyEntries.id,
        summary: medicalChronologyEntries.summary,
        providerName: medicalChronologyEntries.providerName,
        createdAt: medicalChronologyEntries.createdAt,
        fileName: documents.fileName,
      })
      .from(medicalChronologyEntries)
      .leftJoin(
        documents,
        eq(documents.id, medicalChronologyEntries.sourceDocumentId),
      )
      .orderBy(desc(medicalChronologyEntries.createdAt))
      .limit(CHRONOLOGY_LIMIT);

    return rows.map((row): ActivityItem => {
      const fileLabel = row.fileName ?? "source document";
      return {
        id: `chron-${row.id}`,
        timestamp: row.createdAt.toISOString(),
        category: "document",
        status: "info",
        iconLabel: "MC",
        message: `Chronology entry created from ${fileLabel}`,
        detail: row.providerName ?? row.summary?.slice(0, 120) ?? null,
      };
    });
  } catch (error) {
    logger.error("Failed to fetch chronology activity", { error });
    return [];
  }
}

/**
 * Fetch recent user sign-ins (most recent lastLoginAt).
 */
async function fetchUserSignInActivity(): Promise<ActivityItem[]> {
  try {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(isNotNull(users.lastLoginAt))
      .orderBy(desc(users.lastLoginAt))
      .limit(PER_SOURCE_LIMIT);

    return rows
      .filter((row) => row.lastLoginAt != null)
      .map((row): ActivityItem => {
        const name = `${row.firstName} ${row.lastName}`.trim();
        return {
          id: `user-${row.id}-${row.lastLoginAt!.getTime()}`,
          timestamp: row.lastLoginAt!.toISOString(),
          category: "user",
          status: "info",
          iconLabel: "US",
          message: `User signed in: ${row.email}`,
          detail: name.length > 0 ? name : null,
        };
      });
  } catch (error) {
    logger.error("Failed to fetch user sign-in activity", { error });
    return [];
  }
}

/**
 * Fetch recent audit log events.
 */
async function fetchAuditLogActivity(): Promise<ActivityItem[]> {
  try {
    const rows = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        createdAt: auditLog.createdAt,
        userId: auditLog.userId,
      })
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(PER_SOURCE_LIMIT);

    return rows.map((row): ActivityItem => {
      const action = row.action.toLowerCase();
      const status: ActivityItem["status"] =
        action.includes("delete") || action.includes("fail")
          ? "warn"
          : "info";

      const category: ActivityItem["category"] = mapEntityTypeToCategory(
        row.entityType,
      );

      const verb = formatAuditAction(row.action);
      return {
        id: `audit-${row.id}`,
        timestamp: row.createdAt.toISOString(),
        category,
        status,
        iconLabel: "AU",
        message: `${verb} ${row.entityType}`,
        detail: `entity ${row.entityId.slice(0, 8)}…`,
      };
    });
  } catch (error) {
    logger.error("Failed to fetch audit log activity", { error });
    return [];
  }
}

function mapEntityTypeToCategory(
  entityType: string,
): ActivityItem["category"] {
  const t = entityType.toLowerCase();
  if (t.includes("case")) return "case";
  if (t.includes("document")) return "document";
  if (t.includes("user")) return "user";
  if (t.includes("ere")) return "ere";
  return "system";
}

function formatAuditAction(action: string): string {
  // Normalize "created", "CREATE", "case.created" -> "Created"
  const trimmed = action.replace(/^.*[._]/, "").toLowerCase();
  if (trimmed.length === 0) return action;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Fetch a merged real-time activity feed from multiple sources.
 *
 * Individual queries are isolated — a failure in one source will not
 * prevent the others from contributing. Empty tables simply contribute
 * nothing; no placeholder events are ever fabricated.
 */
export async function fetchActivityFeed(
  limit: number = DEFAULT_LIMIT,
): Promise<ActivityItem[]> {
  const [
    ereItems,
    docProcItems,
    chronItems,
    userItems,
    auditItems,
  ] = await Promise.all([
    fetchEreJobActivity(),
    fetchDocumentProcessingActivity(),
    fetchChronologyActivity(),
    fetchUserSignInActivity(),
    fetchAuditLogActivity(),
  ]);

  const merged = [
    ...ereItems,
    ...docProcItems,
    ...chronItems,
    ...userItems,
    ...auditItems,
  ];

  merged.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return merged.slice(0, limit);
}
