/**
 * Duplicate detection service (Wave 5).
 *
 * Detects potential duplicate leads and contacts so Intake Specialists can
 * catch repeat callers instead of creating parallel records. Scoring is
 * expressed as a confidence value in [0, 1]:
 *
 *   - Exact email match                                       -> 1.00
 *   - Exact phone match                                       -> 0.95
 *   - Same first+last name + DOB                              -> 0.90
 *   - Same first+last name + same email domain                -> 0.75
 *   - Fuzzy name match (soundex or levenshtein<=2) +
 *     matching phone area code                                -> 0.60
 *
 * A record can match multiple reasons; the highest confidence wins and all
 * applicable reasons are returned in `matchReasons`.
 *
 * This module is a companion to `lib/services/lead-dedup.ts`. That file powers
 * an existing 0-100 score path; this one implements the normalized
 * 0-1 confidence contract described in the Wave 5 spec and adds a contacts
 * path for claimant matching.
 */

import { db } from "@/db/drizzle";
import { leads, contacts } from "@/db/schema";
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";

// ─── Types ──────────────────────────────────────────────────────────────

export type DuplicateMatchReason =
  | "exact_email"
  | "exact_phone"
  | "name_and_dob"
  | "name_and_email_domain"
  | "fuzzy_name_and_area_code";

export type DuplicateInput = {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
};

export type DuplicateLeadMatch = {
  leadId: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  daysAgo: number;
  confidence: number;
  matchReasons: DuplicateMatchReason[];
};

export type DuplicateContactMatch = {
  contactId: string;
  name: string;
  email: string | null;
  phone: string | null;
  contactType: string;
  daysAgo: number;
  confidence: number;
  matchReasons: DuplicateMatchReason[];
};

// ─── Normalization helpers ──────────────────────────────────────────────

function normalizePhone(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/\D/g, "");
}

function phoneAreaCode(input: string | null | undefined): string {
  const digits = normalizePhone(input);
  // Strip US country code if present
  const local = digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;
  return local.slice(0, 3);
}

function normalizeEmail(input: string | null | undefined): string {
  if (!input) return "";
  return input.trim().toLowerCase();
}

function emailDomain(input: string | null | undefined): string {
  const normalized = normalizeEmail(input);
  const at = normalized.indexOf("@");
  return at === -1 ? "" : normalized.slice(at + 1);
}

function normalizeName(input: string | null | undefined): string {
  if (!input) return "";
  return input.trim().toLowerCase();
}

function daysBetween(from: Date, to: Date = new Date()): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

// ─── Levenshtein distance (inline, no deps) ─────────────────────────────

/**
 * Classic iterative DP Levenshtein distance.
 * Returns the minimum single-character edits to convert `a` to `b`.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

/**
 * Simple Soundex implementation used as a fuzzy-name fallback.
 */
export function soundex(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return "";

  const map: Record<string, string> = {
    B: "1", F: "1", P: "1", V: "1",
    C: "2", G: "2", J: "2", K: "2", Q: "2", S: "2", X: "2", Z: "2",
    D: "3", T: "3",
    L: "4",
    M: "5", N: "5",
    R: "6",
  };

  const first = s[0];
  let out = first;
  let prev = map[first] ?? "";

  for (let i = 1; i < s.length && out.length < 4; i++) {
    const code = map[s[i]] ?? "";
    if (code && code !== prev) out += code;
    if (s[i] !== "H" && s[i] !== "W") prev = code;
  }

  return (out + "000").slice(0, 4);
}

function namesAreFuzzyMatch(
  aFirst: string,
  aLast: string,
  bFirst: string,
  bLast: string,
): boolean {
  if (!aFirst || !aLast || !bFirst || !bLast) return false;
  if (aFirst === bFirst && aLast === bLast) return true;

  // Soundex on the last name is a cheap phonetic match.
  if (soundex(aLast) === soundex(bLast)) {
    // Also require the first name to be close (either exact or within 2 edits).
    if (aFirst === bFirst) return true;
    if (levenshtein(aFirst, bFirst) <= 2) return true;
  }

  // Pure edit-distance fallback (handles typos like "Jon"/"John").
  if (levenshtein(aFirst, bFirst) <= 2 && levenshtein(aLast, bLast) <= 2) {
    return true;
  }

  return false;
}

// ─── Candidate retrieval ────────────────────────────────────────────────

function buildNameWhere(
  firstNorm: string,
  lastNorm: string,
  table: typeof leads | typeof contacts,
) {
  // Use ilike with the first 3 chars of each name to pull a broader candidate
  // pool that we can score in JS. This lets levenshtein / soundex do the
  // actual work, while keeping the SQL cost bounded.
  const firstPrefix = firstNorm.slice(0, 3);
  const lastPrefix = lastNorm.slice(0, 3);
  if (!firstPrefix && !lastPrefix) return undefined;
  const clauses = [] as ReturnType<typeof ilike>[];
  if (firstPrefix) {
    clauses.push(ilike(table.firstName, `${firstPrefix}%`));
  }
  if (lastPrefix) {
    clauses.push(ilike(table.lastName, `${lastPrefix}%`));
  }
  return or(...clauses);
}

