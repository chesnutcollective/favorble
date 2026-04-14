/**
 * Lead + contact deduplication service.
 *
 * Canonical duplicate-detection module. Exposes:
 *
 *   - `findDuplicateLeads(input)` — scans leads in the caller's org
 *   - `findDuplicateContacts(input)` — scans contacts (claimants etc.)
 *   - `hasHighConfidenceDuplicate(matches)` — does any match score >= 80?
 *   - `describeMatchReason(reason)` — human-readable label
 *   - `levenshtein(a, b)` / `soundex(raw)` — fuzzy helpers
 *
 * Scoring is a 0-100 match score (not a 0-1 confidence) to keep the UI
 * contract stable. Matches below 50 are discarded.
 *
 * Score → reason mapping:
 *
 *   - Exact email                                                 100
 *   - Exact phone                                                 100
 *   - Same first+last name + DOB                                   95
 *   - Same first+last name + matching email domain                 85
 *   - Same first+last name + same city                             70
 *   - Fuzzy name (soundex or Levenshtein<=2) + same area code      65
 *   - Phonetic name only (soundex)                                 60
 *
 * A record can match multiple reasons; the highest score wins and all
 * applicable reasons are returned in `matchReasons`. `matchReason`
 * returns the single highest-scoring reason for backwards compatibility.
 *
 * This file replaces the former `lib/services/duplicate-detection.ts`.
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
  | "name_and_city"
  | "fuzzy_name_and_area_code"
  | "phonetic_name";

/**
 * Canonical input shape. Accepts both `dob` (legacy) and `dateOfBirth`
 * (Wave 5 duplicate-detection contract) so every existing call site keeps
 * working.
 */
export type DedupInput = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  dob?: string | null;
  dateOfBirth?: string | null;
  city?: string | null;
};

/** Alias kept for call sites migrating off `duplicate-detection.ts`. */
export type DuplicateInput = DedupInput;

export type DuplicateMatch = {
  leadId: string;
  /** 0-100 score, highest-reason wins. */
  matchScore: number;
  /** Single highest-scoring reason (legacy single-reason callers). */
  matchReason: DuplicateMatchReason;
  /** All reasons that fired for this candidate. */
  matchReasons: DuplicateMatchReason[];
  /** Convenience: "Firstname Lastname". */
  name: string;
  /** Convenience: days since the lead was created. */
  daysAgo: number;
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    createdAt: Date;
    pipelineStage: string | null;
    status: string;
  };
};

/** Back-compat alias for callers that imported `DuplicateLeadMatch`. */
export type DuplicateLeadMatch = DuplicateMatch;

export type DuplicateContactMatch = {
  contactId: string;
  matchScore: number;
  matchReason: DuplicateMatchReason;
  matchReasons: DuplicateMatchReason[];
  name: string;
  daysAgo: number;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    contactType: string;
    createdAt: Date;
  };
};

// ─── Normalization helpers ──────────────────────────────────────────────

function normalizePhone(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/\D/g, "");
}

function phoneAreaCode(input: string | null | undefined): string {
  const digits = normalizePhone(input);
  // Strip US country code if present
  const local =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
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

// ─── Fuzzy string helpers ───────────────────────────────────────────────

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
 * Simple Soundex implementation for phonetic name matching.
 */
export function soundex(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z]/g, "");
  if (!s) return "";

  const map: Record<string, string> = {
    B: "1",
    F: "1",
    P: "1",
    V: "1",
    C: "2",
    G: "2",
    J: "2",
    K: "2",
    Q: "2",
    S: "2",
    X: "2",
    Z: "2",
    D: "3",
    T: "3",
    L: "4",
    M: "5",
    N: "5",
    R: "6",
  };

  const first = s[0];
  let out = first;
  let prev = map[first] ?? "";

  for (let i = 1; i < s.length && out.length < 4; i++) {
    const code = map[s[i]] ?? "";
    if (code && code !== prev) {
      out += code;
    }
    // H and W don't reset the "previous" code; everything else does.
    if (s[i] !== "H" && s[i] !== "W") {
      prev = code;
    }
  }

  return (out + "000").slice(0, 4);
}

