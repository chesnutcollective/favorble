/**
 * Role-metric dictionary. Canonical set of performance metrics each
 * role is measured against, with weights, targets, and SLA thresholds.
 *
 * Feeds RP-1, RP-2, RP-4, QA-4, SM-5, CC-1, CC-3. Pure data — no
 * server-only imports so CLI scripts and tests can consume it.
 *
 * Conventions:
 * - metricKey is stable and referenced in performance_snapshots
 * - direction = "higher_is_better" | "lower_is_better"
 * - targetValue is the goal; below warnThreshold = coaching flag
 * - weight sums to ~1.0 per role for composite scoring
 */

export type MetricDirection = "higher_is_better" | "lower_is_better";

export type RoleMetricDefinition = {
  metricKey: string;
  label: string;
  description: string;
  unit: "percent" | "count" | "hours" | "minutes" | "days" | "currency";
  direction: MetricDirection;
  targetValue: number;
  warnThreshold: number;
  criticalThreshold: number;
  weight: number;
};

export type RoleMetricPack = {
  role: string;
  label: string;
  metrics: RoleMetricDefinition[];
};

export const ROLE_METRICS: Record<string, RoleMetricPack> = {
  intake_agent: {
    role: "intake_agent",
    label: "Intake Specialist",
    metrics: [
      {
        metricKey: "new_leads_handled_per_day",
        label: "New leads handled / day",
        description: "Number of new leads this agent touched today",
        unit: "count",
        direction: "higher_is_better",
        targetValue: 20,
        warnThreshold: 15,
        criticalThreshold: 10,
        weight: 0.2,
      },
      {
        metricKey: "lead_conversion_rate",
        label: "Lead conversion rate",
        description:
          "Share of leads assigned to this agent that converted to a full-rep contract",
        unit: "percent",
        direction: "higher_is_better",
        targetValue: 35,
        warnThreshold: 28,
        criticalThreshold: 20,
        weight: 0.35,
      },
      {
        metricKey: "contracts_sent_per_day",
        label: "Contracts sent / day",
        description: "Contracts dispatched by this agent each day",
        unit: "count",
        direction: "higher_is_better",
        targetValue: 8,
        warnThreshold: 5,
        criticalThreshold: 3,
        weight: 0.15,
      },
      {
        metricKey: "avg_response_time_minutes",
        label: "Average response time (minutes)",
        description: "Average time to respond to an inbound lead",
        unit: "minutes",
        direction: "lower_is_better",
        targetValue: 15,
        warnThreshold: 60,
        criticalThreshold: 120,
        weight: 0.2,
      },
      {
        metricKey: "follow_up_compliance_rate",
        label: "Follow-up compliance",
        description: "Share of scheduled lead follow-ups completed on time",
        unit: "percent",
        direction: "higher_is_better",
        targetValue: 90,
        warnThreshold: 75,
        criticalThreshold: 60,
        weight: 0.1,
      },
    ],
  },

  case_manager: {
    role: "case_manager",
    label: "Case Manager",
    metrics: [
      {
        metricKey: "task_completion_rate",
        label: "Task completion rate",
        description: "Share of assigned tasks completed by due date",
        unit: "percent",
        direction: "higher_is_better",
        targetValue: 90,
        warnThreshold: 75,
        criticalThreshold: 60,
        weight: 0.25,
      },
      {
        metricKey: "avg_response_time_minutes",
        label: "Avg client response time (minutes)",
        description: "Average minutes from inbound client message to reply",
        unit: "minutes",
        direction: "lower_is_better",
        targetValue: 60,
        warnThreshold: 240,
        criticalThreshold: 720,
        weight: 0.25,
      },
      {
        metricKey: "unread_messages_backlog",
        label: "Unread message backlog",
        description: "Count of client messages still unread",
        unit: "count",
        direction: "lower_is_better",
        targetValue: 0,
        warnThreshold: 10,
        criticalThreshold: 25,
        weight: 0.15,
      },
      {
        metricKey: "active_cases",
        label: "Active cases",
        description: "Number of active cases owned by this manager",
        unit: "count",
        direction: "higher_is_better",
        targetValue: 100,
        warnThreshold: 50,
        criticalThreshold: 25,
        weight: 0.1,
      },
      {
        metricKey: "stage_transitions_per_week",
        label: "Stage transitions / week",
        description:
          "Case progress indicator — how many cases moved forward this week",
        unit: "count",
        direction: "higher_is_better",
        targetValue: 15,
        warnThreshold: 8,
        criticalThreshold: 4,
        weight: 0.15,
      },
      {
        metricKey: "stagnant_case_count",
        label: "Stagnant case count",
        description: "Cases owned with no activity in 14+ days",
        unit: "count",
        direction: "lower_is_better",
        targetValue: 0,
        warnThreshold: 5,
        criticalThreshold: 15,
        weight: 0.1,
      },
    ],
  },

  filing_agent: {
    role: "filing_agent",
    label: "Filing Agent",
    metrics: [
      {
        metricKey: "applications_filed_per_day",
        label: "Applications filed / day",
        description: "SSDI + SSI applications submitted per day",
        unit: "count",
        direction: "higher_is_better",
        targetValue: 12,
        warnThreshold: 8,
        criticalThreshold: 5,
        weight: 0.35,
      },
      {
        metricKey: "avg_time_ready_to_filed_hours",
        label: "Ready → Filed turnaround",
        description:
          "Average hours from case hitting Ready to File to submission",
        unit: "hours",
        direction: "lower_is_better",
        targetValue: 24,
        warnThreshold: 72,
        criticalThreshold: 168,
        weight: 0.3,
      },
      {
        metricKey: "queue_depth",
        label: "Queue depth",
        description: "Cases waiting in the ready-to-file queue",
        unit: "count",
        direction: "lower_is_better",
        targetValue: 10,
        warnThreshold: 30,
        criticalThreshold: 60,
        weight: 0.15,
      },
      {
        metricKey: "filing_error_rate",
        label: "Filing error/reject rate",
        description: "Share of filings rejected by SSA",
        unit: "percent",
        direction: "lower_is_better",
        targetValue: 2,
        warnThreshold: 8,
        criticalThreshold: 15,
        weight: 0.2,
      },
    ],
  },

  medical_records: {
    role: "medical_records",
    label: "Medical Records Specialist",
    metrics: [
      {
        metricKey: "mr_requests_sent_per_day",
        label: "MR requests sent / day",
        description: "Medical record requests dispatched each day",
        unit: "count",
        direction: "higher_is_better",
        targetValue: 20,
        warnThreshold: 12,
        criticalThreshold: 8,
        weight: 0.25,
      },
      {
        metricKey: "mr_request_turnaround_days",
        label: "MR request turnaround",
        description: "Avg days from case-needs-records → first records in",
        unit: "days",
        direction: "lower_is_better",
        targetValue: 21,
        warnThreshold: 35,
        criticalThreshold: 60,
        weight: 0.2,
      },
      {
        metricKey: "follow_up_compliance_rate",
        label: "Follow-up compliance",
        description:
          "Share of MR requests with a follow-up logged within 14 days",
        unit: "percent",
        direction: "higher_is_better",
        targetValue: 95,
        warnThreshold: 80,
        criticalThreshold: 65,
        weight: 0.25,
      },
      {
        metricKey: "records_complete_by_hearing_date",
        label: "Records complete by hearing",
        description:
          "Share of cases with complete records by hearing date (14-day check)",
        unit: "percent",
        direction: "higher_is_better",
        targetValue: 95,
        warnThreshold: 80,
        criticalThreshold: 65,
        weight: 0.15,
      },
      {
        metricKey: "rfc_forms_completed_per_week",
        label: "RFC forms completed / week",
        description: "RFC forms fully completed",
        unit: "count",
        direction: "higher_is_better",
        targetValue: 8,
        warnThreshold: 5,
        criticalThreshold: 2,
        weight: 0.15,
      },
    ],
  },

  phi_sheet_writer: {
    role: "phi_sheet_writer",
    label: "PHI Sheet Writer",
    metrics: [
      {
        metricKey: "phi_sheets_completed_per_week",
        label: "PHI sheets completed / week",
        description: "Number of PHI sheets fully written and submitted",
        unit: "count",
        direction: "higher_is_better",
        targetValue: 15,
        warnThreshold: 10,
        criticalThreshold: 5,
        weight: 0.35,
      },
      {
        metricKey: "phi_sheet_turnaround_hours",
        label: "PHI sheet turnaround",
        description: "Average hours from assigned → completed",
        unit: "hours",
        direction: "lower_is_better",
        targetValue: 24,
        warnThreshold: 48,
        criticalThreshold: 96,
        weight: 0.25,
      },
      {
        metricKey: "overdue_phi_sheet_count",
        label: "Overdue PHI sheets",
        description: "Assigned sheets past their deadline",
        unit: "count",
        direction: "lower_is_better",
        targetValue: 0,
        warnThreshold: 3,
        criticalThreshold: 8,
        weight: 0.2,
      },
      {
        metricKey: "phi_review_cycle_count",
        label: "PHI review cycles",
        description:
          "Average number of review cycles before a sheet is approved",
        unit: "count",
        direction: "lower_is_better",
        targetValue: 1,
        warnThreshold: 2,
        criticalThreshold: 3,
        weight: 0.2,
      },
    ],
  },

  attorney: {
    role: "attorney",
    label: "Attorney",
    metrics: [
      {
        metricKey: "hearings_this_week",
        label: "Hearings this week",
        description: "Scheduled hearings for this attorney in the next 7 days",
        unit: "count",
        direction: "higher_is_better",
        targetValue: 5,
        warnThreshold: 2,
        criticalThreshold: 0,
        weight: 0.15,
      },
      {
        metricKey: "win_rate",
        label: "Win rate",
        description: "Share of hearings resulting in a favorable decision",
        unit: "percent",
        direction: "higher_is_better",
        targetValue: 60,
        warnThreshold: 45,
        criticalThreshold: 35,
        weight: 0.3,
      },
      {
        metricKey: "prep_completion_rate",
        label: "Prep completion rate",
        description: "Share of hearings fully prepped ≥3 days prior",
        unit: "percent",
        direction: "higher_is_better",
        targetValue: 95,
        warnThreshold: 80,
        criticalThreshold: 60,
        weight: 0.25,
      },
      {
        metricKey: "avg_case_age_days",
        label: "Average case age (days)",
        description: "Average age of active cases in days",
        unit: "days",
        direction: "lower_is_better",
        targetValue: 180,
        warnThreshold: 365,
        criticalThreshold: 540,
        weight: 0.15,
      },
      {
        metricKey: "client_nps",
        label: "Client NPS",
        description: "Client net promoter score across closed cases",
        unit: "count",
        direction: "higher_is_better",
        targetValue: 50,
        warnThreshold: 30,
        criticalThreshold: 10,
        weight: 0.15,
      },
    ],
  },

  hearing_advocate: {
    role: "hearing_advocate",
    label: "Hearing Advocate",
    metrics: [
      {
        metricKey: "hearings_represented_per_week",
        label: "Hearings represented / week",
        description: "Number of hearings this advocate represented",
        unit: "count",
        direction: "higher_is_better",
        targetValue: 10,
        warnThreshold: 6,
        criticalThreshold: 3,
        weight: 0.2,
      },
      {
        metricKey: "win_rate",
        label: "Win rate",
        description: "Share of hearings won",
        unit: "percent",
        direction: "higher_is_better",
        targetValue: 60,
        warnThreshold: 45,
        criticalThreshold: 35,
        weight: 0.4,
      },
      {
        metricKey: "avg_transcript_qc_score",
        label: "Avg call transcript QC score",
        description: "Average QC score across this advocate's call transcripts",
        unit: "count",
        direction: "higher_is_better",
        targetValue: 85,
        warnThreshold: 70,
        criticalThreshold: 55,
        weight: 0.2,
      },
      {
        metricKey: "prep_completion_rate",
        label: "Prep completion rate",
        description: "Share of hearings with PHI + MR + brief ready on time",
        unit: "percent",
        direction: "higher_is_better",
        targetValue: 95,
        warnThreshold: 80,
        criticalThreshold: 65,
        weight: 0.2,
      },
    ],
  },

  fee_collection: {
    role: "fee_collection",
    label: "Fee Collection Specialist",
    metrics: [
      {
        metricKey: "fee_petition_filing_days",
        label: "Fee petition filing turnaround",
        description:
          "Avg days from favorable decision to fee petition filed with SSA",
        unit: "days",
        direction: "lower_is_better",
        targetValue: 7,
        warnThreshold: 21,
        criticalThreshold: 45,
        weight: 0.3,
      },
      {
        metricKey: "fee_collection_rate",
        label: "Fee collection rate",
        description: "Share of awarded fees actually collected within 90 days",
        unit: "percent",
        direction: "higher_is_better",
        targetValue: 95,
        warnThreshold: 85,
        criticalThreshold: 70,
        weight: 0.4,
      },
      {
        metricKey: "delinquent_fee_followup_compliance",
        label: "Delinquent follow-up compliance",
        description: "Share of unpaid fees with a follow-up logged this week",
        unit: "percent",
        direction: "higher_is_better",
        targetValue: 100,
        warnThreshold: 85,
        criticalThreshold: 70,
        weight: 0.3,
      },
    ],
  },

  appeals_council: {
    role: "appeals_council",
    label: "Appeals Council Brief Writer",
    metrics: [
      {
        metricKey: "ac_briefs_submitted_per_week",
        label: "AC briefs submitted / week",
        description: "Appeals Council briefs filed each week",
        unit: "count",
        direction: "higher_is_better",
        targetValue: 8,
        warnThreshold: 5,
        criticalThreshold: 2,
        weight: 0.3,
      },
      {
        metricKey: "ac_briefs_on_time_rate",
        label: "AC briefs on-time rate",
        description:
          "Share of AC briefs filed before the 65-day appeal deadline",
        unit: "percent",
        direction: "higher_is_better",
        targetValue: 100,
        warnThreshold: 95,
        criticalThreshold: 85,
        weight: 0.35,
      },
      {
        metricKey: "ac_grant_rate",
        label: "AC remand/grant rate",
        description:
          "Share of AC submissions that resulted in remand or grant",
        unit: "percent",
        direction: "higher_is_better",
        targetValue: 25,
        warnThreshold: 15,
        criticalThreshold: 5,
        weight: 0.35,
      },
    ],
  },

  pre_hearing_prep: {
    role: "pre_hearing_prep",
    label: "Pre-Hearing Prep",
    metrics: [
      {
        metricKey: "prehearing_briefs_drafted_per_week",
        label: "Briefs drafted / week",
        description: "Pre-hearing briefs fully drafted each week",
        unit: "count",
        direction: "higher_is_better",
        targetValue: 12,
        warnThreshold: 8,
        criticalThreshold: 4,
        weight: 0.35,
      },
      {
        metricKey: "brief_on_time_rate",
        label: "Brief on-time rate",
        description: "Share of briefs delivered ≥3 days before hearing",
        unit: "percent",
        direction: "higher_is_better",
        targetValue: 98,
        warnThreshold: 90,
        criticalThreshold: 75,
        weight: 0.35,
      },
      {
        metricKey: "evidence_incorporation_rate",
        label: "Evidence incorporation rate",
        description:
          "Share of briefs incorporating all available medical evidence",
        unit: "percent",
        direction: "higher_is_better",
        targetValue: 95,
        warnThreshold: 80,
        criticalThreshold: 65,
        weight: 0.3,
      },
    ],
  },

  post_hearing: {
    role: "post_hearing",
    label: "Post-Hearing Processing",
    metrics: [
      {
        metricKey: "post_hearing_processing_days",
        label: "Post-hearing processing days",
        description:
          "Avg days from hearing outcome to complete post-hearing processing",
        unit: "days",
        direction: "lower_is_better",
        targetValue: 3,
        warnThreshold: 7,
        criticalThreshold: 14,
        weight: 0.5,
      },
      {
        metricKey: "client_notification_compliance",
        label: "Client notification compliance",
        description:
          "Share of hearings with client notification logged within 48 hours",
        unit: "percent",
        direction: "higher_is_better",
        targetValue: 100,
        warnThreshold: 90,
        criticalThreshold: 75,
        weight: 0.5,
      },
    ],
  },

  mail_clerk: {
    role: "mail_clerk",
    label: "Mail Clerk",
    metrics: [
      {
        metricKey: "mail_items_processed_per_day",
        label: "Items processed / day",
        description: "Physical mail items scanned, categorized, attached",
        unit: "count",
        direction: "higher_is_better",
        targetValue: 60,
        warnThreshold: 40,
        criticalThreshold: 20,
        weight: 0.4,
      },
      {
        metricKey: "avg_mail_routing_minutes",
        label: "Avg mail routing time",
        description: "Avg minutes from received → attached to case",
        unit: "minutes",
        direction: "lower_is_better",
        targetValue: 30,
        warnThreshold: 90,
        criticalThreshold: 240,
        weight: 0.3,
      },
      {
        metricKey: "unprocessed_mail_aging_hours",
        label: "Unprocessed mail aging",
        description: "Oldest unprocessed mail item age in hours",
        unit: "hours",
        direction: "lower_is_better",
        targetValue: 4,
        warnThreshold: 24,
        criticalThreshold: 72,
        weight: 0.3,
      },
    ],
  },

  reviewer: {
    role: "reviewer",
    label: "Reviewer / Leadership",
    metrics: [
      {
        metricKey: "intake_review_backlog",
        label: "Intake review backlog",
        description: "Intake items awaiting reviewer approval",
        unit: "count",
        direction: "lower_is_better",
        targetValue: 0,
        warnThreshold: 5,
        criticalThreshold: 15,
        weight: 0.5,
      },
      {
        metricKey: "avg_review_turnaround_hours",
        label: "Avg review turnaround",
        description: "Average hours from submission → review decision",
        unit: "hours",
        direction: "lower_is_better",
        targetValue: 24,
        warnThreshold: 48,
        criticalThreshold: 96,
        weight: 0.5,
      },
    ],
  },

  admin: {
    role: "admin",
    label: "Administrator",
    metrics: [
      {
        metricKey: "active_ere_credentials",
        label: "Active ERE credentials",
        description: "Total active ERE credentials across the firm",
        unit: "count",
        direction: "higher_is_better",
        targetValue: 170,
        warnThreshold: 160,
        criticalThreshold: 140,
        weight: 1.0,
      },
    ],
  },
};

