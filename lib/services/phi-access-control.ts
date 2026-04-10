import "server-only";

/**
 * HIPAA-aware PHI access control.
 *
 * This is the single place where role-based PHI visibility rules live. Today
 * the rules are permissive — everyone except an explicit "viewer" role can
 * see decrypted PHI — but it's wired up so that tightening the rules later is
 * a one-file change.
 */

export type PhiRole = string | null | undefined;

export type PhiField =
  | "ssn_full"
  | "ssn_last4"
  | "date_of_birth"
  | "claim_number"
  | "medical_chronology"
  | "ere_credentials";

export type PhiAccessCheck = {
  canView: boolean;
  canDecrypt: boolean;
  reason?: string;
};

const READ_ONLY_ROLES = new Set(["viewer"]);

/**
 * Can this role see a full decrypted PHI field? Used at the service layer
 * before returning PHI like SSN or ERE credentials.
 */
export function canAccessPhi(role: PhiRole, field: PhiField): PhiAccessCheck {
  const normalized = (role ?? "").trim().toLowerCase();

  if (READ_ONLY_ROLES.has(normalized)) {
    return {
      canView: true,
      canDecrypt: false,
      reason: `Role "${normalized}" cannot decrypt PHI field "${field}"`,
    };
  }

  // Default for admin, staff, attorney, paralegal, unknown – full access.
  return { canView: true, canDecrypt: true };
}

/**
 * Convenience wrapper: throws if the caller role cannot decrypt the requested
 * PHI field. Use this at the entry point of any server action that reveals
 * raw PHI.
 */
export function assertPhiAccess(role: PhiRole, field: PhiField): void {
  const check = canAccessPhi(role, field);
  if (!check.canDecrypt) {
    throw new Error(
      check.reason ?? `Not permitted to access PHI field "${field}"`,
    );
  }
}

/**
 * Mask an SSN for display when a role is allowed to see it exists but not
 * read the full value. Keeps the last four digits.
 */
export function maskSsn(ssn: string | null | undefined): string {
  if (!ssn) return "";
  const digits = ssn.replace(/\D/g, "");
  if (digits.length < 4) return "***-**-****";
  return `***-**-${digits.slice(-4)}`;
}

/**
 * Mask a DOB for roles that can't see the full date. Returns only the year.
 */
export function maskDob(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return `XXXX-XX-${String(d.getUTCFullYear())}`;
}