/**
 * True if two name pairs look like the same person via phonetic (soundex)
 * or edit-distance (Levenshtein <= 2) matching.
 */
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
    if (aFirst === bFirst) return true;
    if (levenshtein(aFirst, bFirst) <= 2) return true;
  }

  // Pure edit-distance fallback (handles typos like "Jon"/"John").
  if (levenshtein(aFirst, bFirst) <= 2 && levenshtein(aLast, bLast) <= 2) {
    return true;
  }

  return false;
}

// ─── Scoring ────────────────────────────────────────────────────────────

type ReasonScore = { score: number; reasons: DuplicateMatchReason[] };

/** Score a row against the normalized input fields. Shared by leads + contacts. */
function scoreCandidate(args: {
  inEmail: string;
  inPhone: string;
  inFirst: string;
  inLast: string;
  inDob: string;
  inCity: string;
  inDomain: string;
  inArea: string;
  candEmail: string;
  candPhone: string;
  candFirst: string;
  candLast: string;
  candDob: string;
  candCity: string;
  candDomain: string;
  candArea: string;
}): ReasonScore {
  const reasons: DuplicateMatchReason[] = [];
  let score = 0;

  if (args.inEmail && args.candEmail && args.inEmail === args.candEmail) {
    score = Math.max(score, 100);
    reasons.push("exact_email");
  }
  if (args.inPhone && args.candPhone && args.inPhone === args.candPhone) {
    score = Math.max(score, 100);
    reasons.push("exact_phone");
  }
  if (
    args.inFirst &&
    args.inLast &&
    args.candFirst === args.inFirst &&
    args.candLast === args.inLast &&
    args.inDob &&
    args.candDob &&
    args.inDob === args.candDob
  ) {
    score = Math.max(score, 95);
    reasons.push("name_and_dob");
  }
  if (
    args.inFirst &&
    args.inLast &&
    args.candFirst === args.inFirst &&
    args.candLast === args.inLast &&
    args.inDomain &&
    args.candDomain &&
    args.inDomain === args.candDomain
  ) {
    score = Math.max(score, 85);
    reasons.push("name_and_email_domain");
  }
  if (
    args.inFirst &&
    args.inLast &&
    args.candFirst === args.inFirst &&
    args.candLast === args.inLast &&
    args.inCity &&
    args.candCity &&
    args.candCity === args.inCity
  ) {
    score = Math.max(score, 70);
    reasons.push("name_and_city");
  }
  if (
    args.inFirst &&
    args.inLast &&
    namesAreFuzzyMatch(
      args.inFirst,
      args.inLast,
      args.candFirst,
      args.candLast,
    ) &&
    args.inArea &&
    args.candArea &&
    args.inArea === args.candArea
  ) {
    score = Math.max(score, 65);
    reasons.push("fuzzy_name_and_area_code");
  }
  if (args.inFirst && args.inLast && reasons.length === 0) {
    const inputCode = soundex(`${args.inFirst} ${args.inLast}`);
    const candCode = soundex(`${args.candFirst} ${args.candLast}`);
    if (inputCode && inputCode === candCode) {
      score = Math.max(score, 60);
      reasons.push("phonetic_name");
    }
  }

  return { score, reasons };
}

/**
 * Pick the highest-scoring reason from a list. Mirrors the score table above
 * so callers that only want one reason (e.g. audit logs) get the most
 * meaningful one.
 */
function primaryReason(reasons: DuplicateMatchReason[]): DuplicateMatchReason {
  const priority: DuplicateMatchReason[] = [
    "exact_email",
    "exact_phone",
    "name_and_dob",
    "name_and_email_domain",
    "name_and_city",
    "fuzzy_name_and_area_code",
    "phonetic_name",
  ];
  for (const p of priority) {
    if (reasons.includes(p)) return p;
  }
  return reasons[0];
}

// ─── Candidate retrieval helpers ────────────────────────────────────────

type NameTable = typeof leads | typeof contacts;

function buildNamePrefixClause(
  firstNorm: string,
  lastNorm: string,
  table: NameTable,
) {
  // Prefix ilike pulls a broader candidate pool so levenshtein/soundex can
  // actually do some work, while keeping the SQL cost bounded.
  const firstPrefix = firstNorm.slice(0, 3);
  const lastPrefix = lastNorm.slice(0, 3);
  if (!firstPrefix && !lastPrefix) return undefined;
  const clauses: Array<ReturnType<typeof ilike>> = [];
  if (firstPrefix) {
    clauses.push(ilike(table.firstName, `${firstPrefix}%`));
  }
  if (lastPrefix) {
    clauses.push(ilike(table.lastName, `${lastPrefix}%`));
  }
  return or(...clauses);
}