/**
 * Lookup helper — returns an empty pack if the role isn't defined.
 */
export function getRoleMetricPack(role: string): RoleMetricPack {
  return (
    ROLE_METRICS[role] ?? {
      role,
      label: role,
      metrics: [],
    }
  );
}

/**
 * Check whether a value breaches a metric's warning or critical
 * threshold. Returns null if healthy, "warn", or "critical".
 */
export function evaluateMetric(
  metric: RoleMetricDefinition,
  value: number,
): null | "warn" | "critical" {
  if (metric.direction === "higher_is_better") {
    if (value <= metric.criticalThreshold) return "critical";
    if (value <= metric.warnThreshold) return "warn";
    return null;
  }
  if (value >= metric.criticalThreshold) return "critical";
  if (value >= metric.warnThreshold) return "warn";
  return null;
}

/**
 * Compute a composite 0-100 score for a user against their role pack.
 * Each metric is normalized to 0-100 based on target/warn/critical,
 * then weighted-averaged per the role config.
 */
export function computeCompositeScore(
  role: string,
  values: Record<string, number>,
): number {
  const pack = getRoleMetricPack(role);
  if (pack.metrics.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const metric of pack.metrics) {
    const value = values[metric.metricKey];
    if (value === undefined || value === null) continue;

    // Normalize to 0-100
    let normalized: number;
    if (metric.direction === "higher_is_better") {
      if (value >= metric.targetValue) normalized = 100;
      else if (value <= metric.criticalThreshold) normalized = 0;
      else {
        // Linear interp between critical (0) and target (100)
        normalized =
          ((value - metric.criticalThreshold) /
            (metric.targetValue - metric.criticalThreshold)) *
          100;
      }
    } else {
      if (value <= metric.targetValue) normalized = 100;
      else if (value >= metric.criticalThreshold) normalized = 0;
      else {
        normalized =
          ((metric.criticalThreshold - value) /
            (metric.criticalThreshold - metric.targetValue)) *
          100;
      }
    }

    weightedSum += normalized * metric.weight;
    totalWeight += metric.weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round(weightedSum / totalWeight);
}
