/**
 * Per-persona dashboard sub-nav data. Discriminated union keyed by `kind`.
 * The matching server action `getDashboardSubnavData()` returns the variant
 * for the active persona; the dispatcher in `components/dashboard/subnav`
 * narrows on `kind` and renders the corresponding component.
 */

export type SubnavRecentItem = {
  id: string;
  title: string;
  meta?: string;
  href?: string;
  tone?: "green" | "blue" | "amber" | "red" | "purple";
};

export type CaseManagerSubnavData = {
  kind: "case_manager";
  /** AI Next-Action Queue — ranked items needing 1 decision each */
  nextActions: Array<{
    id: string;
    title: string;
    caseNumber: string | null;
    caseId: string | null;
    actionVerb: string;
    tone: "bad" | "warn" | "info";
  }>;
  /** Sentiment-cooling threads ticker */
  coolingThreads: SubnavRecentItem[];
  todayTaskCount: number;
  unreadUrgent: number;
};

export type AttorneySubnavData = {
  kind: "attorney";
  /** The next hearing's prep state (the anchor widget) */
  nextHearing: {
    caseId: string;
    caseNumber: string | null;
    alj: string | null;
    aljWinRate: number | null;
    countdown: string;
    prepCheckList: Array<{ label: string; ok: boolean }>;
  } | null;
  /** Mixed recent feed (ALJ encounters + cases + decisions logged) */
  recentFeed: SubnavRecentItem[];
  hearingsThisWeek: number;
};

export type ReviewerSubnavData = {
  kind: "reviewer";
  /** Top "Needs Your Eyes" items — already ranked */
  needsYourEyes: Array<{
    id: string;
    title: string;
    severity: "critical" | "high" | "medium";
    href?: string;
  }>;
  recentEscalations: SubnavRecentItem[];
  unackedCount: number;
};

export type AdminSubnavData = {
  kind: "admin";
  /** Live cron schedule with last-run state */
  cronStatus: Array<{
    name: string;
    lastRunAgo: string;
    healthy: boolean;
  }>;
  recentAdminEvents: SubnavRecentItem[];
  openCompliance: number;
  activeUsers: number;
};

export type MailClerkSubnavData = {
  kind: "mail_clerk";
  inboundCount: number;
  unmatchedCount: number;
  outboundInTransit: number;
  oldestPieceDays: number;
  recentMatched: SubnavRecentItem[];
};

export type IntakeAgentSubnavData = {
  kind: "intake_agent";
  /** AI-confidence histogram routing leads to triage buckets */
  aiConfidenceBuckets: {
    autoApproved: number;
    borderline: number;
    declined: number;
  };
  /** Recent decline reasons grouped */
  declineReasonTrends: Array<{ reason: string; count: number }>;
  contractsPendingSignature: number;
  newToday: number;
  recentConversions: SubnavRecentItem[];
};

export type MedicalRecordsSubnavData = {
  kind: "medical_records";
  /** Provider top-10 by response time (anchor widget) */
  providerResponseTimes: Array<{
    name: string;
    avgDays: number | null;
    pendingCount: number;
  }>;
  expiringCredentials: number;
  rfcAwaitingDoctor: number;
  myTeamColor: string | null;
  recentCompleted: SubnavRecentItem[];
};

export type FeeCollectionSubnavData = {
  kind: "fee_collection";
  /** Last 24h confirmed payments (anchor widget) */
  recentPayments: Array<{
    id: string;
    caseNumber: string | null;
    amountDollars: number;
    relativeTime: string;
  }>;
  /** Dispute pipeline counts */
  disputes: {
    opened: number;
    underReview: number;
    resolved7d: number;
  };
  totalAtRiskDollars: number;
};

export type FilingAgentSubnavData = {
  kind: "filing_agent";
  /** Auto-approval threshold (mocked at 85% until ereJobs.confidence_score lands) */
  currentConfidenceThreshold: number;
  /** Failure clusters by error keyword */
  errorClusters: Array<{ label: string; count: number }>;
  ereQueueCount: number;
  failedLast7d: number;
  recentRejections: SubnavRecentItem[];
};

export type PhiSheetWriterSubnavData = {
  kind: "phi_sheet_writer";
  /**
   * Silent-rewrite alerts — cases where your sheet was completed but the
   * attorney still rewrote it before the hearing. Approximated until
   * phi_sheet_revisions table lands.
   */
  silentRewriteCount: number;
  /** Top attorneys you write for, ranked by revision rate */
  attorneyPairings: Array<{
    attorney: string;
    sheetsCount: number;
    revisionRate: number | null;
  }>;
  sheetsThisWeek: number;
  recentApproved: SubnavRecentItem[];
};

export type AppealsCouncilSubnavData = {
  kind: "appeals_council";
  /** Top ALJs by AC remand rate (the load-bearing pattern-knowledge) */
  aljRemandTracker: Array<{
    alj: string;
    totalDecisions: number;
    remandedRate: number;
  }>;
  /** Common error themes (placeholder until error_themes table lands) */
  recentErrorThemes: Array<{ theme: string; count: number }>;
  briefsDueIn7d: number;
  grantsThisMonth: number;
};

export type PostHearingSubnavData = {
  kind: "post_hearing";
  /** Anomaly Inbox — AI self-contradictions worth a human eyeball */
  anomalies: Array<{
    id: string;
    title: string;
    detail: string;
    href?: string;
  }>;
  awaitingNotification: number;
  blockedTransitions: number;
  recentInterventions: SubnavRecentItem[];
};

export type PreHearingPrepSubnavData = {
  kind: "pre_hearing_prep";
  /** Per-attorney revision-rate leaderboard — which need extra polish */
  attorneyRevisionRates: Array<{
    attorney: string;
    inReview: number;
    completed: number;
  }>;
  briefsThisWeek: number;
  heaviestCaseDays: number | null;
  recentSent: SubnavRecentItem[];
};

export type DefaultSubnavData = {
  kind: "default";
  casesCount: number;
  todayTaskCount: number;
  hearingsThisWeek: number;
};

export type DashboardSubnavData =
  | CaseManagerSubnavData
  | AttorneySubnavData
  | ReviewerSubnavData
  | AdminSubnavData
  | MailClerkSubnavData
  | IntakeAgentSubnavData
  | MedicalRecordsSubnavData
  | FeeCollectionSubnavData
  | FilingAgentSubnavData
  | PhiSheetWriterSubnavData
  | AppealsCouncilSubnavData
  | PostHearingSubnavData
  | PreHearingPrepSubnavData
  | DefaultSubnavData;
