// B4: inbox filter values. Keep in sync with the migration and the
// filter-strip client component. Lives outside "use server" so it can
// export pure helpers and runtime constants.

export const URGENCY_VALUES = ["low", "normal", "high", "urgent"] as const;
export type Urgency = (typeof URGENCY_VALUES)[number];

export const CATEGORY_VALUES = [
  "question",
  "document_request",
  "complaint",
  "status_update",
  "scheduling",
  "medical",
  "billing",
  "other",
] as const;
export type MessageCategory = (typeof CATEGORY_VALUES)[number];

export type MessageFilters = {
  urgency?: Urgency;
  category?: MessageCategory;
  /** When true, only returns messages that have not been read yet. */
  unreadOnly?: boolean;
  /** Limit (defaults to 100). */
  limit?: number;
};

function isUrgency(v: string | undefined): v is Urgency {
  return !!v && (URGENCY_VALUES as readonly string[]).includes(v);
}

function isCategory(v: string | undefined): v is MessageCategory {
  return !!v && (CATEGORY_VALUES as readonly string[]).includes(v);
}

/**
 * Parse raw string query params (e.g. from URL searchParams) into a
 * validated `MessageFilters` record. Unknown / out-of-range values are
 * dropped so the query stays well-formed.
 */
export function parseMessageFilters(raw: {
  urgency?: string;
  category?: string;
  unread?: string;
}): MessageFilters {
  const filters: MessageFilters = {};
  if (isUrgency(raw.urgency)) filters.urgency = raw.urgency;
  if (isCategory(raw.category)) filters.category = raw.category;
  if (raw.unread === "1" || raw.unread === "true") filters.unreadOnly = true;
  return filters;
}
