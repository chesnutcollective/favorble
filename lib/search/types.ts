/**
 * Shared types for the search subsystem.
 *
 * The search API is polymorphic: every result has a consistent shape
 * regardless of which entity type it came from. The UI renders rows
 * from this shape directly, with entity-specific icons and actions
 * resolved from `entityType`.
 */

export type EntityType =
  | "case"
  | "contact"
  | "lead"
  | "user"
  | "document"
  | "document_chunk"
  | "chronology_entry"
  | "calendar_event"
  | "task"
  | "communication"
  | "chat_message"
  | "outbound_mail"
  | "invoice"
  | "time_entry"
  | "expense"
  | "payment"
  | "trust_transaction"
  | "workflow"
  | "document_template"
  | "audit_log_entry";

/** Scoped prefix understood by the query parser. */
export type QueryScope =
  | "case"
  | "contact"
  | "lead"
  | "user"
  | "document"
  | "chronology"
  | "calendar"
  | "task"
  | "communication"
  | "chat"
  | "mail"
  | "billing"
  | "trust"
  | "all";

/** A single facet constraint. All facets AND together. */
export type FacetFilter = {
  key: string;
  value: string | string[] | number | boolean;
};

export type DateBucket =
  | "today"
  | "this_week"
  | "this_month"
  | "last_30d"
  | "past"
  | { from?: string; to?: string };

export type SearchRequest = {
  q: string;
  scope?: QueryScope;
  types?: EntityType[];
  facets?: FacetFilter[];
  dateBucket?: DateBucket;
  limit?: number;
  offset?: number;
  /** Set to `true` to enable semantic (vector) search. Defaults based on query length. */
  semantic?: boolean;
  /** Strict "internal staff chat only" toggle — must be explicit. */
  includeTeamChat?: boolean;
};

export type SearchMatchedField =
  | "title"
  | "subtitle"
  | "body"
  | "identifier"
  | "fuzzy_identifier"
  | "tag"
  | "facet";

export type SearchResult = {
  id: string;
  entityType: EntityType;
  entityId: string;
  title: string;
  subtitle: string | null;
  /** Optional first ~160 chars of body with the match highlighted. */
  snippet: string | null;
  /** Why this result came back — which field the match was on. */
  matchedField: SearchMatchedField;
  /** Deep link inside the app. */
  href: string;
  /** Raw denormalized facets for display. */
  facets: Record<string, unknown>;
  /** 0–1 normalized final score after RRF + boosts. */
  score: number;
  /** Per-ranker rank positions, useful for debugging. */
  ranks: { lexical?: number; semantic?: number };
};

export type SearchFacetCount = {
  key: string;
  value: string;
  count: number;
};

export type SearchResponse = {
  query: string;
  scope: QueryScope;
  totalHits: number;
  results: SearchResult[];
  /** Distinct facet values for the matched rows, scoped to the access-filtered set. */
  facets: SearchFacetCount[];
  /** Per-type result counts for the "group header" badges. */
  typeCounts: Record<EntityType, number>;
  /** Server-measured latency for the search, in ms. */
  latencyMs: number;
  /** True if the embedding worker was bypassed (fallback to lexical only). */
  semanticDisabled: boolean;
};

/** Parser output from a raw input string. */
export type ParsedQuery = {
  /** Cleaned query text (scope prefixes + identifier tokens stripped). */
  text: string;
  scope: QueryScope;
  /** If the whole query was a recognized identifier, a direct-jump hint. */
  directIdentifier?: {
    kind: "case_number" | "ssa_doc_id" | "ssn_last4" | "icd10" | "email";
    value: string;
  };
  facets: FacetFilter[];
  dateBucket?: DateBucket;
};

/** Per-type max rows in the final result list. Prevents one type from dominating. */
export const DEFAULT_TYPE_CAPS: Partial<Record<EntityType, number>> = {
  case: 6,
  contact: 5,
  lead: 5,
  user: 4,
  document: 5,
  document_chunk: 6,
  chronology_entry: 5,
  calendar_event: 4,
  task: 4,
  communication: 4,
  chat_message: 4,
  outbound_mail: 3,
  invoice: 3,
  time_entry: 3,
  expense: 3,
  trust_transaction: 3,
  workflow: 3,
  document_template: 3,
};
