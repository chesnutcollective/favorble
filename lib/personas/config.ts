/**
 * Per-persona UX configuration for Favorble.
 *
 * Each of the 9 Hogan Smith personas has:
 * - `label`: Human-readable persona name (for banners and UI labels)
 * - `defaultRoute`: Where they land on login / when navigating to `/`
 * - `nav`: Ordered list of nav rail item IDs they see (others hidden).
 *   IDs must match `RailItem.id` values in `components/layout/two-tier-nav.tsx`.
 * - `primaryKpi`: The single metric that matters most for their dashboard welcome.
 * - `workspaceDescription`: One-liner describing their primary workspace.
 *
 * This file is the single source of truth for persona-aware navigation,
 * landing pages, and the super-admin "View as" toggle. Adding a 10th
 * persona = one entry in this map + one enum value in db/schema/enums.ts.
 *
 * Reference: research synthesized from Hogan Smith Collab persona files
 * (admin, attorney, case-worker, filing-agent, intake-specialist, mail-clerk,
 * medical-records-specialist, phi-sheet-writer, reviewer).
 */

export type PersonaId =
  | "admin"
  | "attorney"
  | "case_manager"
  | "filing_agent"
  | "intake_agent"
  | "mail_clerk"
  | "medical_records"
  | "phi_sheet_writer"
  | "reviewer"
  | "fee_collection"
  | "appeals_council"
  | "post_hearing"
  | "pre_hearing_prep"
  | "viewer";

export type PersonaConfig = {
  label: string;
  shortLabel: string;
  defaultRoute: string;
  /**
   * Ordered list of nav rail item IDs. Items not in this list are hidden.
   * Must match IDs in `components/layout/two-tier-nav.tsx` railItems array.
   */
  nav: string[];
  /**
   * Short description of the persona's primary daily workflow.
   * Shown on the persona-aware /dashboard welcome card.
   */
  workspaceDescription: string;
  /**
   * The single most important KPI to surface on the welcome screen.
   */
  primaryKpi: {
    label: string;
    /** Optional subtitle / context for the KPI */
    subtitle?: string;
  };
  /**
   * Can this persona access the super-admin "View as" toggle?
   * Only `admin` should ever be true.
   */
  canViewAsOthers?: boolean;
  /**
   * Lucide-react icon name used to identify the persona in menus, cards,
   * and the admin impersonation gallery. Keep to icons verified present in
   * the installed lucide-react version.
   */
  icon: string;
  /**
   * 2–4 bullets summarizing what this persona needs from Favorble today —
   * the "goals" shown in the admin impersonation gallery. Sourced from the
   * Hogan Smith collab persona docs ("What They Need from the Platform").
   */
  goals: string[];
  /**
   * 2–4 bullets summarizing the friction this persona hits today — the
   * "challenges" shown in the admin impersonation gallery. Sourced from the
   * Hogan Smith collab persona docs ("Pain Points").
   */
  challenges: string[];
};

// Shared nav item IDs that every persona gets (queue + team chat are universal).
const UNIVERSAL_NAV = ["queue", "team-chat"];