// ─── Scoring ────────────────────────────────────────────────────────────

function scoreLead(
  input: DuplicateInput,
  row: typeof leads.$inferSelect,
): { confidence: number; reasons: DuplicateMatchReason[] } {
  const reasons: DuplicateMatchReason[] = [];
  let confidence = 0;

  const inEmail = normalizeEmail(input.email);
  const inPhone = normalizePhone(input.phone);
  const inFirst = normalizeName(input.firstName);
  const inLast = normalizeName(input.lastName);
  const inDob = input.dateOfBirth ? input.dateOfBirth.trim() : "";
  const inDomain = emailDomain(input.email);
  const inArea = phoneAreaCode(input.phone);

  const candEmail = normalizeEmail(row.email);
  const candPhone = normalizePhone(row.phone);
  const candFirst = normalizeName(row.firstName);
  const candLast = normalizeName(row.lastName);
  const candIntake = (row.intakeData as Record<string, unknown>) ?? {};
  const candDob =
    typeof candIntake.dob === "string"
      ? candIntake.dob.trim()
      : typeof candIntake.dateOfBirth === "string"
        ? candIntake.dateOfBirth.trim()
        : "";
  const candDomain = emailDomain(row.email);
  const candArea = phoneAreaCode(row.phone);

  if (inEmail && candEmail && inEmail === candEmail) {
    confidence = Math.max(confidence, 1.0);
    reasons.push("exact_email");
  }
  if (inPhone && candPhone && inPhone === candPhone) {
    confidence = Math.max(confidence, 0.95);
    reasons.push("exact_phone");
  }
  if (
    inFirst &&
    inLast &&
    candFirst === inFirst &&
    candLast === inLast &&
    inDob &&
    candDob &&
    inDob === candDob
  ) {
    confidence = Math.max(confidence, 0.9);
    reasons.push("name_and_dob");
  }
  if (
    inFirst &&
    inLast &&
    candFirst === inFirst &&
    candLast === inLast &&
    inDomain &&
    candDomain &&
    inDomain === candDomain
  ) {
    confidence = Math.max(confidence, 0.75);
    reasons.push("name_and_email_domain");
  }
  if (
    namesAreFuzzyMatch(inFirst, inLast, candFirst, candLast) &&
    inArea &&
    candArea &&
    inArea === candArea
  ) {
    confidence = Math.max(confidence, 0.6);
    reasons.push("fuzzy_name_and_area_code");
  }

  return { confidence, reasons };
}

