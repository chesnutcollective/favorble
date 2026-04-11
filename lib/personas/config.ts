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
  },

  filing_agent: {
    label: "Filing Agent",
    shortLabel: "Filer",
    defaultRoute: "/filing",
    nav: [
      "dashboard",
      "filing",
      "queue",
      "cases",
      "documents",
      "team-chat",
    ],
    workspaceDescription:
      "Ready-to-file queue for SSDI/SSI applications with one-click stage transitions.",
    primaryKpi: {
      label: "Ready to File",
      subtitle: "Applications awaiting submission",
    },
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
];

/**
 * Get persona config, falling back to viewer if the role string
 * isn't in our enum (defensive — shouldn't happen in practice).
 */
export function getPersonaConfig(personaId: string): PersonaConfig {
  return (
    PERSONA_CONFIG[personaId as PersonaId] ?? PERSONA_CONFIG.viewer
  );
}