export const PERSONA_CONFIG: Record<PersonaId, PersonaConfig> = {
  admin: {
    label: "Administrator",
    shortLabel: "Admin",
    defaultRoute: "/admin/integrations",
    // Admin sees everything — they manage the whole app
    nav: [
      "dashboard",
      "supervisor",
      "coaching",
      "drafts",
      "cases",
      "leads",
      "queue",
      "calendar",
      "messages",
      "email",
      "contacts",
      "documents",
      "reports",
      "hearings",
      "filing",
      "phi-writer",
      "medical-records",
      "mail",
      "billing",
      "trust",
      "team-chat",
    ],
    workspaceDescription:
      "Integration health, user provisioning, and firm-wide system monitoring.",
    primaryKpi: {
      label: "System Health",
      subtitle: "Integrations + credentials",
    },
    canViewAsOthers: true,
    icon: "ShieldCheck",
    goals: [
      "Centralized user + role management with RBAC that propagates across every module",
      "Integration status dashboard for SSA, ERE, and third-party service connections",
      "Unified audit log of user actions, permission changes, and system events",
      "SSA credential health across all 170+ users in one place",
    ],
    challenges: [
      "User provisioning and permissions split across 4+ separate systems",
      "No unified dashboard for SSA credential health across 170+ users",
      "Integration failures surface reactively through user complaints, not alerts",
      "Audit trail is fragmented — no single log across the platform",
    ],
  },

  attorney: {
    label: "Attorney",
    shortLabel: "Attorney",
    defaultRoute: "/hearings",
    nav: [
      "dashboard",
      "hearings",
      "calendar",
      "cases",
      "messages",
      "email",
      "documents",
      "reports",
      "billing",
      "trust",
      ...UNIVERSAL_NAV,
    ],
    workspaceDescription:
      "Today and tomorrow's hearings with one-click prep, ALJ stats, and case files.",
    primaryKpi: {
      label: "Hearings This Week",
      subtitle: "Personal win rate",
    },
    icon: "Scale",
    goals: [
      "Unified hearing calendar with ALJ, office, mode of appearance, and time-zone-adjusted times",
      "PHI sheet, medical records, and RFC accessible directly from the hearing prep view",
      "Availability scheduling with recurring and one-off windows for hearing assignment",
      "Win-rate analytics per rep, per ALJ, and per hearing office with trend visualization",
    ],
    challenges: [
      "Must check 3–4 systems to prepare for a single hearing",
      "Time-zone conversions for remote hearings are manual and error-prone",
      "Contract reps rely on share links with no proper role-based portal",
      "Win-rate analytics are disconnected from ALJ and office-level data",
    ],
  },

  case_manager: {
    label: "Case Manager",
    shortLabel: "Case Manager",
    defaultRoute: "/queue",
    nav: [
      "dashboard",
      "queue",
      "cases",
      "messages",
      "email",
      "contacts",
      "calendar",
      "documents",
      "hearings",
      "team-chat",
    ],
    workspaceDescription:
      "Daily task queue across cases, unread client messages, and deadline tracking.",
    primaryKpi: {
      label: "Open Tasks",
      subtitle: "Due today + overdue",
    },
    icon: "ClipboardList",
    goals: [
      "Task queue that aggregates and prioritizes work across all case activities",
      "Case dashboard combining SSA status, deadlines, and client communication in one view",
      "Messaging center with threaded conversations and read/unread tracking",
      "Single entry point — update once, reflected everywhere",
    ],
    challenges: [
      "Triple data entry across MyCase, CaseStatus, and HRG Tracker for the same events",
      "4,408+ unread texts accumulated in CaseStatus with no triage or prioritization",
      "Constant context-switching between 4+ systems to complete a single workflow",
      "No unified view of 'what do I need to do today' across all systems",
    ],
  },

  filing_agent: {
    label: "Filing Agent",
    shortLabel: "Filer",
    defaultRoute: "/filing",
    nav: ["dashboard", "filing", "queue", "cases", "documents", "team-chat"],
    workspaceDescription:
      "Ready-to-file queue for SSDI/SSI applications with one-click stage transitions.",
    primaryKpi: {
      label: "Ready to File",
      subtitle: "Applications awaiting submission",
    },
    icon: "FileCheck",
    goals: [
      "Personal filing queue that loads instantly and filters by type, status, and due date",
      "One-click task completion that auto-transitions the case stage",
      "Application document templates auto-populated from claimant data",
      "Auto-generated filing tasks when a case enters 'Ready to File'",
    ],
    challenges: [
      "MyCase is too slow for filtered case lists — agents abandoned it for a spreadsheet",
      "Dual data entry between the filing spreadsheet and MyCase for every case",
      "No filing status tracking back from Chronicle/ERE to the case record",
      "Manual stage transitions after filing across separate tools",
    ],
  },

  intake_agent: {
    label: "Intake Specialist",
    shortLabel: "Intake",
    defaultRoute: "/leads",
    nav: [
      "dashboard",
      "leads",
      "messages",
      "email",
      "contacts",
      "queue",
      "calendar",
      "team-chat",
    ],
    workspaceDescription:
      "Lead pipeline kanban, intake qualification, contracts, and conversion tracking.",
    primaryKpi: {
      label: "New Leads Today",
      subtitle: "Conversion rate this week",
    },
    icon: "PhoneIncoming",
    goals: [
      "Lead pipeline with full 30+ stages, drag-and-drop progression, and status rules",
      "Contract generation and e-signature workflow integrated into intake",
      "Automated duplicate and conflict detection on new lead entry",
      "One-click lead-to-case conversion that provisions records across all systems",
    ],
    challenges: [
      "Lead pipeline lives in MyCase with 30+ custom statuses that are hard to visualize",
      "New clients require separate entry in MyCase, CaseStatus, and Chronicle",
      "No built-in e-signature flow — contracts are manual and fragmented",
      "Spanish-speaking leads require manual routing with no language detection",
    ],
  },

  mail_clerk: {
    label: "Mail Clerk",
    shortLabel: "Mail",
    defaultRoute: "/mail",
    nav: ["dashboard", "mail", "contacts", ...UNIVERSAL_NAV],
    workspaceDescription:
      "Physical mail processing: scan, categorize, attach to cases, track certified shipments.",
    primaryKpi: {
      label: "Mail to Process",
      subtitle: "Inbound queue depth",
    },
    icon: "Mail",
    goals: [
      "Incoming mail workflow: scan → case lookup → attach → categorize → mark processed",
      "Fast case search optimized for mail routing (fuzzy name, SSN last 4, case number)",
      "Outbound mail tracking with certified numbers and deadline flagging",
      "Processing queue showing unprocessed vs processed mail items",
    ],
    challenges: [
      "All mail tracking lives in a spreadsheet — a total shadow system from MyCase",
      "Finding the right case for a piece of mail is slow — searching by name or SSN",
      "No guided document scanning workflow — scan, save, find, upload is all manual",
      "No outbound tracking — sent mail isn't logged anywhere systematically",
    ],
  },

  medical_records: {
    label: "Medical Records Specialist",
    shortLabel: "Med Records",
    defaultRoute: "/medical-records",
    nav: [
      "dashboard",
      "medical-records",
      "queue",
      "cases",
      "contacts",
      "documents",
      "hearings",
      "team-chat",
    ],
    workspaceDescription:
      "Medical records collection prioritized by hearing date, portal credentials, and RFC tracking.",
    primaryKpi: {
      label: "MR Queue",
      subtitle: "Hearings within 30 days",
    },
    icon: "Stethoscope",
    goals: [
      "Encrypted, access-logged portal credential management (replacing plaintext HRG storage)",
      "MR collection pipeline auto-prioritized by hearing date and team assignment",
      "RFC tracking pipeline with team-lead approval workflow",
      "Workload dashboard for per-specialist and per-team queue depth",
    ],
    challenges: [
      "Portal credentials stored in plaintext in HRG Tracker — major HIPAA/SOC 2 risk",
      "Working across 4 systems simultaneously to complete a single records request",
      "MR Worksheet is a standalone Google Sheet requiring manual cross-referencing",
      "No automated prioritization — specialists manually identify urgent cases",
    ],
  },

  phi_sheet_writer: {
    label: "PHI Sheet Writer",
    shortLabel: "PHI Writer",
    defaultRoute: "/phi-writer",
    nav: [
      "dashboard",
      "phi-writer",
      "cases",
      "documents",
      "hearings",
      "team-chat",
    ],
    workspaceDescription:
      "PHI sheet authoring queue sorted by hearing urgency with consolidated case research.",
    primaryKpi: {
      label: "PHI Sheets Assigned",
      subtitle: "Hearings within 14 days",
    },
    icon: "FileText",
    goals: [
      "Assignment queue auto-sorted by hearing date with urgency indicators and overdue alerts",
      "All case data in one view — MR, SSA exhibits, ALJ stats, claimant history",
      "Status pipeline with clear stages linked to actual PHI sheet document uploads",
      "Workload metrics for per-writer completion counts and average turnaround time",
    ],
    challenges: [
      "Must pull info from 4 separate systems to write a single PHI sheet",
      "No integrated authoring workspace — writers compile data manually",
      "Typos in writer names across systems make workload tracking unreliable",
      "No urgency prioritization — writers manually check hearing dates",
    ],
  },

  reviewer: {
    label: "Reviewer",
    shortLabel: "Leadership",
    defaultRoute: "/dashboard/exec",
    nav: [
      "dashboard",
      "supervisor",
      "coaching",
      "drafts",
      "cases",
      "reports",
      "hearings",
      "phi-writer",
      "team-chat",
    ],
    workspaceDescription:
      "Executive KPIs, rep performance, ALJ analytics, and intake approval queue.",
    primaryKpi: {
      label: "Firm Win Rate",
      subtitle: "Trailing 30 days",
    },
    icon: "Eye",
    goals: [
      "Executive dashboard combining intake, outcomes, hearing, and financial KPIs with consistent definitions",
      "Rep performance comparisons across win rates, hearing volumes, and case loads",
      "ALJ win-rate analytics filterable by office, rep, case type, and time period",
      "Intake review queue with approve/reject workflow accessible from the dashboard",
    ],
    challenges: [
      "KPIs scattered across 4 systems with conflicting numbers (38% vs 45.1% win rate)",
      "No unified executive dashboard combining intake, outcomes, and financial metrics",
      "Rep performance comparisons require manual export and reconciliation",
      "Financial reporting in MyCase doesn't account for data from other systems",
    ],
  },

  fee_collection: {
    label: "Fee Collection",
    shortLabel: "Fees",
    defaultRoute: "/fee-collection",
    nav: [
      "dashboard",
      "fee-collection",
      "cases",
      "contacts",
      "documents",
      "billing",
      ...UNIVERSAL_NAV,
    ],
    workspaceDescription:
      "Fee petitions filed with SSA after favorable decisions, through approval and collection.",
    primaryKpi: {
      label: "Delinquent Petitions",
      subtitle: "Approved > 30 days unpaid",
    },
    icon: "DollarSign",
    goals: [
      "60-day fee petition countdown with escalating alerts at 45, 30, 15, and 7 days",
      "Past-due benefit calculator applying the current SSA fee cap automatically",
      "Fee pipeline: favorable decision → petition filed → SSA processing → paid → reconciled",
      "QuickBooks sync for authorized and received fee amounts",
    ],
    challenges: [
      "No single system connects favorable decisions to petition deadlines and payments",
      "60-day fee petition deadline tracked informally in spreadsheets and calendars",
      "Fee cap changes require manual updates — errors lead to billing mistakes",
      "SSA's 6.3% user fee deduction isn't accounted for, creating reconciliation gaps",
    ],
  },

  appeals_council: {
    label: "Appeals Council",
    shortLabel: "AC",
    defaultRoute: "/appeals-council",
    nav: [
      "dashboard",
      "appeals-council",
      "cases",
      "documents",
      "drafts",
      "calendar",
      ...UNIVERSAL_NAV,
    ],
    workspaceDescription:
      "Appeals Council brief pipeline — unfavorable decisions tracked through drafting, review, and filing.",
    primaryKpi: {
      label: "Urgent Deadlines",
      subtitle: "Within 7 days of AC filing deadline",
    },
    icon: "Gavel",
    goals: [
      "60-day AC review countdown with escalating alerts and separate federal-court tracker",
      "Brief workspace with ALJ decision, hearing transcript, evidence, and regulatory refs in one view",
      "AC case pipeline from unfavorable decision through disposition and remand handoff",
      "AC outcome analytics by ALJ, hearing office, error type, and representative",
    ],
    challenges: [
      "60-day AC review deadline tracked manually in calendars and spreadsheets",
      "ALJ decisions, recordings, and exhibits scattered across 3–4 systems",
      "AC takes 15–18 months — long pending pipeline with no centralized status tracking",
      "Brief templates and citations live in personal files with no version control",
    ],
  },

  post_hearing: {
    label: "Post-Hearing Processing",
    shortLabel: "Post-Hearing",
    defaultRoute: "/post-hearing",
    nav: [
      "dashboard",
      "post-hearing",
      "hearings",
      "cases",
      "documents",
      "messages",
      ...UNIVERSAL_NAV,
    ],
    workspaceDescription:
      "Process hearing outcomes — notify clients, advance stages, and close the loop on decisions.",
    primaryKpi: {
      label: "Awaiting Processing",
      subtitle: "Outcomes not yet worked",
    },
    icon: "CheckCircle",
    goals: [
      "Decision dashboard with automated ERE alerts categorized by outcome type",
      "Fee petition pipeline with 60-day deadline math and SSA document generation",
      "Appeals Council filing tracker with 60-day receipt deadline and AC status tracking",
      "Case closure automation that updates all integrated systems in one action",
    ],
    challenges: [
      "Decision monitoring means manually checking Chronicle and ERE for new ALJ decisions",
      "Fee petition 60-day deadline tracked manually in spreadsheets with no escalation",
      "Favorable decision processing spans 4+ systems for verification, filing, and notification",
      "Remand tracking is fragmented — no automated handoff back to pre-hearing prep",
    ],
  },

  pre_hearing_prep: {
    label: "Pre-Hearing Prep",
    shortLabel: "Pre-Hearing",
    defaultRoute: "/phi-writer",
    nav: [
      "dashboard",
      "phi-writer",
      "cases",
      "documents",
      "hearings",
      "team-chat",
    ],
    workspaceDescription:
      "Author pre-hearing briefs and PHI sheets for upcoming hearings, sorted by hearing urgency.",
    primaryKpi: {
      label: "Briefs This Week",
      subtitle: "Hearings within 14 days",
    },
    icon: "Briefcase",
    goals: [
      "Hearing readiness dashboard with consolidated checklist status per upcoming hearing",
      "Automated 5-business-day evidence deadline tracking with weekend/holiday awareness",
      "Exhibit package builder that compiles, numbers, and organizes documents across sources",
      "Missing evidence detector with one-click record requests to Medical Records Specialists",
    ],
    challenges: [
      "Hearing readiness tracked across HRG Tracker, Hearings App, MyCase, and Chronicle",
      "5-business-day evidence deadline requires manual calendar counting with no alerts",
      "Exhibit package assembly is manual — compile, number, and upload across systems",
      "Duplicate evidence delays cases and frustrates ALJs; no system prevents re-submission",
    ],
  },

  viewer: {
    label: "Viewer",
    shortLabel: "Viewer",
    defaultRoute: "/dashboard",
    nav: ["dashboard", "cases", "reports", "team-chat"],
    workspaceDescription:
      "Read-only access to cases, reports, and firm activity.",
    primaryKpi: {
      label: "Active Cases",
    },
    icon: "EyeOff",
    goals: [
      "Read-only access to cases, reports, and firm activity for oversight",
    ],
    challenges: [
      "Cannot take action — strictly a view-only placeholder persona",
    ],
  },
};

/**
 * All personas available in the "View as" dropdown, in display order.
 * Excludes "viewer" (rarely relevant for preview testing).
 */
export const VIEW_AS_PERSONAS: PersonaId[] = [
  "admin",
  "attorney",
  "case_manager",
  "filing_agent",
  "intake_agent",
  "mail_clerk",
  "medical_records",
  "phi_sheet_writer",
  "reviewer",
  "fee_collection",
  "appeals_council",
  "post_hearing",
  "pre_hearing_prep",
];

/**
 * Get persona config, falling back to viewer if the role string
 * isn't in our enum (defensive — shouldn't happen in practice).
 */
export function getPersonaConfig(personaId: string): PersonaConfig {
  return PERSONA_CONFIG[personaId as PersonaId] ?? PERSONA_CONFIG.viewer;
}
