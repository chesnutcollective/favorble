import "server-only";

import { logger } from "@/lib/logger/server";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.mycase.com/v2";
const DEFAULT_PER_PAGE = 50;

/** Minimum ms between API requests to avoid rate limiting. */
const RATE_LIMIT_DELAY_MS = 200;

/** Max retries on 429 / 5xx before giving up. */
const MAX_RETRIES = 3;

function getApiKey(): string {
  const key = process.env.MYCASE_API_KEY;
  if (!key) {
    throw new Error("MYCASE_API_KEY environment variable is not set");
  }
  return key;
}

/**
 * Check whether the MyCase integration is configured.
 */
export function isConfigured(): boolean {
  return !!process.env.MYCASE_API_KEY;
}

// ---------------------------------------------------------------------------
// Types — MyCase API responses
// ---------------------------------------------------------------------------

export interface MyCaseContact {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  company_name: string | null;
  contact_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface MyCaseCase {
  id: number;
  case_number: string;
  name: string;
  description: string | null;
  status: string;
  practice_area: string | null;
  open_date: string | null;
  close_date: string | null;
  statute_of_limitations: string | null;
  created_at: string;
  updated_at: string;
  contacts?: MyCaseContact[];
  custom_fields?: Record<string, string | null>;
}

export interface MyCaseLead {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  practice_area: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  custom_fields?: Record<string, string | null>;
}

export interface MyCaseTask {
  id: number;
  name: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  priority: string | null;
  case_id: number | null;
  assigned_to_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface MyCaseDocument {
  id: number;
  name: string;
  file_name: string;
  file_size: number | null;
  content_type: string | null;
  category: string | null;
  case_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface MyCaseUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string | null;
  active: boolean;
}

export interface MyCasePaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function myCaseFetch<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const apiKey = getApiKey();
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await rateLimit();

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
          Accept: "application/json",
        },
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter
          ? Number.parseInt(retryAfter, 10) * 1000
          : 5000 * (attempt + 1);
        logger.warn("MyCase rate limited, waiting", {
          attempt,
          waitMs,
          path,
        });
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      // Retry on server errors
      if (response.status >= 500) {
        const waitMs = 2000 * (attempt + 1);
        logger.warn("MyCase server error, retrying", {
          attempt,
          status: response.status,
          path,
        });
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `MyCase API ${response.status}: ${errorBody.slice(0, 500)}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        logger.warn("MyCase fetch error, retrying", {
          attempt,
          error: lastError.message,
          path,
        });
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }

  throw (
    lastError ?? new Error(`MyCase fetch failed after ${MAX_RETRIES} retries`)
  );
}

// ---------------------------------------------------------------------------
// Paginated fetchers
// ---------------------------------------------------------------------------

export interface FetchAllOptions {
  perPage?: number;
  /** Called after each page is fetched with (pageNumber, totalPages) */
  onProgress?: (page: number, totalPages: number) => void;
  /** If set, only fetch records updated after this ISO date string. */
  updatedSince?: string;
}

/**
 * Generic paginated fetcher. Walks all pages and yields combined results.
 */
async function fetchAllPages<T>(
  path: string,
  options?: FetchAllOptions,
): Promise<T[]> {
  const perPage = options?.perPage ?? DEFAULT_PER_PAGE;
  const all: T[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const params: Record<string, string | number> = {
      page,
      per_page: perPage,
    };

    if (options?.updatedSince) {
      params.updated_since = options.updatedSince;
    }

    const response = await myCaseFetch<MyCasePaginatedResponse<T>>(
      path,
      params,
    );

    all.push(...response.data);
    totalPages = response.meta.total_pages;
    options?.onProgress?.(page, totalPages);

    logger.info(`MyCase fetched ${path} page ${page}/${totalPages}`, {
      fetched: response.data.length,
      totalSoFar: all.length,
      totalCount: response.meta.total_count,
    });

    page++;
  } while (page <= totalPages);

  return all;
}

/**
 * Fetch all cases from MyCase.
 */
export async function fetchAllCases(
  options?: FetchAllOptions,
): Promise<MyCaseCase[]> {
  return fetchAllPages<MyCaseCase>("/cases", options);
}

/**
 * Fetch all contacts from MyCase.
 */
export async function fetchAllContacts(
  options?: FetchAllOptions,
): Promise<MyCaseContact[]> {
  return fetchAllPages<MyCaseContact>("/contacts", options);
}

/**
 * Fetch all leads from MyCase.
 */
export async function fetchAllLeads(
  options?: FetchAllOptions,
): Promise<MyCaseLead[]> {
  return fetchAllPages<MyCaseLead>("/leads", options);
}

/**
 * Fetch all tasks from MyCase.
 */
export async function fetchAllTasks(
  options?: FetchAllOptions,
): Promise<MyCaseTask[]> {
  return fetchAllPages<MyCaseTask>("/tasks", options);
}

/**
 * Fetch all documents (metadata only) from MyCase.
 */
export async function fetchAllDocuments(
  options?: FetchAllOptions,
): Promise<MyCaseDocument[]> {
  return fetchAllPages<MyCaseDocument>("/documents", options);
}

/**
 * Fetch all users from MyCase.
 */
export async function fetchAllUsers(
  options?: FetchAllOptions,
): Promise<MyCaseUser[]> {
  return fetchAllPages<MyCaseUser>("/users", options);
}

/**
 * Fetch a single case by ID (includes contacts and custom fields).
 */
export async function fetchCase(caseId: number): Promise<MyCaseCase> {
  return myCaseFetch<MyCaseCase>(`/cases/${caseId}`);
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

/**
 * Maps MyCase case status strings to Favorble's caseStatusEnum values.
 * Unmapped statuses default to "active".
 */
export function mapCaseStatus(
  myCaseStatus: string,
): "active" | "on_hold" | "closed_won" | "closed_lost" | "closed_withdrawn" {
  const s = myCaseStatus.toLowerCase().trim();

  if (s === "open" || s === "active" || s === "pending") return "active";
  if (s === "on hold" || s === "on_hold" || s === "paused") return "on_hold";
  if (s === "closed" || s === "closed - won" || s === "won")
    return "closed_won";
  if (s === "closed - lost" || s === "lost") return "closed_lost";
  if (s === "closed - withdrawn" || s === "withdrawn")
    return "closed_withdrawn";

  // Default: treat unknown as active so nothing is lost
  return "active";
}

/**
 * Maps MyCase lead status strings to Favorble's leadStatusEnum values.
 */
export function mapLeadStatus(
  myCaseStatus: string,
):
  | "new"
  | "contacted"
  | "intake_scheduled"
  | "intake_in_progress"
  | "contract_sent"
  | "contract_signed"
  | "converted"
  | "declined"
  | "unresponsive"
  | "disqualified" {
  const s = myCaseStatus.toLowerCase().trim();

  if (s === "new" || s === "pending") return "new";
  if (s === "contacted" || s === "in progress") return "contacted";
  if (s === "qualified") return "intake_scheduled";
  if (s === "converted" || s === "retained") return "converted";
  if (s === "declined" || s === "rejected") return "declined";
  if (s === "unresponsive" || s === "no response") return "unresponsive";
  if (s === "disqualified") return "disqualified";

  return "new";
}

// ---------------------------------------------------------------------------
// Incremental sync (for future scheduled use)
// ---------------------------------------------------------------------------

/**
 * Sync incremental changes from MyCase since a given timestamp.
 *
 * This is a placeholder for scheduled sync. It fetches only records updated
 * after `since` and returns them grouped by entity type. The caller is
 * responsible for upserting into the database.
 */
export async function syncIncrementalChanges(since: string): Promise<{
  cases: MyCaseCase[];
  contacts: MyCaseContact[];
  leads: MyCaseLead[];
  tasks: MyCaseTask[];
}> {
  const opts: FetchAllOptions = { updatedSince: since };

  logger.info("MyCase incremental sync starting", { since });

  const [cases, contacts, leads, tasks] = await Promise.all([
    fetchAllCases(opts),
    fetchAllContacts(opts),
    fetchAllLeads(opts),
    fetchAllTasks(opts),
  ]);

  logger.info("MyCase incremental sync complete", {
    cases: cases.length,
    contacts: contacts.length,
    leads: leads.length,
    tasks: tasks.length,
  });

  return { cases, contacts, leads, tasks };
}