// ─── Public API: leads ──────────────────────────────────────────────────

/**
 * Find potential duplicate leads. Returns matches sorted by score DESC.
 * Ignores anything with a score below 50%.
 */
export async function findDuplicateLeads(
  input: DedupInput,
): Promise<DuplicateMatch[]> {
  const session = await requireSession();

  const inEmail = normalizeEmail(input.email);
  const inPhone = normalizePhone(input.phone);
  const inFirst = normalizeName(input.firstName);
  const inLast = normalizeName(input.lastName);
  const inDob = (input.dob ?? input.dateOfBirth ?? "").trim();
  const inCity = normalizeName(input.city);
  const inDomain = emailDomain(input.email);
  const inArea = phoneAreaCode(input.phone);

  // Nothing to match on — bail early.
  if (!inEmail && !inPhone && !inFirst && !inLast) {
    return [];
  }

  // Union cheap SQL filters on email, phone, and name prefixes. Phonetic /
  // fuzzy matching happens in JS below, but only against rows already scoped
  // to the caller's org.
  const orClauses: Array<ReturnType<typeof eq> | ReturnType<typeof or>> = [];
  if (inEmail) {
    orClauses.push(sql`lower(${leads.email}) = ${inEmail}` as never);
  }
  if (inPhone) {
    orClauses.push(
      sql`regexp_replace(coalesce(${leads.phone}, ''), '\D', '', 'g') = ${inPhone}` as never,
    );
    // Also include rows sharing just the area code (for fuzzy scoring).
    if (inArea) {
      orClauses.push(
        sql`substr(regexp_replace(coalesce(${leads.phone}, ''), '\D', '', 'g'), 1, 3) = ${inArea}` as never,
      );
    }
  }
  if (inFirst && inLast) {
    orClauses.push(
      sql`(lower(${leads.firstName}) = ${inFirst} and lower(${leads.lastName}) = ${inLast})` as never,
    );
  }
  if (inFirst || inLast) {
    const nameClause = buildNamePrefixClause(inFirst, inLast, leads);
    if (nameClause) orClauses.push(nameClause as never);
  }
  // Phonetic fallback: same last-name first letter (very cheap filter).
  if (inLast) {
    const firstLetter = inLast[0];
    if (firstLetter) {
      orClauses.push(
        sql`lower(substr(${leads.lastName}, 1, 1)) = ${firstLetter}` as never,
      );
    }
  }

  if (orClauses.length === 0) return [];

  const where = and(
    eq(leads.organizationId, session.organizationId),
    isNull(leads.deletedAt),
    or(...orClauses),
  );

  const candidates = await db.select().from(leads).where(where).limit(500);

  const matches: DuplicateMatch[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;

    const candIntake = (candidate.intakeData as Record<string, unknown>) ?? {};
    const candDob =
      typeof candIntake.dob === "string"
        ? candIntake.dob.trim()
        : typeof candIntake.dateOfBirth === "string"
          ? candIntake.dateOfBirth.trim()
          : "";
    const candCity =
      typeof candIntake.city === "string" ? normalizeName(candIntake.city) : "";

    const { score, reasons } = scoreCandidate({
      inEmail,
      inPhone,
      inFirst,
      inLast,
      inDob,
      inCity,
      inDomain,
      inArea,
      candEmail: normalizeEmail(candidate.email),
      candPhone: normalizePhone(candidate.phone),
      candFirst: normalizeName(candidate.firstName),
      candLast: normalizeName(candidate.lastName),
      candDob,
      candCity,
      candDomain: emailDomain(candidate.email),
      candArea: phoneAreaCode(candidate.phone),
    });

    if (reasons.length === 0 || score < 50) continue;
    seen.add(candidate.id);

    matches.push({
      leadId: candidate.id,
      matchScore: score,
      matchReason: primaryReason(reasons),
      matchReasons: reasons,
      name: `${candidate.firstName} ${candidate.lastName}`,
      daysAgo: daysBetween(candidate.createdAt),
      lead: {
        id: candidate.id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        phone: candidate.phone,
        createdAt: candidate.createdAt,
        pipelineStage: candidate.pipelineStage ?? null,
        status: candidate.status,
      },
    });
  }

  matches.sort((a, b) => b.matchScore - a.matchScore);
  return matches;
}

