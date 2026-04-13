/**
 * Shared types for the AI Review Queue UI (focus / table / canvas modes).
 * The same data shape feeds all three views; modes differ in presentation.
 */

export type ReviewMode = "focus" | "table" | "canvas";

export type StatusValue =
  | "pending"
  | "approved"
  | "rejected"
  | "needs-edit"
  | "all";

/** Mirrors the medical_entry_type Postgres enum in db/schema/enums.ts. */
export type EntryTypeValue =
  | "office_visit"
  | "hospitalization"
  | "emergency"
  | "lab_result"
  | "imaging"
  | "mental_health"
  | "physical_therapy"
  | "surgery"
  | "prescription"
  | "diagnosis"
  | "functional_assessment"
  | "other";

/**
 * The single source of truth for "what is the user looking at right now."
 * Bar grammar, chips, saved views, and URL state all serialize to/from this.
 */
export type ReviewQuery = {
  /** Free-text — matches summary/details/diagnoses[] via ILIKE. */
  text?: string;
  /** Case number (HS-XXXXX) or UUID. Fuzzy fallback is server-side. */
  case?: string;
  claimant?: string;
  provider?: string;
  facility?: string;
  /** Comma-separated diagnosis codes or substrings. */
  dx?: string[];
  med?: string[];
  type?: EntryTypeValue[];
  status?: StatusValue;
  /** Confidence comparator. e.g. {op:"<",value:60}. */
  confidence?: { op: "<" | "<=" | ">" | ">=" | "="; value: number };
  /** Event-date range, ISO yyyy-mm-dd. */
  eventDateFrom?: string;
  eventDateTo?: string;
  /** "pending:>7d" → minDaysPending=7. */
  minDaysPending?: number;
  /** Source PDF file name substring. */
  doc?: string;
  assignee?: "me" | string;
  reviewedBy?: string;
  /** Sort. Default low-confidence-first within case. */
  sort?: ReviewSort;
  page?: number;
  pageSize?: number;
};

export type ReviewSort =
  | "confidence_asc"
  | "confidence_desc"
  | "created_desc"
  | "created_asc"
  | "event_date_desc"
  | "event_date_asc"
  | "case_then_confidence";

export type FacetCounts = {
  status: { pending: number; approved: number; rejected: number };
  confidence: { low: number; medium: number; high: number; unknown: number };
  /** Top 8 cases by pending count. */
  topCases: Array<{ caseId: string; caseNumber: string; pending: number }>;
  /** Top 8 providers by pending count. */
  topProviders: Array<{ name: string; pending: number }>;
  /** Top entry types by count. */
  topTypes: Array<{ type: string; count: number }>;
};

/**
 * A saved view = a labeled query + mode + (optional) sort override.
 * Seeded views are immutable; user views are stored per-user.
 */
export type SavedView = {
  id: string;
  label: string;
  /** "seeded" cannot be edited/deleted; "user" can. */
  kind: "seeded" | "user";
  query: ReviewQuery;
  mode?: ReviewMode;
  /** Lucide icon name (rendered by the rail). */
  icon?: string;
};
