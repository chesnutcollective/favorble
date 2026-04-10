"use server";

import { getActiveCaseCount } from "@/app/actions/cases";
import {
  getTasksDueTodayCount,
  getOverdueTaskCount,
} from "@/app/actions/tasks";

export type UrgentItem = {
  id: string;
  type: "overdue" | "warning" | "critical";
  text: string;
  caseRef: string;
  action: string;
};

export type StatCardData = {
  label: string;
  value: string | number;
  trend: { value: number; label: string };
  sparkColor: string;
  sparkPath: string;
};

export type FunnelStage = {
  label: string;
  count: number;
  pct: number;
  color: string;
};

export type WinRateData = {
  rate: number;
  won: number;
  denied: number;
  pending: number;
};

export type DenialReason = {
  label: string;
  pct: number;
  color: string;
  colSpan?: number;
  rowSpan?: number;
};

export type AppealsLevel = {
  label: string;
  pct: number;
  color: string;
};

export type RfcLimitation = {
  limitation: string;
  count: number;
  type: "physical" | "mental";
};

export type CeOutcomes = {
  supportive: number;
  neutral: number;
  unsupportive: number;
};

export type VocationalExpert = {
  dotCode: string;
  jobTitle: string;
  exertionalLevel: string;
  frequency: number;
};

export type UpcomingHearing = {
  caseId: string;
  caseName: string;
  aljName: string;
  hearingDate: string;
  prepProgress: number;
  daysUntil: number;
};

export type ClientSatisfaction = {
  score: number;
  trend: number;
};

export type CaseByMonth = {
  month: string;
  opened: number;
  closed: number;
};

export type RevenueByMonth = {
  month: string;
  amount: number;
};

export type TaskSparkline = {
  name: string;
  sparklineData: number[];
  currentRate: number;
};

export type WeeklyVelocity = {
  week: string;
  opened: number;
  closed: number;
  tasksCompleted: number;
  docsProcessed: number;
};

export type ActivityItem = {
  id: string;
  action: string;
  entityType: string;
  description: string;
  userName: string;
  timestamp: string;
};

export type RecentDecision = {
  caseId: string;
  caseName: string;
  aljName: string;
  outcome: string;
  pastDueBenefits: number;
  decisionDate: string;
};

export type TeamMemberActivity = {
  userName: string;
  hourlyActivity: number[];
};

export type DocumentQueue = {
  received: number;
  ocrd: number;
  classified: number;
  reviewed: number;
};

export type AljApprovalRate = {
  aljName: string;
  favorable: number;
  unfavorable: number;
  remand: number;
  total: number;
};

export type ListingMatch = {
  listing: string;
  count: number;
  winRate: number;
};

export type DenialPattern = {
  reason: string;
  monthlyData: number[];
};

export type TimeToHearingItem = {
  hearingOffice: string;
  caseId: string;
  daysToHearing: number;
};

export type PastDueProjectionItem = {
  month: string;
  projected: number;
};

export type CaseComplexityItem = {
  score: number;
  count: number;
};

export type DashboardData = {
  stats: StatCardData[];
  urgentItems: UrgentItem[];
  funnelStages: FunnelStage[];
  winRate: WinRateData;
  denialReasons: DenialReason[];
  appealsLevels: AppealsLevel[];
  rfcLimitations: RfcLimitation[];
  ceOutcomes: CeOutcomes;
  vocationalExperts: VocationalExpert[];
  upcomingHearings: UpcomingHearing[];
  clientSatisfaction: ClientSatisfaction;
  casesByMonth: CaseByMonth[];
  revenueByMonth: RevenueByMonth[];
  taskSparklines: TaskSparkline[];
  weeklyVelocity: WeeklyVelocity[];
  recentActivity: ActivityItem[];
  recentDecisions: RecentDecision[];
  teamActivity: TeamMemberActivity[];
  documentQueue: DocumentQueue;
  aljApprovalRates: AljApprovalRate[];
  listingMatchData: ListingMatch[];
  denialPatterns: DenialPattern[];
  timeToHearing: TimeToHearingItem[];
  pastDueProjection: PastDueProjectionItem[];
  caseComplexity: CaseComplexityItem[];
};