// ─── Public API: contacts ───────────────────────────────────────────────

/**
 * Find potential duplicate contacts (claimants etc.) for the given input.
 * Same scoring rules as findDuplicateLeads. Matches below 50 are discarded.
 */
export async function findDuplicateContacts(
  input: DedupInput,
): Promise<DuplicateContactMatch[]> {
  const session = await requireSession();

  const inEmail = normalizeEmail(input.email);
  const inPhone = normalizePhone(input.phone);
  const inFirst = normalizeName(input.firstName);
  const inLast = normalizeName(input.lastName);
  const inDob = (input.dob ?? input.dateOfBirth ?? "").trim();
  const inCity = normalizeName(input.city);
  const inDomain = emailDomain(input.email);
  const inArea = phoneAreaCode(input.phone);

  if (!inEmail && !inPhone && !inFirst && !inLast) return [];

  const orClauses: Array<ReturnType<typeof eq> | ReturnType<typeof or>> = [];

  if (inEmail) {
    orClauses.push(sql`lower(${contacts.email}) = ${inEmail}` as never);
  }
  if (inPhone) {
    orClauses.push(
      sql`regexp_replace(coalesce(${contacts.phone}, ''), '\D', '', 'g') = ${inPhone}` as never,
    );
    if (inArea) {
      orClauses.push(
        sql`substr(regexp_replace(coalesce(${contacts.phone}, ''), '\D', '', 'g'), 1, 3) = ${inArea}` as never,
      );
    }
  }
  if (inFirst && inLast) {
    orClauses.push(
      sql`(lower(${contacts.firstName}) = ${inFirst} and lower(${contacts.lastName}) = ${inLast})` as never,
    );
  }
  if (inFirst || inLast) {
    const nameClause = buildNamePrefixClause(inFirst, inLast, contacts);
    if (nameClause) orClauses.push(nameClause as never);
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

    const candMeta = (row.metadata as Record<string, unknown>) ?? {};
    const candDob =
      typeof candMeta.dob === "string"
        ? candMeta.dob.trim()
        : typeof candMeta.dateOfBirth === "string"
          ? candMeta.dateOfBirth.trim()
          : "";
    const candCity =
      typeof candMeta.city === "string" ? normalizeName(candMeta.city) : "";

    const { score, reasons } = scoreCandidate({
      inEmail,
      inPhone,
      inFirst,
      inLast,
      inDob,
      inCity,
      inDomain,
      inArea,
      candEmail: normalizeEmail(row.email),
      candPhone: normalizePhone(row.phone),
      candFirst: normalizeName(row.firstName),
      candLast: normalizeName(row.lastName),
      candDob,
      candCity,
      candDomain: emailDomain(row.email),
      candArea: phoneAreaCode(row.phone),
    });

    if (reasons.length === 0 || score < 50) continue;
    seen.add(row.id);

    results.push({
      contactId: row.id,
      matchScore: score,
      matchReason: primaryReason(reasons),
      matchReasons: reasons,
      name: `${row.firstName} ${row.lastName}`,
      daysAgo: daysBetween(row.createdAt),
      contact: {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        contactType: row.contactType,
        createdAt: row.createdAt,
      },
    });
  }

  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Convenience: is this duplicate list "blocking" (i.e., something scoring
 * >=80% that a user should confirm before creating a new lead)?
 */
export function hasHighConfidenceDuplicate(matches: DuplicateMatch[]): boolean {
  return matches.some((m) => m.matchScore >= 80);
}

/**
 * Human-readable label for a match reason.
 */
export function describeMatchReason(reason: DuplicateMatchReason): string {
  switch (reason) {
    case "exact_email":
      return "Exact email match";
    case "exact_phone":
      return "Exact phone match";
    case "name_and_dob":
      return "Same name and date of birth";
    case "name_and_email_domain":
      return "Same name and email domain";
    case "name_and_city":
      return "Same name and city";
    case "fuzzy_name_and_area_code":
      return "Similar name and same phone area code";
    case "phonetic_name":
      return "Phonetic name match";
  }
}

/** Back-compat alias for the former `duplicate-detection` export. */
export const describeDuplicateReason = describeMatchReason;
