/**
 * SSA deadline rules engine.
 *
 * Encodes the Social Security Administration's procedural deadlines so
 * the app can auto-compute task due dates and flag cases where a
 * responsible team member hasn't acted before a known deadline.
 *
 * Feeds SM-2, SA-5, SA-7. Pure functions — no server-only imports so
 * CLI scripts and tests can consume it.
 *
 * IMPORTANT: these are simplified for the MVP. Real SSA rules have
 * edge cases (good cause for late filing, equitable tolling, mailing
 * rules, weekend/holiday handling). Flag anything the engine isn't
 * sure about for human review rather than acting automatically.
 */

export type SsaDeadlineType =
  | "appeal_reconsideration"
  | "appeal_hearing"
  | "appeal_appeals_council"
  | "appeal_federal_court"
  | "five_day_evidence_rule"
  | "fee_petition"
  | "good_cause_response"
  | "rfc_follow_up"
  | "mr_follow_up";

export type DeadlineRule = {
  type: SsaDeadlineType;
  label: string;
  description: string;
  // Days from the trigger event until the deadline hits
  daysFromTrigger: number;
  // How many days in advance should we flag the case for action
  warningDays: number[];
  // Business rules
  weekendRollsToNextBusinessDay: boolean;
  // Which team role typically owns this deadline
  ownerRole:
    | "case_manager"
    | "attorney"
    | "filing_agent"
    | "appeals_council"
    | "pre_hearing_prep"
    | "fee_collection"
    | "medical_records";
};

/**
 * Canonical SSA deadline rules. When the triggering event lands
 * (denial received, favorable decision, etc.), the app looks up the
 * applicable rule and schedules the deadline + warnings.
 */
export const SSA_DEADLINE_RULES: Record<SsaDeadlineType, DeadlineRule> = {
  appeal_reconsideration: {
    type: "appeal_reconsideration",
    label: "Request for Reconsideration",
    description:
      "60 days + 5 days mailing from notice of denial to file reconsideration request.",
    daysFromTrigger: 65,
    warningDays: [45, 30, 14, 7, 3, 1],
    weekendRollsToNextBusinessDay: true,
    ownerRole: "case_manager",
  },
  appeal_hearing: {
    type: "appeal_hearing",
    label: "Request for Hearing",
    description:
      "60 days + 5 days mailing from reconsideration denial to request ALJ hearing.",
    daysFromTrigger: 65,
    warningDays: [45, 30, 14, 7, 3, 1],
    weekendRollsToNextBusinessDay: true,
    ownerRole: "case_manager",
  },
  appeal_appeals_council: {
    type: "appeal_appeals_council",
    label: "Request for Appeals Council Review",
    description:
      "60 days + 5 days mailing from ALJ unfavorable decision to file AC request.",
    daysFromTrigger: 65,
    warningDays: [45, 30, 14, 7, 3, 1],
    weekendRollsToNextBusinessDay: true,
    ownerRole: "appeals_council",
  },
  appeal_federal_court: {
    type: "appeal_federal_court",
    label: "Appeal to Federal District Court",
    description:
      "60 days + 5 days mailing from Appeals Council denial to file in federal court.",
    daysFromTrigger: 65,
    warningDays: [45, 30, 14, 7, 3, 1],
    weekendRollsToNextBusinessDay: true,
    ownerRole: "attorney",
  },
  five_day_evidence_rule: {
    type: "five_day_evidence_rule",
    label: "Five-Day Evidence Rule",
    description:
      "Evidence must be submitted 5 business days before the hearing (with limited exceptions).",
    daysFromTrigger: -5, // counts backward from hearing date
    warningDays: [10, 7, 5, 3, 1],
    weekendRollsToNextBusinessDay: true,
    ownerRole: "pre_hearing_prep",
  },
  fee_petition: {
    type: "fee_petition",
    label: "Fee Petition",
    description:
      "60 days from favorable decision to file fee petition with SSA.",
    daysFromTrigger: 60,
    warningDays: [30, 14, 7, 3, 1],
    weekendRollsToNextBusinessDay: false,
    ownerRole: "fee_collection",
  },
  good_cause_response: {
    type: "good_cause_response",
    label: "Good Cause Response",
    description:
      "30 days to respond to SSA good cause request for late filing.",
    daysFromTrigger: 30,
    warningDays: [14, 7, 3, 1],
    weekendRollsToNextBusinessDay: true,
    ownerRole: "attorney",
  },
  rfc_follow_up: {
    type: "rfc_follow_up",
    label: "RFC Form Follow-Up",
    description:
      "14 days to follow up with treating physician on RFC form request.",
    daysFromTrigger: 14,
    warningDays: [10, 7, 3],
    weekendRollsToNextBusinessDay: false,
    ownerRole: "medical_records",
  },
  mr_follow_up: {
    type: "mr_follow_up",
    label: "Medical Records Follow-Up",
    description:
      "14 days to follow up with provider on outstanding records request.",
    daysFromTrigger: 14,
    warningDays: [10, 7, 3],
    weekendRollsToNextBusinessDay: false,
    ownerRole: "medical_records",
  },
};