function scoreContact(
  input: DuplicateInput,
  row: typeof contacts.$inferSelect,
): { confidence: number; reasons: DuplicateMatchReason[] } {
  const reasons: DuplicateMatchReason[] = [];
  let confidence = 0;

  const inEmail = normalizeEmail(input.email);
  const inPhone = normalizePhone(input.phone);
  const inFirst = normalizeName(input.firstName);
  const inLast = normalizeName(input.lastName);
  const inDob = input.dateOfBirth ? input.dateOfBirth.trim() : "";
  const inDomain = emailDomain(input.email);
  const inArea = phoneAreaCode(input.phone);

  const candEmail = normalizeEmail(row.email);
  const candPhone = normalizePhone(row.phone);
  const candFirst = normalizeName(row.firstName);
  const candLast = normalizeName(row.lastName);
  const candMeta = (row.metadata as Record<string, unknown>) ?? {};
  const candDob =
    typeof candMeta.dob === "string"
      ? candMeta.dob.trim()
      : typeof candMeta.dateOfBirth === "string"
        ? candMeta.dateOfBirth.trim()
        : "";
  const candDomain = emailDomain(row.email);
  const candArea = phoneAreaCode(row.phone);

  if (inEmail && candEmail && inEmail === candEmail) {
    confidence = Math.max(confidence, 1.0);
    reasons.push("exact_email");
  }
  if (inPhone && candPhone && inPhone === candPhone) {
    confidence = Math.max(confidence, 0.95);
    reasons.push("exact_phone");
  }
  if (
    inFirst &&
    inLast &&
    candFirst === inFirst &&
    candLast === inLast &&
    inDob &&
    candDob &&
    inDob === candDob
  ) {
    confidence = Math.max(confidence, 0.9);
    reasons.push("name_and_dob");
  }
  if (
    inFirst &&
    inLast &&
    candFirst === inFirst &&
    candLast === inLast &&
    inDomain &&
    candDomain &&
    inDomain === candDomain
  ) {
    confidence = Math.max(confidence, 0.75);
    reasons.push("name_and_email_domain");
  }
  if (
    namesAreFuzzyMatch(inFirst, inLast, candFirst, candLast) &&
    inArea &&
    candArea &&
    inArea === candArea
  ) {
    confidence = Math.max(confidence, 0.6);
    reasons.push("fuzzy_name_and_area_code");
  }

  return { confidence, reasons };
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Find potential duplicate leads for the given input. Only returns matches
 * with confidence >= 0.60, sorted by confidence DESC.
 */
export async function findDuplicateLeads(
  input: DuplicateInput,
): Promise<DuplicateLeadMatch[]> {
  const session = await requireSession();

  const inEmail = normalizeEmail(input.email);
  const inPhone = normalizePhone(input.phone);
  const inFirst = normalizeName(input.firstName);
  const inLast = normalizeName(input.lastName);

  // Need at least a name to do anything useful.
  if (!inFirst && !inLast && !inEmail && !inPhone) return [];

  const orClauses = [] as Array<ReturnType<typeof eq> | ReturnType<typeof or>>;

  if (inEmail) {
    orClauses.push(sql`lower(${leads.email}) = ${inEmail}` as never);
  }
  if (inPhone) {
    orClauses.push(
      sql`regexp_replace(coalesce(${leads.phone}, ''), '\D', '', 'g') = ${inPhone}` as never,
    );
    // Also include rows sharing just the area code (for fuzzy scoring).
    const area = phoneAreaCode(input.phone);
    if (area) {
      orClauses.push(
        sql`substr(regexp_replace(coalesce(${leads.phone}, ''), '\D', '', 'g'), 1, 3) = ${area}` as never,
      );
    }
  }
  if (inFirst || inLast) {
    const nameWhere = buildNameWhere(inFirst, inLast, leads);
    if (nameWhere) orClauses.push(nameWhere as never);
  }

  if (orClauses.length === 0) return [];

  const rows = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.organizationId, session.organizationId),
        isNull(leads.deletedAt),
        or(...orClauses),
      ),
    )
    .limit(500);

  const results: DuplicateLeadMatch[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    const { confidence, reasons } = scoreLead(input, row);
    if (confidence < 0.6 || reasons.length === 0) continue;
    seen.add(row.id);

    results.push({
      leadId: row.id,
      name: `${row.firstName} ${row.lastName}`,
      email: row.email,
      phone: row.phone,
      status: row.status,
      daysAgo: daysBetween(row.createdAt),
      confidence,
      matchReasons: reasons,
    });
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

/**
 * Find potential duplicate contacts (claimants etc.) for the given input.
 * Same scoring rules as findDuplicateLeads.
 */
export async function findDuplicateContacts(
  input: DuplicateInput,
): Promise<DuplicateContactMatch[]> {
  const session = await requireSession();

  const inEmail = normalizeEmail(input.email);
  const inPhone = normalizePhone(input.phone);
  const inFirst = normalizeName(input.firstName);
  const inLast = normalizeName(input.lastName);

  if (!inFirst && !inLast && !inEmail && !inPhone) return [];

  const orClauses = [] as Array<ReturnType<typeof eq> | ReturnType<typeof or>>;

  if (inEmail) {
    orClauses.push(sql`lower(${contacts.email}) = ${inEmail}` as never);
  }
  if (inPhone) {
    orClauses.push(
      sql`regexp_replace(coalesce(${contacts.phone}, ''), '\D', '', 'g') = ${inPhone}` as never,
    );
    const area = phoneAreaCode(input.phone);
    if (area) {
      orClauses.push(
        sql`substr(regexp_replace(coalesce(${contacts.phone}, ''), '\D', '', 'g'), 1, 3) = ${area}` as never,
      );
    }
  }
  if (inFirst || inLast) {
    const nameWhere = buildNameWhere(inFirst, inLast, contacts);
    if (nameWhere) orClauses.push(nameWhere as never);
  }

  if (orClauses.length === 0) return [];

  const rows = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.organizationId, session.organizationId),
        isNull(contacts.deletedAt),
        or(...orClauses),
      ),
    )
    .limit(500);

  const results: DuplicateContactMatch[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    const { confidence, reasons } = scoreContact(input, row);
    if (confidence < 0.6 || reasons.length === 0) continue;
    seen.add(row.id);

    results.push({
      contactId: row.id,
      name: `${row.firstName} ${row.lastName}`,
      email: row.email,
      phone: row.phone,
      contactType: row.contactType,
      daysAgo: daysBetween(row.createdAt),
      confidence,
      matchReasons: reasons,
    });
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

/**
 * Human-readable label for a match reason.
 */
export function describeDuplicateReason(reason: DuplicateMatchReason): string {
  switch (reason) {
    case "exact_email":
      return "Exact email match";
    case "exact_phone":
      return "Exact phone match";
    case "name_and_dob":
      return "Same name and date of birth";
    case "name_and_email_domain":
      return "Same name and email domain";
    case "fuzzy_name_and_area_code":
      return "Similar name and same phone area code";
  }
}
