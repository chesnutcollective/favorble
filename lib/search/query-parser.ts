/**
 * Parse a raw input string into structured search intent.
 *
 * Supports:
 *   - Scoped prefixes:   `case:`, `doc:`, `client:`/`contact:`, `lead:`,
 *                        `task:`, `email:`, `chat:`, `mail:`,
 *                        `billing:`, `trust:`, `@user`
 *   - Identifier auto-detection:
 *       HS-XXXXX case numbers
 *       SSA document IDs (A\d{7}[A-Z]\d{2}[A-Z]\d{5}[A-Z]\d{5})
 *       Bare 4 digits → SSN last-4 (role-gated downstream)
 *       ICD-10 codes  (A00, M54.16, F32.9, etc.)
 *       Email addresses
 *   - Facet filters:     `stage:4D`, `status:open`, `assigned:me`
 *   - Date language:     `today`, `this week`, `last month`,
 *                        `before:2024-01-01`, `after:2023`
 *
 * The parser is deliberately forgiving: unrecognized prefixes fall
 * back to plain text, identifiers are additive rather than exclusive,
 * and all output is validated before being handed to the SQL layer.
 */

import type { DateBucket, FacetFilter, ParsedQuery, QueryScope } from "./types";

const SCOPE_ALIASES: Record<string, QueryScope> = {
  case: "case",
  c: "case",
  contact: "contact",
  client: "contact",
  lead: "lead",
  l: "lead",
  user: "user",
  u: "user",
  doc: "document",
  document: "document",
  d: "document",
  chron: "chronology",
  chronology: "chronology",
  cal: "calendar",
  calendar: "calendar",
  event: "calendar",
  task: "task",
  t: "task",
  email: "communication",
  message: "communication",
  msg: "communication",
  chat: "chat",
  mail: "mail",
  bill: "billing",
  billing: "billing",
  trust: "trust",
};

const DATE_BUCKETS: Record<string, DateBucket> = {
  today: "today",
  "this week": "this_week",
  "this month": "this_month",
  "last 30 days": "last_30d",
  "last 30d": "last_30d",
  past: "past",
};

// ─── Identifier patterns ──────────────────────────────────────────

const RX = {
  caseNumber: /^HS-\d{4,6}$/i,
  ssaDocId: /^A\d{7}[A-Z]\d{2}[A-Z]\d{5}[A-Z]\d{5}$/,
  ssnLast4: /^\d{4}$/,
  icd10: /^[A-TV-Z]\d{2}(\.\d{1,4})?$/i,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  iso8601Date: /^\d{4}-\d{2}-\d{2}$/,
};

// ─── Public API ───────────────────────────────────────────────────

export function parseQuery(raw: string): ParsedQuery {
  const originalTrimmed = raw.trim();
  if (!originalTrimmed) {
    return { text: "", scope: "all", facets: [] };
  }

  // If the entire input is a recognized identifier, return it as a
  // direct-jump hint. The API will still run a normal search under it so
  // the palette can show related rows beneath the exact hit.
  const directId = detectDirectIdentifier(originalTrimmed);

  // Walk tokens left-to-right extracting prefixes + facets. Anything left
  // over is plain text for the BM25 query.
  let scope: QueryScope = "all";
  const facets: FacetFilter[] = [];
  let dateBucket: DateBucket | undefined;
  const textParts: string[] = [];

  // Multi-word date buckets first (e.g. "this week") — match longest.
  let remaining = originalTrimmed;
  for (const phrase of Object.keys(DATE_BUCKETS).sort(
    (a, b) => b.length - a.length,
  )) {
    const rx = new RegExp(`\\b${phrase}\\b`, "i");
    if (rx.test(remaining)) {
      dateBucket = DATE_BUCKETS[phrase];
      remaining = remaining.replace(rx, " ").trim();
      break;
    }
  }

  for (const rawTok of remaining.split(/\s+/)) {
    if (!rawTok) continue;
    const tok = rawTok.trim();
    if (!tok) continue;

    // @username or @email
    if (tok.startsWith("@") && tok.length > 1) {
      facets.push({ key: "assigned_or_owner", value: tok.slice(1) });
      continue;
    }

    // scoped prefix e.g. `case:`
    const colon = tok.indexOf(":");
    if (colon > 0 && colon < tok.length - 1) {
      const key = tok.slice(0, colon).toLowerCase();
      const value = tok.slice(colon + 1);

      // Scope prefix — switch scope and drop the token
      if (SCOPE_ALIASES[key] && !value) {
        scope = SCOPE_ALIASES[key];
        continue;
      }

      // Scope prefix with value: `case:HS-12345` → set scope + text
      if (SCOPE_ALIASES[key]) {
        scope = SCOPE_ALIASES[key];
        textParts.push(value);
        continue;
      }

      // Date range: `before:2024-01-01`, `after:2023`
      if (key === "before" || key === "after") {
        if (RX.iso8601Date.test(value)) {
          dateBucket = key === "before" ? { to: value } : { from: value };
        } else if (/^\d{4}$/.test(value)) {
          dateBucket =
            key === "before"
              ? { to: `${value}-12-31` }
              : { from: `${value}-01-01` };
        }
        continue;
      }

      // Generic facet: `stage:4D`, `status:open`, `assigned:me`,
      // `priority:high`, `reconciled:false`, etc.
      facets.push({ key, value });
      continue;
    }

    // Plain text token
    textParts.push(tok);
  }

  const text = textParts.join(" ").trim();

  return {
    text,
    scope,
    facets,
    dateBucket,
    directIdentifier: directId,
  };
}

function detectDirectIdentifier(raw: string):
  | {
      kind: "case_number" | "ssa_doc_id" | "ssn_last4" | "icd10" | "email";
      value: string;
    }
  | undefined {
  if (RX.caseNumber.test(raw))
    return { kind: "case_number", value: raw.toUpperCase() };
  if (RX.ssaDocId.test(raw)) return { kind: "ssa_doc_id", value: raw };
  if (RX.icd10.test(raw)) return { kind: "icd10", value: raw.toUpperCase() };
  if (RX.email.test(raw)) return { kind: "email", value: raw.toLowerCase() };
  if (RX.ssnLast4.test(raw)) return { kind: "ssn_last4", value: raw };
  return undefined;
}

/**
 * Convert a DateBucket to an inclusive `[from, to]` pair in ISO format.
 * Used by the SQL layer to build range predicates.
 */
export function dateBucketBounds(
  bucket: DateBucket | undefined,
): { from: string | null; to: string | null } | null {
  if (!bucket) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const startOfWeek = (d: Date) => {
    const out = new Date(d);
    const day = out.getDay();
    out.setDate(out.getDate() - day);
    out.setHours(0, 0, 0, 0);
    return out;
  };
  const endOfDay = (d: Date) => {
    const out = new Date(d);
    out.setHours(23, 59, 59, 999);
    return out;
  };

  if (typeof bucket === "object") {
    return { from: bucket.from ?? null, to: bucket.to ?? null };
  }

  switch (bucket) {
    case "today":
      return { from: today.toISOString(), to: endOfDay(today).toISOString() };
    case "this_week": {
      const start = startOfWeek(today);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { from: start.toISOString(), to: endOfDay(end).toISOString() };
    }
    case "this_month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: start.toISOString(), to: endOfDay(end).toISOString() };
    }
    case "last_30d": {
      const start = new Date(today);
      start.setDate(start.getDate() - 30);
      return { from: start.toISOString(), to: endOfDay(today).toISOString() };
    }
    case "past": {
      return { from: null, to: today.toISOString() };
    }
    default:
      return null;
  }
}
