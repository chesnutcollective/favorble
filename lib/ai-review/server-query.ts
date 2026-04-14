import { sql } from "drizzle-orm";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
} from "drizzle-orm";
import {
  medicalChronologyEntries,
  documents,
  documentProcessingResults,
  cases,
  contacts,
  caseContacts,
} from "@/db/schema";
import type { ReviewQuery, ReviewSort } from "./types";

/**
 * Translate a ReviewQuery into a Drizzle WHERE expression. Used by the
 * server actions for both the list query and the facet aggregations.
 */
export function buildWhere(organizationId: string, q: ReviewQuery) {
  const conds = [
    eq(medicalChronologyEntries.organizationId, organizationId),
    eq(medicalChronologyEntries.aiGenerated, true),
  ];

  // Status — defaults to pending.
  const status = q.status ?? "pending";
  if (status === "pending") {
    conds.push(eq(medicalChronologyEntries.isVerified, false));
    conds.push(eq(medicalChronologyEntries.isExcluded, false));
  } else if (status === "approved") {
    conds.push(eq(medicalChronologyEntries.isVerified, true));
  } else if (status === "rejected") {
    conds.push(eq(medicalChronologyEntries.isExcluded, true));
  }
  // "needs-edit" and "all" → no extra constraint

  if (q.case) {
    // Match either the literal HS-XXXXX or the UUID.
    conds.push(
      or(
        ilike(cases.caseNumber, `%${q.case}%`),
        eq(medicalChronologyEntries.caseId, q.case),
      )!,
    );
  }
  if (q.claimant) {
    conds.push(
      or(
        ilike(contacts.firstName, `%${q.claimant}%`),
        ilike(contacts.lastName, `%${q.claimant}%`),
      )!,
    );
  }
  if (q.provider) {
    conds.push(ilike(medicalChronologyEntries.providerName, `%${q.provider}%`));
  }
  if (q.facility) {
    conds.push(ilike(medicalChronologyEntries.facilityName, `%${q.facility}%`));
  }
  if (q.dx?.length) {
    // Each requested code must appear in the diagnoses[] (case-insensitive).
    const diagPredicates = q.dx.map(
      (d) => sql`EXISTS (
        SELECT 1 FROM unnest(${medicalChronologyEntries.diagnoses}) AS dx
        WHERE dx ILIKE ${"%" + d + "%"}
      )`,
    );
    conds.push(and(...diagPredicates)!);
  }
  if (q.med?.length) {
    const medPredicates = q.med.map(
      (m) => sql`EXISTS (
        SELECT 1 FROM unnest(${medicalChronologyEntries.medications}) AS m
        WHERE m ILIKE ${"%" + m + "%"}
      )`,
    );
    conds.push(and(...medPredicates)!);
  }
  if (q.type?.length) {
    // Drizzle's enum column rejects a wider string union; the runtime
    // value is enum-safe (parser rejects unknown strings) so we cast.
    conds.push(
      inArray(
        medicalChronologyEntries.entryType,
        q.type as unknown as never[],
      ),
    );
  }
  if (q.confidence) {
    const v = q.confidence.value;
    const col = documentProcessingResults.aiConfidence;
    switch (q.confidence.op) {
      case "<":
        conds.push(lte(col, v - 1));
        break;
      case "<=":
        conds.push(lte(col, v));
        break;
      case ">":
        conds.push(gte(col, v + 1));
        break;
      case ">=":
        conds.push(gte(col, v));
        break;
      case "=":
        conds.push(eq(col, v));
        break;
    }
  }
  if (q.eventDateFrom) {
    conds.push(
      gte(medicalChronologyEntries.eventDate, new Date(q.eventDateFrom)),
    );
  }
  if (q.eventDateTo) {
    conds.push(
      lte(medicalChronologyEntries.eventDate, new Date(q.eventDateTo)),
    );
  }
  if (q.minDaysPending != null) {
    conds.push(
      sql`${medicalChronologyEntries.createdAt} <= now() - (${q.minDaysPending} || ' days')::interval`,
    );
  }
  if (q.doc) {
    conds.push(ilike(documents.fileName, `%${q.doc}%`));
  }
  if (q.text) {
    const term = `%${q.text}%`;
    conds.push(
      or(
        ilike(medicalChronologyEntries.summary, term),
        ilike(medicalChronologyEntries.details, term),
        sql`EXISTS (
          SELECT 1 FROM unnest(${medicalChronologyEntries.diagnoses}) AS d
          WHERE d ILIKE ${term}
        )`,
        sql`EXISTS (
          SELECT 1 FROM unnest(${medicalChronologyEntries.treatments}) AS t
          WHERE t ILIKE ${term}
        )`,
        sql`EXISTS (
          SELECT 1 FROM unnest(${medicalChronologyEntries.medications}) AS m
          WHERE m ILIKE ${term}
        )`,
      )!,
    );
  }

  return and(...conds);
}

/**
 * Map a ReviewSort to an ORDER BY clause. The default
 * ("case_then_confidence") drives the focus-mode next-entry algorithm:
 * stay in the same case, lowest confidence first, then oldest pending.
 */
export function buildOrderBy(sort: ReviewSort | undefined) {
  switch (sort) {
    case "confidence_asc":
      return [
        asc(
          sql`COALESCE(${documentProcessingResults.aiConfidence}, 0)`,
        ),
        asc(medicalChronologyEntries.createdAt),
      ];
    case "confidence_desc":
      return [
        desc(
          sql`COALESCE(${documentProcessingResults.aiConfidence}, 0)`,
        ),
        asc(medicalChronologyEntries.createdAt),
      ];
    case "created_desc":
      return [desc(medicalChronologyEntries.createdAt)];
    case "created_asc":
      return [asc(medicalChronologyEntries.createdAt)];
    case "event_date_desc":
      return [desc(medicalChronologyEntries.eventDate)];
    case "event_date_asc":
      return [asc(medicalChronologyEntries.eventDate)];
    case "case_then_confidence":
    default:
      return [
        asc(medicalChronologyEntries.caseId),
        asc(
          sql`COALESCE(${documentProcessingResults.aiConfidence}, 0)`,
        ),
        asc(medicalChronologyEntries.createdAt),
      ];
  }
}

/**
 * The standard join graph used by both list and facet queries. Centralized
 * so the WHERE expressions above can reference any of these aliases.
 */
export const REVIEW_JOIN_TABLES = {
  medicalChronologyEntries,
  documents,
  documentProcessingResults,
  cases,
  contacts,
  caseContacts,
};
