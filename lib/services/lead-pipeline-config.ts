/**
 * Lead Pipeline Config — 30+ stage MyCase-style pipeline.
 *
 * This config is the single source of truth for the extended lead pipeline.
 * Stages are stored in `leads.pipelineStage` as free-form text (not an enum)
 * so we can add/reorder stages without destructive migrations.
 *
 * Each stage belongs to a group (NEW_LEADS, QUALIFICATION, INTAKE, DECISION,
 * CONVERSION) and has a display order. Terminal stages cannot advance to a
 * default next stage.
 */

export type PipelineStageGroup =
  | "NEW_LEADS"
  | "QUALIFICATION"
  | "INTAKE"
  | "DECISION"
  | "CONVERSION";

export type PipelineStage = {
  id: string;
  label: string;
  group: PipelineStageGroup;
  order: number;
  color: string;
  isTerminal: boolean;
  defaultNext?: string;
  description?: string;
};

export const PIPELINE_GROUPS: Record<
  PipelineStageGroup,
  { label: string; color: string; order: number }
> = {
  NEW_LEADS: { label: "New Leads", color: "#1d72b8", order: 1 },
  QUALIFICATION: { label: "Qualification", color: "#7c3aed", order: 2 },
  INTAKE: { label: "Intake", color: "#263c94", order: 3 },
  DECISION: { label: "Decision", color: "#d97706", order: 4 },
  CONVERSION: { label: "Conversion", color: "#16a34a", order: 5 },
};

export const PIPELINE_STAGES: PipelineStage[] = [
  // ─── NEW LEADS ───────────────────────────────────────────────
  {
    id: "new_inquiry",
    label: "New Inquiry",
    group: "NEW_LEADS",
    order: 1,
    color: "#1d72b8",
    isTerminal: false,
    defaultNext: "initial_qualifying",
    description: "A brand new inquiry, not yet triaged.",
  },
  {
    id: "web_form_submitted",
    label: "Web Form Submitted",
    group: "NEW_LEADS",
    order: 2,
    color: "#1d72b8",
    isTerminal: false,
    defaultNext: "initial_qualifying",
  },
  {
    id: "phone_call_received",
    label: "Phone Call Received",
    group: "NEW_LEADS",
    order: 3,
    color: "#1d72b8",
    isTerminal: false,
    defaultNext: "initial_qualifying",
  },
  {
    id: "walk_in",
    label: "Walk-In",
    group: "NEW_LEADS",
    order: 4,
    color: "#1d72b8",
    isTerminal: false,
    defaultNext: "initial_qualifying",
  },
  {
    id: "referral_received",
    label: "Referral Received",
    group: "NEW_LEADS",
    order: 5,
    color: "#1d72b8",
    isTerminal: false,
    defaultNext: "initial_qualifying",
  },
  {
    id: "marketing_lead",
    label: "Marketing Lead",
    group: "NEW_LEADS",
    order: 6,
    color: "#1d72b8",
    isTerminal: false,
    defaultNext: "initial_qualifying",
  },

  // ─── QUALIFICATION ───────────────────────────────────────────
  {
    id: "initial_qualifying",
    label: "Initial Qualifying",
    group: "QUALIFICATION",
    order: 10,
    color: "#7c3aed",
    isTerminal: false,
    defaultNext: "intake_scheduled",
  },
  {
    id: "call_attempted_1",
    label: "Call Attempted 1",
    group: "QUALIFICATION",
    order: 11,
    color: "#7c3aed",
    isTerminal: false,
    defaultNext: "call_attempted_2",
  },
  {
    id: "call_attempted_2",
    label: "Call Attempted 2",
    group: "QUALIFICATION",
    order: 12,
    color: "#7c3aed",
    isTerminal: false,
    defaultNext: "call_attempted_3",
  },
  {
    id: "call_attempted_3",
    label: "Call Attempted 3",
    group: "QUALIFICATION",
    order: 13,
    color: "#7c3aed",
    isTerminal: false,
    defaultNext: "could_not_reach",
  },
  {
    id: "voicemail_left",
    label: "Voicemail Left",
    group: "QUALIFICATION",
    order: 14,
    color: "#7c3aed",
    isTerminal: false,
    defaultNext: "call_attempted_2",
  },
  {
    id: "no_answer",
    label: "No Answer",
    group: "QUALIFICATION",
    order: 15,
    color: "#7c3aed",
    isTerminal: false,
    defaultNext: "call_attempted_2",
  },
  {
    id: "wrong_number",
    label: "Wrong Number",
    group: "QUALIFICATION",
    order: 16,
    color: "#7c3aed",
    isTerminal: false,
    defaultNext: "could_not_reach",
  },
  {
    id: "intake_scheduled",
    label: "Intake Scheduled",
    group: "QUALIFICATION",
    order: 17,
    color: "#7c3aed",
    isTerminal: false,
    defaultNext: "intake_in_progress",
  },
  {
    id: "intake_rescheduled",
    label: "Intake Rescheduled",
    group: "QUALIFICATION",
    order: 18,
    color: "#7c3aed",
    isTerminal: false,
    defaultNext: "intake_in_progress",
  },

  // ─── INTAKE ──────────────────────────────────────────────────
  {
    id: "intake_in_progress",
    label: "Intake In Progress",
    group: "INTAKE",
    order: 20,
    color: "#263c94",
    isTerminal: false,
    defaultNext: "intake_complete",
  },
  {
    id: "intake_complete",
    label: "Intake Complete",
    group: "INTAKE",
    order: 21,
    color: "#263c94",
    isTerminal: false,
    defaultNext: "awaiting_documents",
  },
  {
    id: "awaiting_documents",
    label: "Awaiting Documents",
    group: "INTAKE",
    order: 22,
    color: "#263c94",
    isTerminal: false,
    defaultNext: "documents_received",
  },
  {
    id: "documents_received",
    label: "Documents Received",
    group: "INTAKE",
    order: 23,
    color: "#263c94",
    isTerminal: false,
    defaultNext: "conflict_check_pending",
  },
  {
    id: "conflict_check_pending",
    label: "Conflict Check Pending",
    group: "INTAKE",
    order: 24,
    color: "#263c94",
    isTerminal: false,
    defaultNext: "conflict_check_cleared",
  },
  {
    id: "conflict_check_cleared",
    label: "Conflict Check Cleared",
    group: "INTAKE",
    order: 25,
    color: "#263c94",
    isTerminal: false,
    defaultNext: "contract_sent",
  },

  // ─── DECISION ────────────────────────────────────────────────
  {
    id: "contract_sent",
    label: "Contract Sent",
    group: "DECISION",
    order: 30,
    color: "#d97706",
    isTerminal: false,
    defaultNext: "contract_signed",
  },
  {
    id: "contract_signed",
    label: "Contract Signed",
    group: "DECISION",
    order: 31,
    color: "#d97706",
    isTerminal: false,
    defaultNext: "retainer_paid",
  },
  {
    id: "retainer_paid",
    label: "Retainer Paid",
    group: "DECISION",
    order: 32,
    color: "#d97706",
    isTerminal: false,
    defaultNext: "converting_to_case",
  },
  {
    id: "declined_by_firm",
    label: "Declined By Firm",
    group: "DECISION",
    order: 33,
    color: "#d97706",
    isTerminal: true,
  },
  {
    id: "declined_by_client",
    label: "Declined By Client",
    group: "DECISION",
    order: 34,
    color: "#d97706",
    isTerminal: true,
  },
  {
    id: "could_not_reach",
    label: "Could Not Reach",
    group: "DECISION",
    order: 35,
    color: "#d97706",
    isTerminal: true,
  },

  // ─── CONVERSION ──────────────────────────────────────────────
  {
    id: "converting_to_case",
    label: "Converting to Case",
    group: "CONVERSION",
    order: 40,
    color: "#16a34a",
    isTerminal: false,
    defaultNext: "converted",
  },
  {
    id: "converted",
    label: "Converted",
    group: "CONVERSION",
    order: 41,
    color: "#16a34a",
    isTerminal: true,
  },
  {
    id: "disqualified",
    label: "Disqualified",
    group: "CONVERSION",
    order: 42,
    color: "#16a34a",
    isTerminal: true,
  },
  {
    id: "duplicate",
    label: "Duplicate",
    group: "CONVERSION",
    order: 43,
    color: "#16a34a",
    isTerminal: true,
  },
  {
    id: "spanish_routed",
    label: "Spanish Routed",
    group: "CONVERSION",
    order: 44,
    color: "#16a34a",
    isTerminal: true,
  },
  {
    id: "out_of_state",
    label: "Out of State",
    group: "CONVERSION",
    order: 45,
    color: "#16a34a",
    isTerminal: true,
  },
];

