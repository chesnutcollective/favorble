import postgres from "postgres";

const DENIAL_THRESHOLD = 8;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DenialRecord {
  ssnHash: string;
  deniedAt: Date;
}

/**
 * In-memory denial tracker for SSN lookups.
 *
 * Tracks denial events per SSN hash within a rolling 24-hour window.
 * If an SSN hash accumulates 8 or more denials within the window,
 * further lookups for that SSN are blocked until denials age out.
 *
 * This can be swapped for a Postgres-backed implementation when needed.
 */
const denials: DenialRecord[] = [];

/**
 * Remove expired denial records (older than 24 hours).
 */
function pruneExpired(): void {
  const cutoff = Date.now() - WINDOW_MS;
  let i = 0;
  while (i < denials.length) {
    if (denials[i].deniedAt.getTime() < cutoff) {
      denials.splice(i, 1);
    } else {
      i++;
    }
  }
}

/**
 * Count denials for a given SSN hash within the rolling window.
 */
function countDenials(ssnHash: string): number {
  const cutoff = Date.now() - WINDOW_MS;
  return denials.filter(
    (d) => d.ssnHash === ssnHash && d.deniedAt.getTime() >= cutoff,
  ).length;
}

/**
 * Check whether a lookup is allowed for the given SSN hash.
 * Returns true if under the denial threshold (8 denials in 24hr).
 */
export function canLookupSSN(ssnHash: string): boolean {
  pruneExpired();
  const count = countDenials(ssnHash);

  if (count >= DENIAL_THRESHOLD) {
    console.log(
      `SSN lookup blocked: hash=${ssnHash.substring(0, 8)}... has ${count} denials in 24hr window`,
    );
    return false;
  }

  return true;
}

/**
 * Record a denied SSN lookup attempt.
 */
export function recordDenial(ssnHash: string): void {
  denials.push({ ssnHash, deniedAt: new Date() });
  const currentCount = countDenials(ssnHash);
  console.log(
    `SSN denial recorded: hash=${ssnHash.substring(0, 8)}... (${currentCount}/${DENIAL_THRESHOLD} in window)`,
  );
}

/**
 * Get the current denial count for an SSN hash in the rolling 24hr window.
 */
export function getDenialCount(ssnHash: string): number {
  pruneExpired();
  return countDenials(ssnHash);
}

/**
 * Get total denial count across all SSN hashes in the rolling window.
 */
export function getTotalDenialCount(): number {
  pruneExpired();
  return denials.length;
}
