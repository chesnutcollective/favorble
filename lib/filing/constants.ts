/**
 * Shared filing-reject constants. Lives outside app/actions/filing.ts
 * because that file is marked `"use server"`, and Next.js forbids
 * non-async-function exports from server action modules.
 */

export const FILING_REJECT_REASON_CODES = [
  "missing_signature",
  "wrong_form_version",
  "incomplete_evidence",
  "incorrect_ssn",
  "duplicate_submission",
  "other",
] as const;

export type FilingRejectReasonCode = (typeof FILING_REJECT_REASON_CODES)[number];

/** Human-readable labels for the reason codes — used in the dropdown. */
export const FILING_REJECT_REASON_LABELS: Record<FilingRejectReasonCode, string> = {
  missing_signature: "Missing signature",
  wrong_form_version: "Wrong form version",
  incomplete_evidence: "Incomplete evidence",
  incorrect_ssn: "Incorrect SSN",
  duplicate_submission: "Duplicate submission",
  other: "Other",
};
