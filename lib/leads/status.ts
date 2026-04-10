/**
 * Lead pipeline status types, groupings, and helpers.
 *
 * Lives in a non-"use server" module so it can be imported by both server
 * actions and client components. Next.js 16 only allows async function
 * exports from "use server" files.
 *
 * Keep in sync with `leadStatusEnum` in `db/schema/enums.ts`.
 */

export type LeadStatus =
  // Initial contact
  | "new"
  | "received_inquiry"
  | "voicemail_left"
  | "email_sent"
  | "text_sent"
  | "contacted"
  // Qualifying
  | "qualifying"
  | "interested"
  | "not_interested"
  | "wrong_number"
  | "do_not_contact"
  | "language_barrier"
  // Intake scheduling
  | "intake_scheduled"
  | "intake_no_show"
  | "intake_rescheduled"
  | "intake_in_progress"
  | "intake_complete"
  // Conflict check
  | "conflict_pending"
  | "conflict_cleared"
  | "conflict_blocked"
  // Contract
  | "contract_drafting"
  | "contract_sent"
  | "contract_followup"
  | "contract_signed"
  | "contract_declined"
  // Conversion
  | "converted"
  | "converted_full_rep"
  | "converted_consult_only"
  // Decline reasons
  | "declined"
  | "declined_age"
  | "declined_capacity"
  | "declined_outside_state"
  | "declined_already_repd"
  | "declined_other"
  // Other
  | "unresponsive"
  | "disqualified"
  | "referred_out"
  | "on_hold";

/**
 * All lead pipeline statuses, grouped by category. Drives the kanban column
 * layout and the `getLeadStatusCategory` helper below.
 */
export const LEAD_STATUS_GROUPS = {
  initial: [
    "new",
    "received_inquiry",
    "voicemail_left",
    "email_sent",
    "text_sent",
    "contacted",
  ],
  qualifying: [
    "qualifying",
    "interested",
    "not_interested",
    "wrong_number",
    "do_not_contact",
    "language_barrier",
  ],
  intake: [
    "intake_scheduled",
    "intake_no_show",
    "intake_rescheduled",
    "intake_in_progress",
    "intake_complete",
  ],
  conflict: ["conflict_pending", "conflict_cleared", "conflict_blocked"],
  contract: [
    "contract_drafting",
    "contract_sent",
    "contract_followup",
    "contract_signed",
    "contract_declined",
  ],
  conversion: ["converted", "converted_full_rep", "converted_consult_only"],
  decline: [
    "declined",
    "declined_age",
    "declined_capacity",
    "declined_outside_state",
    "declined_already_repd",
    "declined_other",
  ],
  other: ["unresponsive", "disqualified", "referred_out", "on_hold"],
} as const satisfies Record<string, readonly LeadStatus[]>;

export type LeadStatusCategory = keyof typeof LEAD_STATUS_GROUPS;

export const ALL_LEAD_STATUSES: readonly LeadStatus[] = Object.values(
  LEAD_STATUS_GROUPS,
).flat() as readonly LeadStatus[];

/**
 * Subtle color hint for each category. Uses the Favorble brand palette:
 * brand #263c94, status blue #1d72b8, amber #cf8a00, red #d1453b.
 */
export const LEAD_STATUS_CATEGORY_COLORS: Record<
  LeadStatusCategory,
  { label: string; color: string; tone: string }
> = {
  initial: { label: "Initial Contact", color: "#6b7280", tone: "gray" },
  qualifying: { label: "Qualifying", color: "#1d72b8", tone: "blue" },
  intake: { label: "Intake", color: "#263c94", tone: "brand" },
  conflict: { label: "Conflict Check", color: "#cf8a00", tone: "amber" },
  contract: { label: "Contract", color: "#5aa8d9", tone: "lightblue" },
  conversion: { label: "Conversion", color: "#1d72b8", tone: "green" },
  decline: { label: "Declined", color: "#d1453b", tone: "red" },
  other: { label: "Other", color: "#6b7280", tone: "gray" },
};

/**
 * Return the category a given lead status belongs to. Unknown statuses fall
 * back to "other" so the kanban always has a home for them.
 */
export function getLeadStatusCategory(status: string): LeadStatusCategory {
  for (const [category, statuses] of Object.entries(LEAD_STATUS_GROUPS) as [
    LeadStatusCategory,
    readonly string[],
  ][]) {
    if (statuses.includes(status)) return category;
  }
  return "other";
}
