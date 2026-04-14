/**
 * Grammar parser for the AI Review Queue copilot bar.
 *
 * Bidirectional: parseQuery(string) → ReviewQuery and stringifyQuery(query) →
 * string, so chips can edit the bar and typing in the bar updates chips.
 *
 * Supported qualifiers (Gmail/GitHub-style):
 *   case:HS-05827           claimant:patricia
 *   provider:"dr. patel"    facility:"mt sinai"
 *   dx:M54.5,M51.16         med:gabapentin
 *   type:medication         status:pending
 *   confidence:<60          date:2026-01-01..2026-04-30
 *   pending:>7d             doc:discharge_summary.pdf
 *   assignee:me             reviewed-by:marc
 *
 * Unknown qualifiers are surfaced via parseQuery().unknown so the UI
 * can render a "did you mean?" inline error.
 */

import type {
  EntryTypeValue,
  ReviewQuery,
  StatusValue,
} from "./types";

export const KNOWN_QUALIFIERS = [
  "case",
  "claimant",
  "provider",
  "facility",
  "dx",
  "med",
  "type",
  "status",
  "confidence",
  "date",
  "pending",
  "doc",
  "assignee",
  "reviewed-by",
] as const;
export type Qualifier = (typeof KNOWN_QUALIFIERS)[number];

export const ENTRY_TYPES: EntryTypeValue[] = [
  "office_visit",
  "hospitalization",
  "emergency",
  "lab_result",
  "imaging",
  "mental_health",
  "physical_therapy",
  "surgery",
  "prescription",
  "diagnosis",
  "functional_assessment",
  "other",
];

export const STATUS_VALUES: StatusValue[] = [
  "pending",
  "approved",
  "rejected",
  "needs-edit",
  "all",
];

export type ParseResult = {
  query: ReviewQuery;
  /** Tokens that looked like qualifiers but weren't — for "did you mean?" */
  unknown: Array<{ raw: string; key: string; value: string }>;
};

/**
 * Tokenize the input. Quoted runs ("dr. patel") stay together; everything
 * else splits on whitespace. Order is preserved — useful for chip rendering.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of input) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (!inQuotes && /\s/.test(ch)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return s;
}

type ConfidenceFilter = NonNullable<ReviewQuery["confidence"]>;

function parseConfidence(raw: string): ConfidenceFilter | null {
  const m = raw.match(/^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const op = (m[1] ?? "=") as ConfidenceFilter["op"];
  let value = Number(m[2]);
  // Accept 0–1 fraction or 0–100 percent — normalize to 0–100.
  if (value <= 1) value = Math.round(value * 100);
  return { op, value };
}

function parseDateRange(
  raw: string,
): { from?: string; to?: string } | null {
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  if (raw.includes("..")) {
    const [from, to] = raw.split("..");
    if (from && !ISO.test(from)) return null;
    if (to && !ISO.test(to)) return null;
    return { from: from || undefined, to: to || undefined };
  }
  if (ISO.test(raw)) return { from: raw, to: raw };
  // Bare year shortcut.
  if (/^\d{4}$/.test(raw)) return { from: `${raw}-01-01`, to: `${raw}-12-31` };
  return null;
}

function parsePendingDays(raw: string): number | null {
  const m = raw.match(/^>?(\d+)d?$/);
  if (!m) return null;
  return Number(m[1]);
}

export function parseQuery(input: string): ParseResult {
  const query: ReviewQuery = {};
  const unknown: ParseResult["unknown"] = [];
  const freeText: string[] = [];

  for (const tok of tokenize(input)) {
    const colon = tok.indexOf(":");
    if (colon <= 0 || colon >= tok.length - 1) {
      freeText.push(unquote(tok));
      continue;
    }
    const key = tok.slice(0, colon).toLowerCase();
    const value = unquote(tok.slice(colon + 1));
    if (!value) {
      freeText.push(tok);
      continue;
    }

    switch (key) {
      case "case":
        query.case = value.toUpperCase();
        break;
      case "claimant":
        query.claimant = value;
        break;
      case "provider":
        query.provider = value;
        break;
      case "facility":
        query.facility = value;
        break;
      case "dx":
        query.dx = value.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "med":
        query.med = value.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "type": {
        const types = value
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter((s): s is EntryTypeValue =>
            (ENTRY_TYPES as string[]).includes(s),
          );
        if (types.length > 0) query.type = types;
        break;
      }
      case "status": {
        const v = value.toLowerCase();
        if ((STATUS_VALUES as string[]).includes(v)) {
          query.status = v as StatusValue;
        }
        break;
      }
      case "confidence": {
        const c = parseConfidence(value);
        if (c) query.confidence = c;
        break;
      }
      case "date": {
        const d = parseDateRange(value);
        if (d) {
          query.eventDateFrom = d.from;
          query.eventDateTo = d.to;
        }
        break;
      }
      case "pending": {
        const days = parsePendingDays(value);
        if (days != null) query.minDaysPending = days;
        break;
      }
      case "doc":
        query.doc = value;
        break;
      case "assignee":
        query.assignee = value as ReviewQuery["assignee"];
        break;
      case "reviewed-by":
      case "reviewedby":
        query.reviewedBy = value;
        break;
      default:
        unknown.push({ raw: tok, key, value });
        break;
    }
  }

  if (freeText.length > 0) query.text = freeText.join(" ");
  return { query, unknown };
}

/**
 * Render a query back to the canonical string form. Used to keep the input
 * synchronized when chips are added/removed.
 */
export function stringifyQuery(q: ReviewQuery): string {
  const parts: string[] = [];
  const quote = (v: string) => (/[\s"]/.test(v) ? `"${v}"` : v);

  if (q.case) parts.push(`case:${q.case}`);
  if (q.claimant) parts.push(`claimant:${quote(q.claimant)}`);
  if (q.provider) parts.push(`provider:${quote(q.provider)}`);
  if (q.facility) parts.push(`facility:${quote(q.facility)}`);
  if (q.dx?.length) parts.push(`dx:${q.dx.join(",")}`);
  if (q.med?.length) parts.push(`med:${q.med.join(",")}`);
  if (q.type?.length) parts.push(`type:${q.type.join(",")}`);
  if (q.status && q.status !== "pending") parts.push(`status:${q.status}`);
  if (q.confidence) {
    const op = q.confidence.op === "=" ? "" : q.confidence.op;
    parts.push(`confidence:${op}${q.confidence.value}`);
  }
  if (q.eventDateFrom || q.eventDateTo) {
    parts.push(`date:${q.eventDateFrom ?? ""}..${q.eventDateTo ?? ""}`);
  }
  if (q.minDaysPending != null) parts.push(`pending:>${q.minDaysPending}d`);
  if (q.doc) parts.push(`doc:${quote(q.doc)}`);
  if (q.assignee) parts.push(`assignee:${q.assignee}`);
  if (q.reviewedBy) parts.push(`reviewed-by:${q.reviewedBy}`);
  if (q.text) parts.push(q.text);
  return parts.join(" ");
}

/** Find the closest known qualifier — for the "did you mean?" suggestion. */
export function suggestQualifier(unknownKey: string): Qualifier | null {
  const k = unknownKey.toLowerCase();
  let best: { q: Qualifier; dist: number } | null = null;
  for (const q of KNOWN_QUALIFIERS) {
    const d = levenshtein(k, q);
    if (d <= 2 && (!best || d < best.dist)) best = { q, dist: d };
  }
  return best?.q ?? null;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1).fill(0);
  const v1 = new Array(b.length + 1).fill(0);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}