export async function getDashboardData(): Promise<DashboardData> {
  let activeCases = 0;
  let tasksDueToday = 0;
  let overdueTaskCount = 0;

  try {
    [activeCases, tasksDueToday, overdueTaskCount] = await Promise.all([
      getActiveCaseCount(),
      getTasksDueTodayCount(),
      getOverdueTaskCount(),
    ]);
  } catch {
    // DB unavailable — use fallback values
  }

  const stats: StatCardData[] = [
    {
      label: "Active Cases",
      value: activeCases || 847,
      trend: { value: 12, label: "this week" },
      sparkColor: "#0070F3",
      sparkPath: "M0,28 L8,24 L16,26 L24,20 L32,18 L40,14 L48,16 L56,10 L64,6",
    },
    {
      label: "Pending Tasks",
      value: tasksDueToday || 38,
      trend: {
        value: overdueTaskCount > 0 ? -overdueTaskCount : -5,
        label: "overdue",
      },
      sparkColor: "#F5A623",
      sparkPath: "M0,20 L8,18 L16,22 L24,16 L32,20 L40,24 L48,18 L56,22 L64,16",
    },
    {
      label: "Win Rate %",
      value: "67%",
      trend: { value: 3, label: "vs prior" },
      sparkColor: "#1d72b8",
      sparkPath: "M0,26 L8,22 L16,24 L24,20 L32,16 L40,18 L48,12 L56,10 L64,8",
    },
    {
      label: "Revenue MTD",
      value: "$184K",
      trend: { value: 22, label: "vs prior" },
      sparkColor: "#0070F3",
      sparkPath: "M0,24 L8,22 L16,20 L24,18 L32,22 L40,14 L48,10 L56,12 L64,4",
    },
    {
      label: "Avg Days to Hearing",
      value: 287,
      trend: { value: -14, label: "days" },
      sparkColor: "#EE0000",
      sparkPath: "M0,16 L8,18 L16,14 L24,20 L32,18 L40,22 L48,20 L56,24 L64,22",
    },
  ];

  const urgentItems: UrgentItem[] = [
    {
      id: "1",
      type: "overdue",
      text: "Overdue task: Request medical records for",
      caseRef: "Thompson v. SSA",
      action: "Resolve",
    },
    {
      id: "2",
      type: "critical",
      text: "Hearing in 48 hours:",
      caseRef: "Garcia v. SSA",
      action: "View",
    },
    {
      id: "3",
      type: "warning",
      text: "Missing evidence:",
      caseRef: "Williams v. SSA",
      action: "Upload",
    },
    {
      id: "4",
      type: "overdue",
      text: "Deadline tomorrow: Appeals Council brief for",
      caseRef: "Rodriguez v. SSA",
      action: "Draft",
    },
    {
      id: "5",
      type: "warning",
      text: "Client unresponsive:",
      caseRef: "Davis v. SSA",
      action: "Escalate",
    },
  ];

  const funnelStages: FunnelStage[] = [
    { label: "Initial App", count: 342, pct: 100, color: "#0070F3" },
    { label: "Reconsideration", count: 233, pct: 68, color: "#2B8CF7" },
    { label: "ALJ Hearing", count: 156, pct: 45, color: "#5DA8F9" },
    { label: "Appeals Council", count: 76, pct: 22, color: "#8EC3FB" },
    { label: "Federal Court", count: 40, pct: 12, color: "#B8D9FD" },
  ];

  const winRate: WinRateData = {
    rate: 67,
    won: 567,
    denied: 279,
    pending: 156,
  };

  const denialReasons: DenialReason[] = [
    {
      label: "Insufficient\nEvidence",
      pct: 40,
      color: "#0070F3",
      colSpan: 2,
      rowSpan: 2,
    },
    { label: "SGA", pct: 15, color: "#7928CA" },
    { label: "Duration", pct: 12, color: "#00B4D8" },
    { label: "Non-Compliant", pct: 10, color: "#0D9488" },
    { label: "RFC Mismatch", pct: 8, color: "#F5A623" },
    { label: "Grid Rules / Age", pct: 7, color: "#EE0000", colSpan: 2 },
    { label: "Other", pct: 8, color: "#999", colSpan: 2 },
  ];

  const appealsLevels: AppealsLevel[] = [
    { label: "Initial App", pct: 33, color: "#0070F3" },
    { label: "Reconsideration", pct: 15, color: "#F5A623" },
    { label: "ALJ Hearing", pct: 52, color: "#1d72b8" },
    { label: "Appeals Council", pct: 12, color: "#7928CA" },
    { label: "Federal Court", pct: 8, color: "#EE0000" },
  ];

  const rfcLimitations: RfcLimitation[] = [
    { limitation: "Lifting", count: 45, type: "physical" },
    { limitation: "Lifting", count: 12, type: "mental" },
    { limitation: "Standing", count: 38, type: "physical" },
    { limitation: "Standing", count: 8, type: "mental" },
    { limitation: "Concentration", count: 10, type: "physical" },
    { limitation: "Concentration", count: 42, type: "mental" },
    { limitation: "Social", count: 5, type: "physical" },
    { limitation: "Social", count: 35, type: "mental" },
    { limitation: "Sitting", count: 28, type: "physical" },
    { limitation: "Sitting", count: 6, type: "mental" },
  ];

  const ceOutcomes: CeOutcomes = {
    supportive: 42,
    neutral: 28,
    unsupportive: 18,
  };

  const vocationalExperts: VocationalExpert[] = [
    {
      dotCode: "209.562-010",
      jobTitle: "Cashier II",
      exertionalLevel: "Light",
      frequency: 34,
    },
    {
      dotCode: "239.567-010",
      jobTitle: "Info Clerk",
      exertionalLevel: "Sedentary",
      frequency: 28,
    },
    {
      dotCode: "222.587-038",
      jobTitle: "Marker",
      exertionalLevel: "Light",
      frequency: 22,
    },
    {
      dotCode: "249.587-018",
      jobTitle: "Document Prep",
      exertionalLevel: "Sedentary",
      frequency: 18,
    },
    {
      dotCode: "209.587-034",
      jobTitle: "Sorter",
      exertionalLevel: "Light",
      frequency: 15,
    },
  ];

  const upcomingHearings: UpcomingHearing[] = [
    {
      caseId: "c1",
      caseName: "Garcia v. SSA",
      aljName: "Judge Harrison",
      hearingDate: "2026-04-01",
      prepProgress: 85,
      daysUntil: 4,
    },
    {
      caseId: "c2",
      caseName: "Thompson v. SSA",
      aljName: "Judge Patel",
      hearingDate: "2026-04-05",
      prepProgress: 60,
      daysUntil: 8,
    },
    {
      caseId: "c3",
      caseName: "Williams v. SSA",
      aljName: "Judge Brennan",
      hearingDate: "2026-04-10",
      prepProgress: 35,
      daysUntil: 13,
    },
    {
      caseId: "c4",
      caseName: "Rodriguez v. SSA",
      aljName: "Judge Chen",
      hearingDate: "2026-04-15",
      prepProgress: 20,
      daysUntil: 18,
    },
  ];

  const clientSatisfaction: ClientSatisfaction = { score: 4.6, trend: 0.3 };

  const casesByMonth: CaseByMonth[] = [
    { month: "Oct", opened: 12, closed: 8 },
    { month: "Nov", opened: 15, closed: 10 },
    { month: "Dec", opened: 9, closed: 14 },
    { month: "Jan", opened: 18, closed: 12 },
    { month: "Feb", opened: 14, closed: 16 },
    { month: "Mar", opened: 20, closed: 11 },
  ];

  const revenueByMonth: RevenueByMonth[] = [
    { month: "Oct", amount: 125000 },
    { month: "Nov", amount: 142000 },
    { month: "Dec", amount: 98000 },
    { month: "Jan", amount: 167000 },
    { month: "Feb", amount: 155000 },
    { month: "Mar", amount: 184000 },
  ];

  const taskSparklines: TaskSparkline[] = [
    {
      name: "Sarah M.",
      sparklineData: [80, 85, 78, 90, 88, 92],
      currentRate: 92,
    },
    {
      name: "John D.",
      sparklineData: [70, 65, 72, 68, 75, 78],
      currentRate: 78,
    },
    {
      name: "Lisa K.",
      sparklineData: [90, 88, 92, 95, 93, 96],
      currentRate: 96,
    },
    {
      name: "Mike R.",
      sparklineData: [55, 60, 58, 62, 65, 68],
      currentRate: 68,
    },
  ];

  const weeklyVelocity: WeeklyVelocity[] = [
    { week: "W1", opened: 5, closed: 3, tasksCompleted: 22, docsProcessed: 45 },
    { week: "W2", opened: 4, closed: 6, tasksCompleted: 28, docsProcessed: 52 },
    { week: "W3", opened: 7, closed: 4, tasksCompleted: 18, docsProcessed: 38 },
    { week: "W4", opened: 4, closed: 5, tasksCompleted: 25, docsProcessed: 48 },
  ];

  const now = new Date();
  const minAgo = (m: number) =>
    new Date(now.getTime() - m * 60000).toISOString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayAt = (h: number, m: number) => {
    const d = new Date(yesterday);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const twoDaysAgoAt = (h: number, m: number) => {
    const d = new Date(twoDaysAgo);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  const recentActivity: ActivityItem[] = [
    {
      id: "a1",
      action: "upload",
      entityType: "document",
      description:
        'filed hearing brief for <span class="font-mono text-xs text-[#0070F3]">Garcia v. SSA</span>',
      userName: "Sarah Mitchell",
      timestamp: minAgo(2),
    },
    {
      id: "a2",
      action: "upload",
      entityType: "document",
      description:
        'uploaded CE report to <span class="font-mono text-xs text-[#0070F3]">Williams v. SSA</span>',
      userName: "James Kim",
      timestamp: minAgo(18),
    },
    {
      id: "a3",
      action: "complete",
      entityType: "task",
      description:
        'completed task "Review medical records" for <span class="font-mono text-xs text-[#0070F3]">Davis v. SSA</span>',
      userName: "Ana Lopez",
      timestamp: minAgo(42),
    },
    {
      id: "a4",
      action: "transition",
      entityType: "stage_change",
      description:
        'moved <span class="font-mono text-xs text-[#0070F3]">Chen v. SSA</span> from Reconsideration to ALJ Hearing',
      userName: "Mike Rivera",
      timestamp: minAgo(60),
    },
    {
      id: "a5",
      action: "update",
      entityType: "hearing",
      description:
        'scheduled pre-hearing conference for <span class="font-mono text-xs text-[#0070F3]">Garcia v. SSA</span>',
      userName: "Sarah Mitchell",
      timestamp: minAgo(95),
    },
    {
      id: "a6",
      action: "create",
      entityType: "note",
      description:
        'added client interview notes to <span class="font-mono text-xs text-[#0070F3]">Thompson v. SSA</span>',
      userName: "Teresa Clark",
      timestamp: minAgo(120),
    },
    {
      id: "a7",
      action: "upload",
      entityType: "document",
      description:
        'uploaded RFC form for <span class="font-mono text-xs text-[#0070F3]">Martinez v. SSA</span>',
      userName: "James Kim",
      timestamp: minAgo(150),
    },
    {
      id: "a8",
      action: "decision",
      entityType: "decision",
      description:
        'received favorable decision on <span class="font-mono text-xs text-[#0070F3]">Patel v. SSA</span> &mdash; $34,200 past-due benefits',
      userName: "Sarah Mitchell",
      timestamp: yesterdayAt(16, 32),
    },
    {
      id: "a9",
      action: "create",
      entityType: "case",
      description:
        'created new case <span class="font-mono text-xs text-[#0070F3]">Robertson v. SSA</span>',
      userName: "James Kim",
      timestamp: yesterdayAt(14, 15),
    },
    {
      id: "a10",
      action: "decision",
      entityType: "decision",
      description:
        'received unfavorable decision on <span class="font-mono text-xs text-[#0070F3]">Murray v. SSA</span> &mdash; filing appeal',
      userName: "Teresa Clark",
      timestamp: yesterdayAt(11, 8),
    },
    {
      id: "a11",
      action: "complete",
      entityType: "task",
      description:
        'completed brief review for <span class="font-mono text-xs text-[#0070F3]">Lee v. SSA</span>',
      userName: "Ana Lopez",
      timestamp: yesterdayAt(10, 22),
    },
    {
      id: "a12",
      action: "upload",
      entityType: "document",
      description:
        'uploaded psychological evaluation to <span class="font-mono text-xs text-[#0070F3]">Foster v. SSA</span>',
      userName: "Mike Rivera",
      timestamp: yesterdayAt(9, 45),
    },
    {
      id: "a13",
      action: "transition",
      entityType: "stage_change",
      description:
        'moved <span class="font-mono text-xs text-[#0070F3]">Robinson v. SSA</span> to Appeals Council',
      userName: "Sarah Mitchell",
      timestamp: yesterdayAt(9, 10),
    },
    {
      id: "a14",
      action: "update",
      entityType: "hearing",
      description:
        'updated hearing exhibits for <span class="font-mono text-xs text-[#0070F3]">Davis v. SSA</span>',
      userName: "Teresa Clark",
      timestamp: yesterdayAt(8, 30),
    },
    {
      id: "a15",
      action: "create",
      entityType: "task",
      description:
        'assigned "Obtain treating physician letter" for <span class="font-mono text-xs text-[#0070F3]">Chen v. SSA</span>',
      userName: "James Kim",
      timestamp: twoDaysAgoAt(16, 0),
    },
    {
      id: "a16",
      action: "upload",
      entityType: "document",
      description:
        'uploaded work history report to <span class="font-mono text-xs text-[#0070F3]">Garcia v. SSA</span>',
      userName: "Ana Lopez",
      timestamp: twoDaysAgoAt(15, 20),
    },
    {
      id: "a17",
      action: "complete",
      entityType: "task",
      description:
        'completed "Review denial letter" for <span class="font-mono text-xs text-[#0070F3]">Thompson v. SSA</span>',
      userName: "Mike Rivera",
      timestamp: twoDaysAgoAt(14, 5),
    },
    {
      id: "a18",
      action: "update",
      entityType: "case",
      description:
        'updated onset date for <span class="font-mono text-xs text-[#0070F3]">Williams v. SSA</span>',
      userName: "Sarah Mitchell",
      timestamp: twoDaysAgoAt(11, 30),
    },
    {
      id: "a19",
      action: "create",
      entityType: "note",
      description:
        'added vocational analysis notes to <span class="font-mono text-xs text-[#0070F3]">Rodriguez v. SSA</span>',
      userName: "Teresa Clark",
      timestamp: twoDaysAgoAt(10, 15),
    },
    {
      id: "a20",
      action: "upload",
      entityType: "document",
      description:
        'uploaded medical summary to <span class="font-mono text-xs text-[#0070F3]">Martinez v. SSA</span>',
      userName: "James Kim",
      timestamp: twoDaysAgoAt(9, 0),
    },
  ];

  const recentDecisions: RecentDecision[] = [
    {
      caseId: "d1",
      caseName: "Patel v. SSA",
      aljName: "Judge Harrison",
      outcome: "favorable",
      pastDueBenefits: 34200,
      decisionDate: "Mar 27, 2026",
    },
    {
      caseId: "d2",
      caseName: "Murray v. SSA",
      aljName: "Judge Whitfield",
      outcome: "unfavorable",
      pastDueBenefits: 0,
      decisionDate: "Mar 27, 2026",
    },
    {
      caseId: "d3",
      caseName: "Robinson v. SSA",
      aljName: "Judge Kowalski",
      outcome: "favorable",
      pastDueBenefits: 28450,
      decisionDate: "Mar 25, 2026",
    },
    {
      caseId: "d4",
      caseName: "Lee v. SSA",
      aljName: "Judge Patel",
      outcome: "favorable",
      pastDueBenefits: 41800,
      decisionDate: "Mar 24, 2026",
    },
    {
      caseId: "d5",
      caseName: "Foster v. SSA",
      aljName: "Judge Okafor",
      outcome: "unfavorable",
      pastDueBenefits: 0,
      decisionDate: "Mar 23, 2026",
    },
    {
      caseId: "d6",
      caseName: "Chen v. SSA",
      aljName: "Judge Brennan",
      outcome: "favorable",
      pastDueBenefits: 22100,
      decisionDate: "Mar 21, 2026",
    },
    {
      caseId: "d7",
      caseName: "Davis v. SSA",
      aljName: "Judge Nguyen",
      outcome: "remand",
      pastDueBenefits: 0,
      decisionDate: "Mar 20, 2026",
    },
    {
      caseId: "d8",
      caseName: "Taylor v. SSA",
      aljName: "Judge Harrison",
      outcome: "favorable",
      pastDueBenefits: 38900,
      decisionDate: "Mar 18, 2026",
    },
  ];

  const teamActivity: TeamMemberActivity[] = [
    {
      userName: "Sarah M.",
      hourlyActivity: [2, 5, 8, 12, 3, 6, 9, 11, 7, 4, 1, 0],
    },
    {
      userName: "James K.",
      hourlyActivity: [1, 4, 7, 10, 5, 2, 8, 9, 6, 3, 0, 0],
    },
    {
      userName: "Ana L.",
      hourlyActivity: [0, 3, 6, 9, 7, 4, 8, 11, 10, 5, 2, 0],
    },
    {
      userName: "Mike R.",
      hourlyActivity: [2, 6, 9, 13, 3, 5, 7, 10, 8, 4, 1, 0],
    },
    {
      userName: "Teresa C.",
      hourlyActivity: [0, 1, 4, 7, 10, 8, 11, 14, 9, 6, 3, 0],
    },
  ];

  const documentQueue: DocumentQueue = {
    received: 23,
    ocrd: 15,
    classified: 8,
    reviewed: 142,
  };

  const aljApprovalRates: AljApprovalRate[] = [
    {
      aljName: "Judge Harrison",
      favorable: 72,
      unfavorable: 18,
      remand: 10,
      total: 120,
    },
    {
      aljName: "Judge Kowalski",
      favorable: 68,
      unfavorable: 20,
      remand: 12,
      total: 95,
    },
    {
      aljName: "Judge Patel",
      favorable: 65,
      unfavorable: 27,
      remand: 8,
      total: 88,
    },
    {
      aljName: "Judge Brennan",
      favorable: 60,
      unfavorable: 25,
      remand: 15,
      total: 102,
    },
    {
      aljName: "Judge Chen",
      favorable: 55,
      unfavorable: 27,
      remand: 18,
      total: 76,
    },
    {
      aljName: "Judge Morales",
      favorable: 50,
      unfavorable: 36,
      remand: 14,
      total: 68,
    },
    {
      aljName: "Judge Sullivan",
      favorable: 48,
      unfavorable: 40,
      remand: 12,
      total: 82,
    },
    {
      aljName: "Judge Fitzgerald",
      favorable: 42,
      unfavorable: 38,
      remand: 20,
      total: 64,
    },
    {
      aljName: "Judge Okafor",
      favorable: 38,
      unfavorable: 48,
      remand: 14,
      total: 58,
    },
    {
      aljName: "Judge Whitfield",
      favorable: 30,
      unfavorable: 60,
      remand: 10,
      total: 44,
    },
  ];

  const listingMatchData: ListingMatch[] = [
    { listing: "12.04 Depression", count: 45, winRate: 62 },
    { listing: "1.04 Spine", count: 38, winRate: 55 },
    { listing: "12.06 Anxiety", count: 32, winRate: 58 },
    { listing: "11.02 Epilepsy", count: 18, winRate: 72 },
    { listing: "14.09 Inflammatory", count: 15, winRate: 48 },
    { listing: "1.02 Joints", count: 28, winRate: 52 },
  ];

  const denialPatterns: DenialPattern[] = [
    {
      reason: "Insufficient Evidence",
      monthlyData: [12, 15, 10, 18, 14, 16, 11, 13, 17, 14, 12, 15],
    },
    { reason: "SGA", monthlyData: [5, 7, 4, 6, 8, 5, 7, 4, 6, 5, 7, 6] },
    { reason: "Duration", monthlyData: [3, 4, 5, 3, 4, 6, 3, 5, 4, 3, 5, 4] },
    {
      reason: "RFC Mismatch",
      monthlyData: [2, 3, 4, 2, 3, 3, 4, 2, 3, 4, 2, 3],
    },
  ];

  const timeToHearing: TimeToHearingItem[] = [
    { hearingOffice: "Baltimore", caseId: "t1", daysToHearing: 245 },
    { hearingOffice: "Chicago", caseId: "t2", daysToHearing: 310 },
    { hearingOffice: "Los Angeles", caseId: "t3", daysToHearing: 380 },
    { hearingOffice: "Atlanta", caseId: "t4", daysToHearing: 275 },
    { hearingOffice: "Denver", caseId: "t5", daysToHearing: 220 },
  ];

  const pastDueProjection: PastDueProjectionItem[] = [
    { month: "Jan", projected: 125000 },
    { month: "Feb", projected: 148000 },
    { month: "Mar", projected: 162000 },
    { month: "Apr", projected: 178000 },
    { month: "May", projected: 195000 },
    { month: "Jun", projected: 210000 },
  ];

  const caseComplexity: CaseComplexityItem[] = [
    { score: 1, count: 15 },
    { score: 2, count: 28 },
    { score: 3, count: 42 },
    { score: 4, count: 35 },
    { score: 5, count: 22 },
    { score: 6, count: 18 },
    { score: 7, count: 12 },
    { score: 8, count: 8 },
    { score: 9, count: 4 },
    { score: 10, count: 2 },
  ];

  return {
    stats,
    urgentItems,
    funnelStages,
    winRate,
    denialReasons,
    appealsLevels,
    rfcLimitations,
    ceOutcomes,
    vocationalExperts,
    upcomingHearings,
    clientSatisfaction,
    casesByMonth,
    revenueByMonth,
    taskSparklines,
    weeklyVelocity,
    recentActivity,
    recentDecisions,
    teamActivity,
    documentQueue,
    aljApprovalRates,
    listingMatchData,
    denialPatterns,
    timeToHearing,
    pastDueProjection,
    caseComplexity,
  };
}
