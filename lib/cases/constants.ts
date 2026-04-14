/**
 * Shared close/hold constants. Lives outside app/actions/cases.ts because
 * that file is marked `"use server"`, and Next.js forbids non-async-function
 * exports from server action modules.
 */

export const CLOSE_CASE_REASONS = [
  "won",
  "lost",
  "withdrawn",
  "referred_out",
  "other",
] as const;

export type CloseCaseReason = (typeof CLOSE_CASE_REASONS)[number];

export const CLOSE_CASE_REASON_LABELS: Record<CloseCaseReason, string> = {
  won: "Won",
  lost: "Lost",
  withdrawn: "Withdrawn",
  referred_out: "Referred out",
  other: "Other",
};

export const HOLD_CASE_REASONS = [
  "client_unresponsive",
  "medical_pending",
  "awaiting_docs",
  "other",
] as const;

export type HoldCaseReason = (typeof HOLD_CASE_REASONS)[number];

export const HOLD_CASE_REASON_LABELS: Record<HoldCaseReason, string> = {
  client_unresponsive: "Client unresponsive",
  medical_pending: "Medical pending",
  awaiting_docs: "Awaiting documents",
  other: "Other",
};

export const CASE_CONTACT_RELATIONSHIPS = [
  "claimant",
  "spouse",
  "parent",
  "guardian",
  "rep_payee",
  "attorney_in_fact",
  "other",
] as const;

export type CaseContactRelationship =
  (typeof CASE_CONTACT_RELATIONSHIPS)[number];