/**
 * Returns stages grouped by their pipeline group, preserving display order.
 */
export function getStagesByGroup(): Record<PipelineStageGroup, PipelineStage[]> {
  const grouped: Record<PipelineStageGroup, PipelineStage[]> = {
    NEW_LEADS: [],
    QUALIFICATION: [],
    INTAKE: [],
    DECISION: [],
    CONVERSION: [],
  };
  for (const stage of PIPELINE_STAGES) {
    grouped[stage.group].push(stage);
  }
  for (const group of Object.keys(grouped) as PipelineStageGroup[]) {
    grouped[group].sort((a, b) => a.order - b.order);
  }
  return grouped;
}

/**
 * Get a stage by its id (returns undefined if no match).
 */
export function getStageById(id: string): PipelineStage | undefined {
  return PIPELINE_STAGES.find((s) => s.id === id);
}

/**
 * Return candidate next stages for the given stage id. Includes the explicit
 * defaultNext plus the next stage in the same group by order (if different).
 */
export function getNextStages(currentStageId: string): PipelineStage[] {
  const current = getStageById(currentStageId);
  if (!current || current.isTerminal) return [];

  const results: PipelineStage[] = [];
  const seen = new Set<string>();

  if (current.defaultNext) {
    const next = getStageById(current.defaultNext);
    if (next && !seen.has(next.id)) {
      results.push(next);
      seen.add(next.id);
    }
  }

  // Next-in-group by order
  const groupStages = PIPELINE_STAGES.filter(
    (s) => s.group === current.group,
  ).sort((a, b) => a.order - b.order);
  const idx = groupStages.findIndex((s) => s.id === current.id);
  if (idx >= 0 && idx < groupStages.length - 1) {
    const nextInGroup = groupStages[idx + 1];
    if (!seen.has(nextInGroup.id)) {
      results.push(nextInGroup);
      seen.add(nextInGroup.id);
    }
  }

  return results;
}

/**
 * Default entry stage for brand-new leads.
 */
export const DEFAULT_PIPELINE_STAGE_ID = "new_inquiry";