/**
 * Compute the actual deadline date from a trigger event date.
 * Handles weekend rollover when the rule requires it.
 */
export function computeDeadlineDate(
  triggerDate: Date,
  rule: DeadlineRule,
): Date {
  const deadline = new Date(triggerDate);
  deadline.setDate(deadline.getDate() + rule.daysFromTrigger);

  if (rule.weekendRollsToNextBusinessDay) {
    // Saturday (6) → Monday, Sunday (0) → Monday
    while (deadline.getDay() === 0 || deadline.getDay() === 6) {
      deadline.setDate(deadline.getDate() + 1);
    }
  }

  return deadline;
}

/**
 * Compute all warning dates (e.g. 45-day, 30-day, 7-day) from a
 * deadline date. Each warning rolls to previous business day if
 * it lands on a weekend.
 */
export function computeWarningDates(
  deadline: Date,
  rule: DeadlineRule,
): Array<{ daysBefore: number; date: Date }> {
  return rule.warningDays.map((daysBefore) => {
    const d = new Date(deadline);
    d.setDate(d.getDate() - daysBefore);
    if (rule.weekendRollsToNextBusinessDay) {
      while (d.getDay() === 0 || d.getDay() === 6) {
        d.setDate(d.getDate() - 1);
      }
    }
    return { daysBefore, date: d };
  });
}

/**
 * Given a supervisor event type, return the deadline rule that should
 * be scheduled (if any). Used by the supervisor event handler to
 * auto-schedule deadlines on event detection.
 */
export function getDeadlineRuleForEvent(
  eventType: string,
): DeadlineRule | null {
  switch (eventType) {
    case "denial_received":
      // Assume first-level denial → reconsideration
      return SSA_DEADLINE_RULES.appeal_reconsideration;
    case "unfavorable_decision":
      return SSA_DEADLINE_RULES.appeal_appeals_council;
    case "favorable_decision":
    case "fee_awarded":
      return SSA_DEADLINE_RULES.fee_petition;
    case "hearing_scheduled":
      return SSA_DEADLINE_RULES.five_day_evidence_rule;
    default:
      return null;
  }
}

/**
 * Count how many days until a deadline. Negative = past due.
 */
export function daysUntilDeadline(
  deadline: Date,
  now: Date = new Date(),
): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const normalizedNow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const normalizedDeadline = new Date(
    deadline.getFullYear(),
    deadline.getMonth(),
    deadline.getDate(),
  );
  return Math.round(
    (normalizedDeadline.getTime() - normalizedNow.getTime()) / MS_PER_DAY,
  );
}

/**
 * Which warning threshold does "days until deadline" currently fall
 * into? Returns null if we're not yet at any warning threshold.
 */
export function currentWarningLevel(
  daysUntil: number,
  rule: DeadlineRule,
): number | null {
  // Sort descending so we return the nearest (smallest) warning
  // threshold we've hit.
  for (const w of [...rule.warningDays].sort((a, b) => a - b)) {
    if (daysUntil <= w) return w;
  }
  return null;
}
