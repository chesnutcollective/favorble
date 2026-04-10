/**
 * Lead deduplication service.
 *
 * Exposes `findDuplicateLeads(input)` which scans existing leads in the
 * caller's organization and returns any that look like possible duplicates,
 * scored from 0-100. Matches below 50% are discarded.
 */

import { db } from "@/db/drizzle";
import { leads } from "@/db/schema";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";

export type DuplicateMatchReason =
  | "exact_email"
  | "exact_phone"
  | "name_and_dob"
  | "name_and_city"
  | "phonetic_name";

export type DuplicateMatch = {
  leadId: string;
  matchScore: number;
  matchReason: DuplicateMatchReason;
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

export type DedupInput = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  dob?: string | null;
  city?: string | null;
};

/**
 * Normalize a phone number by stripping everything that isn't a digit.
 */
function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Normalize an email for comparison (lowercase + trim).
 */
function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Normalize a name token for comparison.
 */
function normalizeName(input: string): string {
  return input.trim().toLowerCase();
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
 * Find potential duplicate leads. Returns matches sorted by score DESC.
 * Ignores anything with a score below 50%.
 */
export async function findDuplicateLeads(
  input: DedupInput,
): Promise<DuplicateMatch[]> {
  const session = await requireSession();

  const emailNorm = input.email ? normalizeEmail(input.email) : null;
  const phoneNorm = input.phone ? normalizePhone(input.phone) : null;
  const firstNorm = input.firstName ? normalizeName(input.firstName) : null;
  const lastNorm = input.lastName ? normalizeName(input.lastName) : null;
  const dob = input.dob ? input.dob.trim() : null;
  const cityNorm = input.city ? normalizeName(input.city) : null;

  // Nothing to match on — bail early.
  if (!emailNorm && !phoneNorm && !firstNorm && !lastNorm) {
    return [];
  }

  // Pull a candidate set. We union together cheap SQL filters on email, phone,
  // and name. For phonetic matching we still have to scan names in-memory but
  // we only scan rows from the same org.
  const orClauses = [] as ReturnType<typeof eq>[];
  if (emailNorm) {
    orClauses.push(sql`lower(${leads.email}) = ${emailNorm}` as never);
  }
  if (phoneNorm) {
    orClauses.push(
      sql`regexp_replace(coalesce(${leads.phone}, ''), '\\D', '', 'g') = ${phoneNorm}` as never,
    );
  }
  if (firstNorm && lastNorm) {
    orClauses.push(
      sql`(lower(${leads.firstName}) = ${firstNorm} and lower(${leads.lastName}) = ${lastNorm})` as never,
    );
  }
  // Phonetic fallback: same last-name first letter (very cheap filter) then
  // we evaluate soundex in JS below.
  if (lastNorm) {
    const firstLetter = lastNorm[0];
    if (firstLetter) {
      orClauses.push(
        sql`lower(substr(${leads.lastName}, 1, 1)) = ${firstLetter}` as never,
      );
    }
  }

  const where = and(
    eq(leads.organizationId, session.organizationId),
    isNull(leads.deletedAt),
    orClauses.length > 0 ? or(...orClauses) : undefined,
  );

  const candidates = await db.select().from(leads).where(where).limit(500);

  const matches: DuplicateMatch[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    let score = 0;
    let reason: DuplicateMatchReason | null = null;

    const candEmail = candidate.email ? normalizeEmail(candidate.email) : null;
    const candPhone = candidate.phone ? normalizePhone(candidate.phone) : null;
    const candFirst = normalizeName(candidate.firstName);
    const candLast = normalizeName(candidate.lastName);
    const candIntake = (candidate.intakeData as Record<string, unknown>) ?? {};
    const candDob =
      typeof candIntake.dob === "string" ? candIntake.dob.trim() : null;
    const candCity =
      typeof candIntake.city === "string"
        ? normalizeName(candIntake.city)
        : null;

    if (emailNorm && candEmail && candEmail === emailNorm) {
      score = 100;
      reason = "exact_email";
    } else if (phoneNorm && candPhone && candPhone === phoneNorm) {
      score = 100;
      reason = "exact_phone";
    } else if (
      firstNorm &&
      lastNorm &&
      candFirst === firstNorm &&
      candLast === lastNorm &&
      dob &&
      candDob &&
      candDob === dob
    ) {
      score = 95;
      reason = "name_and_dob";
    } else if (
      firstNorm &&
      lastNorm &&
      candFirst === firstNorm &&
      candLast === lastNorm &&
      cityNorm &&
      candCity &&
      candCity === cityNorm
    ) {
      score = 70;
      reason = "name_and_city";
    } else if (firstNorm && lastNorm) {
      const inputCode = soundex(`${firstNorm} ${lastNorm}`);
      const candCode = soundex(`${candFirst} ${candLast}`);
      if (inputCode && inputCode === candCode) {
        score = 60;
        reason = "phonetic_name";
      }
    }

    if (!reason || score < 50) continue;
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);

    matches.push({
      leadId: candidate.id,
      matchScore: score,
      matchReason: reason,
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
      return "Same name and DOB";
    case "name_and_city":
      return "Same name and city";
    case "phonetic_name":
      return "Phonetic name match";
  }
}
