/**
 * Shared rail nav item metadata for persona-aware surfaces.
 *
 * This registry mirrors the `railItems` array inside
 * `components/layout/two-tier-nav.tsx` but is kept as a plain data module so
 * that server components (like `/dashboard/page.tsx`) can render quick-link
 * cards without pulling in the client-only nav component.
 *
 * IMPORTANT: Keep the keys in sync with the `id` values used by
 * `two-tier-nav.tsx` and referenced from `lib/personas/config.ts` → `nav`.
 * Whenever a new rail item is added, update both files.
 */
export type NavItemMeta = {
  /** Rail item ID — matches RailItem.id in two-tier-nav.tsx */
  id: string;
  /** Human-readable label shown on nav chips and dashboard cards */
  label: string;
  /** App route the item links to */
  href: string;
  /** One-liner describing what the destination is for */
  description: string;
  /**
   * Name of the icon exported from `@hugeicons/core-free-icons`. Consumers
   * look up the icon at render time so this registry stays serializable.
   */
  iconName: string;
};

export const NAV_ITEM_REGISTRY: Record<string, NavItemMeta> = {
  dashboard: {
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    description: "Firm overview and welcome screen",
    iconName: "DashboardSquare01Icon",
  },
  supervisor: {
    id: "supervisor",
    label: "Supervisor",
    href: "/admin/supervisor",
    description: "Monitor team performance, workload, and case risk",
    iconName: "BinocularsIcon",
  },
  coaching: {
    id: "coaching",
    label: "Coaching",
    href: "/coaching",
    description: "Open coaching flags, training gaps, and AI-drafted conversations",
    iconName: "Megaphone01Icon",
  },
  drafts: {
    id: "drafts",
    label: "AI Drafts",
    href: "/drafts",
    description: "Review and approve AI-drafted letters, messages, and filings",
    iconName: "File01Icon",
  },
  cases: {
    id: "cases",
    label: "Cases",
    href: "/cases",
    description: "Full case list, stages, and case detail",
    iconName: "Folder01Icon",
  },
  leads: {
    id: "leads",
    label: "Leads",
    href: "/leads",
    description: "Intake pipeline and lead qualification",
    iconName: "UserAdd01Icon",
  },
  queue: {
    id: "queue",
    label: "Queue",
    href: "/queue",
    description: "Your daily task queue across cases",
    iconName: "CheckListIcon",
  },
  calendar: {
    id: "calendar",
    label: "Calendar",
    href: "/calendar",
    description: "Hearings, deadlines, and appointments",
    iconName: "Calendar03Icon",
  },
  messages: {
    id: "messages",
    label: "Messages",
    href: "/messages",
    description: "Client SMS and case conversations",
    iconName: "Message01Icon",
  },
  email: {
    id: "email",
    label: "Email",
    href: "/email",
    description: "Shared firm inbox and case email",
    iconName: "Mail01Icon",
  },
  contacts: {
    id: "contacts",
    label: "Contacts",
    href: "/contacts",
    description: "Claimants, providers, and related parties",
    iconName: "UserGroupIcon",
  },
  documents: {
    id: "documents",
    label: "Documents",
    href: "/documents",
    description: "Case files, exhibits, and templates",
    iconName: "File01Icon",
  },
  reports: {
    id: "reports",
    label: "Reports",
    href: "/reports",
    description: "KPI dashboards, ALJ stats, rep performance",
    iconName: "ChartLineData01Icon",
  },
  hearings: {
    id: "hearings",
    label: "Hearings",
    href: "/hearings",
    description: "Upcoming hearings with prep workspace",
    iconName: "CourtHouseIcon",
  },
  filing: {
    id: "filing",
    label: "Filing",
    href: "/filing",
    description: "Ready-to-file queue for SSA applications",
    iconName: "InboxUploadIcon",
  },
  "phi-writer": {
    id: "phi-writer",
    label: "PHI Writer",
    href: "/phi-writer",
    description: "Pre-hearing intelligence authoring queue",
    iconName: "Note01Icon",
  },
  "medical-records": {
    id: "medical-records",
    label: "Medical Records",
    href: "/medical-records",
    description: "Medical records collection workspace",
    iconName: "Hospital01Icon",
  },
  mail: {
    id: "mail",
    label: "Mail",
    href: "/mail",
    description: "Inbound and outbound physical mail",
    iconName: "InboxIcon",
  },
  billing: {
    id: "billing",
    label: "Billing",
    href: "/billing",
    description: "Time entries, expenses, and invoices",
    iconName: "Invoice01Icon",
  },
  trust: {
    id: "trust",
    label: "Trust",
    href: "/trust",
    description: "Trust accounting and reconciliation",
    iconName: "SafeIcon",
  },
  "team-chat": {
    id: "team-chat",
    label: "Team Chat",
    href: "/team-chat",
    description: "Internal team channels and DMs",
    iconName: "BubbleChatIcon",
  },
  "fee-collection": {
    id: "fee-collection",
    label: "Fee Collection",
    href: "/fee-collection",
    description: "Fee petitions filed with SSA after favorable decisions",
    iconName: "DollarCircleIcon",
  },
  "appeals-council": {
    id: "appeals-council",
    label: "Appeals Council",
    href: "/appeals-council",
    description: "AC brief pipeline and 65-day deadline tracking",
    iconName: "BalanceScaleIcon",
  },
  "post-hearing": {
    id: "post-hearing",
    label: "Post-Hearing",
    href: "/post-hearing",
    description: "Process hearing outcomes and close the loop on decisions",
    iconName: "CheckmarkBadge01Icon",
  },
};

/**
 * Resolve a list of nav IDs to their metadata, filtering out any unknown
 * IDs. Keeps the original ordering from the input list.
 */
export function resolveNavItems(ids: readonly string[]): NavItemMeta[] {
  return ids
    .map((id) => NAV_ITEM_REGISTRY[id])
    .filter((item): item is NavItemMeta => Boolean(item));
}
