"use client";

/**
 * ⚠️ DEPRECATED — DO NOT USE FOR NEW WORK.
 *
 * This file is the old ILIKE-based global search component, kept in
 * the tree for one release cycle as a fallback during the rollout of
 * the new polymorphic search system.
 *
 * The replacement is `components/search/command-palette.tsx`, which
 * backs onto `/api/search/v2` and the `search_documents` table.
 * See `docs/search/README.md` for the full picture.
 *
 * The header switched to <CommandPalette/> in commit 2d79b7e.
 * This component has no import sites as of that commit. It will be
 * deleted in a follow-on cleanup PR — see
 * `docs/search/runbook.md § Deleting the old GlobalSearch`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ResultType =
  | "case"
  | "contact"
  | "task"
  | "lead"
  | "document"
  | "event"
  | "message";

type FilterType = "all" | ResultType;

interface SearchResultItem {
  id: string;
  type: ResultType;
  title: string;
  subtitle: string;
  href: string;
  metadata?: string;
  badge?: string;
  badgeColor?: string;
  // Extra fields for preview panel
  preview?: Record<string, string | null | undefined>;
}

interface RecentItem {
  id: string;
  type: ResultType;
  title: string;
  subtitle: string;
  href: string;
  timestamp: number;
}

interface CommandItem {
  id: string;
  label: string;
  category: "action" | "navigation" | "admin";
  keywords: string[];
  href: string;
  icon: string;
}

interface APISearchResults {
  results: {
    cases: Array<{
      id: string;
      caseNumber: string;
      status: string;
      stageName: string | null;
      stageColor: string | null;
      claimantName: string | null;
      assignedToName: string | null;
      updatedAt: string;
    }>;
    contacts: Array<{
      id: string;
      fullName: string;
      email: string | null;
      phone: string | null;
      contactType: string;
    }>;
    tasks: Array<{
      id: string;
      title: string;
      status: string;
      priority: string | null;
      dueDate: string | null;
      caseId: string;
      caseNumber: string | null;
    }>;
    leads: Array<{
      id: string;
      fullName: string;
      status: string;
      source: string | null;
      createdAt: string;
    }>;
    documents: Array<{
      id: string;
      fileName: string;
      fileType: string | null;
      category: string | null;
      source: string | null;
      caseId: string | null;
      caseNumber: string | null;
      createdAt: string;
    }>;
    events: Array<{
      id: string;
      title: string;
      eventType: string | null;
      startDate: string;
      caseId: string | null;
      caseNumber: string | null;
    }>;
    messages: Array<{
      id: string;
      subject: string | null;
      body: string | null;
      type: string | null;
      caseId: string | null;
      caseNumber: string | null;
      createdAt: string;
    }>;
  };
  topHit: { type: string; data: Record<string, unknown>; score: number } | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECENTS_KEY = "favorble-search-recents";
const MAX_RECENTS = 20;
const DEBOUNCE_MS = 200;

const FILTER_TYPES: { key: FilterType; label: string; shortcut: string }[] = [
  { key: "all", label: "All", shortcut: "1" },
  { key: "case", label: "Cases", shortcut: "2" },
  { key: "contact", label: "Contacts", shortcut: "3" },
  { key: "task", label: "Tasks", shortcut: "4" },
  { key: "lead", label: "Leads", shortcut: "5" },
  { key: "document", label: "Documents", shortcut: "6" },
  { key: "event", label: "Events", shortcut: "7" },
  { key: "message", label: "Messages", shortcut: "8" },
];

const COMMANDS: CommandItem[] = [
  // Actions
  {
    id: "cmd-new-case",
    label: "New Case",
    category: "action",
    keywords: ["create", "add", "case"],
    href: "/cases?action=new",
    icon: "plus",
  },
  {
    id: "cmd-new-lead",
    label: "New Lead",
    category: "action",
    keywords: ["create", "add", "lead", "intake"],
    href: "/leads?action=new",
    icon: "plus",
  },
  {
    id: "cmd-upload-doc",
    label: "Upload Document",
    category: "action",
    keywords: ["upload", "file", "document", "pdf"],
    href: "/documents",
    icon: "upload",
  },
  {
    id: "cmd-new-task",
    label: "New Task",
    category: "action",
    keywords: ["create", "add", "task", "todo"],
    href: "/queue",
    icon: "plus",
  },
  // Navigation
  {
    id: "cmd-dashboard",
    label: "Dashboard",
    category: "navigation",
    keywords: ["home", "overview"],
    href: "/dashboard",
    icon: "grid",
  },
  {
    id: "cmd-cases",
    label: "Cases",
    category: "navigation",
    keywords: ["case", "list"],
    href: "/cases",
    icon: "folder",
  },
  {
    id: "cmd-queue",
    label: "My Queue",
    category: "navigation",
    keywords: ["queue", "tasks", "todo"],
    href: "/queue",
    icon: "list",
  },
  {
    id: "cmd-calendar",
    label: "Calendar",
    category: "navigation",
    keywords: ["calendar", "schedule", "events"],
    href: "/calendar",
    icon: "calendar",
  },
  {
    id: "cmd-leads",
    label: "Leads",
    category: "navigation",
    keywords: ["lead", "intake", "prospect"],
    href: "/leads",
    icon: "users",
  },
  {
    id: "cmd-contacts",
    label: "Contacts",
    category: "navigation",
    keywords: ["contact", "people", "person"],
    href: "/contacts",
    icon: "user",
  },
  {
    id: "cmd-documents",
    label: "Documents",
    category: "navigation",
    keywords: ["document", "file", "pdf"],
    href: "/documents",
    icon: "file",
  },
  {
    id: "cmd-reports",
    label: "Reports",
    category: "navigation",
    keywords: ["report", "analytics", "stats"],
    href: "/reports",
    icon: "chart",
  },
  {
    id: "cmd-messages",
    label: "Messages",
    category: "navigation",
    keywords: ["message", "sms", "text"],
    href: "/messages",
    icon: "message",
  },
  {
    id: "cmd-email",
    label: "Email",
    category: "navigation",
    keywords: ["email", "mail", "inbox"],
    href: "/email",
    icon: "mail",
  },
  // Admin
  {
    id: "cmd-integrations",
    label: "Integrations",
    category: "admin",
    keywords: ["integration", "connect", "api"],
    href: "/admin/integrations",
    icon: "plug",
  },
  {
    id: "cmd-workflows",
    label: "Workflows",
    category: "admin",
    keywords: ["workflow", "automation"],
    href: "/admin/workflows",
    icon: "workflow",
  },
  {
    id: "cmd-stages",
    label: "Stages",
    category: "admin",
    keywords: ["stage", "pipeline"],
    href: "/admin/stages",
    icon: "layers",
  },
  {
    id: "cmd-fields",
    label: "Fields",
    category: "admin",
    keywords: ["field", "custom", "form"],
    href: "/admin/fields",
    icon: "form",
  },
  {
    id: "cmd-users",
    label: "Users",
    category: "admin",
    keywords: ["user", "team", "member", "people"],
    href: "/admin/users",
    icon: "users",
  },
  {
    id: "cmd-settings",
    label: "Settings",
    category: "admin",
    keywords: ["setting", "config", "preferences"],
    href: "/admin/settings",
    icon: "settings",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typeIcon(
  type: ResultType | "command" | "action" | "navigation" | "admin",
): string {
  const map: Record<string, string> = {
    case: "\u{1F4C1}",
    contact: "\u{1F464}",
    task: "\u2611\uFE0F",
    lead: "\u{1F504}",
    document: "\u{1F4C4}",
    event: "\u{1F4C5}",
    message: "\u{1F4AC}",
    command: "\u{2318}",
    action: "\u26A1",
    navigation: "\u2192",
    admin: "\u2699\uFE0F",
  };
  return map[type] ?? "\u{1F50D}";
}

function typeLabel(type: ResultType): string {
  const map: Record<ResultType, string> = {
    case: "Cases",
    contact: "Contacts",
    task: "Tasks",
    lead: "Leads",
    document: "Documents",
    event: "Events",
    message: "Messages",
  };
  return map[type] ?? type;
}

function formatContactType(t: string): string {
  return t
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function stageBadgeColor(stage: string): string {
  // Common stage colors based on typical case lifecycle
  const lower = stage.toLowerCase();
  if (lower.includes("closed") || lower.includes("denied")) return "#EF4444";
  if (lower.includes("hearing") || lower.includes("review")) return "#F59E0B";
  if (lower.includes("approved") || lower.includes("won")) return "#1d72b8";
  return "#6B7280";
}

function statusColor(status: string): string {
  const lower = status.toLowerCase();
  if (lower === "new") return "#3B82F6";
  if (lower === "contacted" || lower === "in_progress") return "#F59E0B";
  if (
    lower === "converted" ||
    lower === "completed" ||
    lower === "contract_signed"
  )
    return "#1d72b8";
  if (lower === "declined" || lower === "disqualified") return "#EF4444";
  return "#6B7280";
}

function loadRecents(): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw) as RecentItem[];
    return items
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

function saveRecent(item: Omit<RecentItem, "timestamp">) {
  if (typeof window === "undefined") return;
  try {
    const existing = loadRecents().filter((r) => r.id !== item.id);
    const updated: RecentItem[] = [
      { ...item, timestamp: Date.now() },
      ...existing,
    ].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
  } catch {
    // storage full or unavailable
  }
}

function fmtStatus(s: string | null | undefined): string {
  return s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";
}

function transformAPIResults(data: APISearchResults): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  const r = data.results;

  for (const c of r.cases ?? []) {
    items.push({
      id: c.id,
      type: "case",
      title: c.claimantName ?? c.caseNumber,
      subtitle: [c.caseNumber, c.stageName].filter(Boolean).join(" \u00B7 "),
      href: `/cases/${c.id}`,
      badge: c.stageName ?? undefined,
      badgeColor: c.stageName ? stageBadgeColor(c.stageName) : undefined,
      preview: {
        Claimant: c.claimantName,
        "Case #": c.caseNumber,
        Stage: c.stageName,
        "Assigned To": c.assignedToName,
      },
    });
  }

  for (const c of r.contacts ?? []) {
    items.push({
      id: c.id,
      type: "contact",
      title: c.fullName,
      subtitle: [formatContactType(c.contactType), c.email]
        .filter(Boolean)
        .join(" \u00B7 "),
      href: `/contacts/${c.id}`,
      metadata: formatContactType(c.contactType),
      preview: {
        Name: c.fullName,
        Type: formatContactType(c.contactType),
        Email: c.email,
        Phone: c.phone,
      },
    });
  }

  for (const t of r.tasks ?? []) {
    items.push({
      id: t.id,
      type: "task",
      title: t.title,
      subtitle: [
        fmtStatus(t.status),
        t.caseNumber ? `Case ${t.caseNumber}` : null,
      ]
        .filter(Boolean)
        .join(" \u00B7 "),
      href: t.caseId ? `/cases/${t.caseId}/tasks` : "/queue",
      badge: fmtStatus(t.status),
      badgeColor:
        t.status === "completed"
          ? "#1d72b8"
          : t.status === "blocked"
            ? "#EF4444"
            : "#6B7280",
      preview: {
        Title: t.title,
        Status: fmtStatus(t.status),
        Priority: fmtStatus(t.priority),
        "Due Date": t.dueDate ? new Date(t.dueDate).toLocaleDateString() : null,
        Case: t.caseNumber,
      },
    });
  }

  for (const l of r.leads ?? []) {
    items.push({
      id: l.id,
      type: "lead",
      title: l.fullName,
      subtitle: [fmtStatus(l.status), l.source]
        .filter(Boolean)
        .join(" \u00B7 "),
      href: `/leads/${l.id}`,
      badge: fmtStatus(l.status),
      badgeColor: statusColor(l.status),
      preview: {
        Name: l.fullName,
        Status: fmtStatus(l.status),
        Source: l.source,
      },
    });
  }

  for (const d of r.documents ?? []) {
    items.push({
      id: d.id,
      type: "document",
      title: d.fileName,
      subtitle: [d.category, d.caseNumber ? `Case ${d.caseNumber}` : null]
        .filter(Boolean)
        .join(" \u00B7 "),
      href: d.caseId ? `/cases/${d.caseId}/documents` : "/documents",
      preview: {
        File: d.fileName,
        Category: d.category,
        Source: d.source,
        Case: d.caseNumber,
      },
    });
  }

  for (const e of r.events ?? []) {
    items.push({
      id: e.id,
      type: "event",
      title: e.title,
      subtitle: [
        fmtStatus(e.eventType),
        e.caseNumber ? `Case ${e.caseNumber}` : null,
      ]
        .filter(Boolean)
        .join(" \u00B7 "),
      href: e.caseId ? `/cases/${e.caseId}/calendar` : "/calendar",
      badge: fmtStatus(e.eventType),
      badgeColor: e.eventType === "hearing" ? "#1d72b8" : "#6B7280",
      preview: {
        Event: e.title,
        Type: fmtStatus(e.eventType),
        Date: new Date(e.startDate).toLocaleDateString(),
        Case: e.caseNumber,
      },
    });
  }

  for (const m of r.messages ?? []) {
    items.push({
      id: m.id,
      type: "message",
      title: m.subject ?? "(No subject)",
      subtitle: [
        fmtStatus(m.type),
        m.caseNumber ? `Case ${m.caseNumber}` : null,
      ]
        .filter(Boolean)
        .join(" \u00B7 "),
      href: m.caseId ? `/messages?highlight=${m.id}` : "/messages",
      preview: {
        Subject: m.subject,
        Type: fmtStatus(m.type),
        Case: m.caseNumber,
        Preview: m.body?.slice(0, 100),
      },
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Badge({
  children,
  color = "#6B7280",
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none whitespace-nowrap"
      style={{
        backgroundColor: `${color}14`,
        color,
        border: `1px solid ${color}30`,
      }}
    >
      {children}
    </span>
  );
}

function FilterChips({
  active,
  onChange,
}: {
  active: FilterType;
  onChange: (f: FilterType) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-[#EAEAEA] px-3 py-2 overflow-x-auto">
      {FILTER_TYPES.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onChange(f.key)}
          className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors duration-100"
          style={{
            backgroundColor: active === f.key ? "#000" : "transparent",
            color: active === f.key ? "#fff" : "#666",
            border: active === f.key ? "1px solid #000" : "1px solid #E5E5E5",
          }}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function PreviewPanel({
  item,
  visible,
}: {
  item: SearchResultItem | null;
  visible: boolean;
}) {
  return (
    <div
      className="hidden md:flex flex-col border-l border-[#EAEAEA] transition-opacity duration-150"
      style={{
        width: 260,
        minWidth: 260,
        opacity: visible && item ? 1 : 0,
        pointerEvents: visible && item ? "auto" : "none",
      }}
    >
      {item && (
        <div className="flex flex-col gap-3 p-4 overflow-y-auto h-full">
          <div className="flex items-center gap-2">
            <span className="text-base">{typeIcon(item.type)}</span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-[#999]">
              {typeLabel(item.type).slice(0, -1)}
            </span>
          </div>
          <p className="text-[14px] font-semibold text-[#111] leading-tight">
            {item.title}
          </p>
          {item.badge && <Badge color={item.badgeColor}>{item.badge}</Badge>}
          <div className="mt-1 flex flex-col gap-2">
            {item.preview &&
              Object.entries(item.preview).map(([key, val]) =>
                val ? (
                  <div key={key} className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-[#999]">
                      {key}
                    </span>
                    <span className="text-[13px] text-[#333]">{val}</span>
                  </div>
                ) : null,
              )}
          </div>
        </div>
      )}
    </div>
  );
}

function FooterHints() {
  return (
    <div
      className="flex items-center gap-4 border-t border-[#EAEAEA] px-3 py-2 text-[12px] text-[#999]"
      style={{ fontFamily: "var(--font-geist-mono, 'Geist Mono', monospace)" }}
    >
      <span className="flex items-center gap-1">
        <kbd className="inline-flex items-center justify-center rounded border border-[#E5E5E5] bg-[#FAFAFA] px-1 py-0.5 text-[10px] font-medium min-w-[18px]">
          &uarr;&darr;
        </kbd>
        Navigate
      </span>
      <span className="flex items-center gap-1">
        <kbd className="inline-flex items-center justify-center rounded border border-[#E5E5E5] bg-[#FAFAFA] px-1 py-0.5 text-[10px] font-medium min-w-[18px]">
          &crarr;
        </kbd>
        Open
      </span>
      <span className="flex items-center gap-1">
        <kbd className="inline-flex items-center justify-center rounded border border-[#E5E5E5] bg-[#FAFAFA] px-1 py-0.5 text-[10px] font-medium min-w-[18px]">
          &#8677;
        </kbd>
        Preview
      </span>
      <span className="flex items-center gap-1">
        <kbd className="inline-flex items-center justify-center rounded border border-[#E5E5E5] bg-[#FAFAFA] px-1 py-0.5 text-[10px] font-medium min-w-[18px]">
          esc
        </kbd>
        Close
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [topHit, setTopHit] = useState<SearchResultItem | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showPreview, setShowPreview] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isCommandMode = query.startsWith(">");

  // Load recents + suggested items when dialog opens
  useEffect(() => {
    if (open) {
      setRecents(loadRecents());
      setQuery("");
      setResults([]);
      setTopHit(null);
      setFilter("all");
      setSelectedIndex(0);
      // Pre-fetch suggested results (recent cases, contacts, tasks)
      fetchSuggestions();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const [suggestions, setSuggestions] = useState<SearchResultItem[]>([]);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/search?q=*&limit=12");
      if (res.ok) {
        const raw = await res.json();
        const data: APISearchResults = raw.results
          ? raw
          : { results: raw, topHit: null };
        setSuggestions(transformAPIResults(data));
      }
    } catch {
      // Silently fail
    }
  }, []);

  // Cmd+K keyboard shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Search API
  const search = useCallback(async (term: string, typeFilter: FilterType) => {
    if (term.length < 2) {
      setResults([]);
      setTopHit(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const params = new URLSearchParams({ q: term });
      if (typeFilter !== "all") {
        params.set("type", typeFilter);
      }
      const res = await fetch(`/api/search?${params.toString()}`);
      if (res.ok) {
        const raw = await res.json();
        // Handle both old format {cases:[]} and new {results:{cases:[]}}
        const data: APISearchResults = raw.results
          ? raw
          : { results: raw, topHit: raw.topHit ?? null };
        const items = transformAPIResults(data);
        setResults(items);
        // Transform topHit if present
        if (data.topHit?.data) {
          const th = data.topHit;
          const thType = th.type as ResultType;
          const thData = th.data as Record<string, string>;
          const thItem: SearchResultItem = {
            id: thData.id ?? "",
            type: thType,
            title:
              thData.claimantName ??
              thData.fullName ??
              thData.title ??
              thData.fileName ??
              thData.subject ??
              "",
            subtitle: thData.caseNumber ?? thData.contactType ?? "",
            href:
              thType === "case"
                ? `/cases/${thData.id}`
                : thType === "contact"
                  ? `/contacts/${thData.id}`
                  : "/",
          };
          setTopHit(thItem);
        } else {
          setTopHit(null);
        }
        setSelectedIndex(0);
      }
    } catch {
      // Silently fail
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search on query or filter change
  useEffect(() => {
    if (isCommandMode || query.length < 2) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query, filter), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, filter, search, isCommandMode]);

  // Filter results by type
  const filteredResults = useMemo(() => {
    if (filter === "all") return results;
    return results.filter((r) => r.type === filter);
  }, [results, filter]);

  // Group results by type
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResultItem[]> = {};
    for (const item of filteredResults) {
      const key = typeLabel(item.type);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [filteredResults]);

  // Flat list for keyboard navigation
  const flatList = useMemo((): (SearchResultItem | CommandItem)[] => {
    if (isCommandMode) {
      const cmdQuery = query.slice(1).toLowerCase().trim();
      if (!cmdQuery) return COMMANDS;
      return COMMANDS.filter(
        (c) =>
          c.label.toLowerCase().includes(cmdQuery) ||
          c.keywords.some((k) => k.includes(cmdQuery)),
      );
    }
    const list: SearchResultItem[] = [];
    if (topHit) list.push(topHit);
    list.push(...filteredResults.filter((r) => r.id !== topHit?.id));
    return list;
  }, [isCommandMode, query, topHit, filteredResults]);

  // Selected item for preview
  const selectedItem = useMemo((): SearchResultItem | null => {
    if (isCommandMode) return null;
    const item = flatList[selectedIndex];
    if (!item || !("type" in item && "href" in item && "preview" in item))
      return null;
    return item as SearchResultItem;
  }, [flatList, selectedIndex, isCommandMode]);

  // Navigate to result
  function navigate(href: string, item?: SearchResultItem | RecentItem) {
    if (item && "type" in item) {
      saveRecent({
        id: item.id,
        type: item.type as ResultType,
        title: item.title,
        subtitle: "subtitle" in item ? item.subtitle : "",
        href,
      });
    }
    setOpen(false);
    setQuery("");
    setResults([]);
    setTopHit(null);
    router.push(href);
  }

  // Handle filter change
  function handleFilterChange(f: FilterType) {
    setFilter(f);
    setSelectedIndex(0);
  }

  // Handle query change
  function handleQueryChange(value: string) {
    setQuery(value);
    setSelectedIndex(0);
    if (value.startsWith(">")) {
      // Command mode -- clear search results
      setResults([]);
      setTopHit(null);
      setIsSearching(false);
    } else if (value.length < 2) {
      setResults([]);
      setTopHit(null);
      setIsSearching(false);
    }
  }

  // Keyboard handler
  function handleKeyDown(e: React.KeyboardEvent) {
    // Cmd+1-8 for filter shortcuts
    if (e.metaKey || e.ctrlKey) {
      const num = parseInt(e.key);
      if (num >= 1 && num <= FILTER_TYPES.length) {
        e.preventDefault();
        handleFilterChange(FILTER_TYPES[num - 1].key);
        return;
      }
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Tab":
        e.preventDefault();
        setShowPreview((v) => !v);
        break;
      case "Enter":
        e.preventDefault();
        {
          const item = flatList[selectedIndex];
          if (item) {
            if ("category" in item) {
              // Command item
              navigate((item as CommandItem).href);
            } else {
              // Search result item
              navigate(
                (item as SearchResultItem).href,
                item as SearchResultItem,
              );
            }
          }
        }
        break;
      case "Escape":
        if (query) {
          e.preventDefault();
          e.stopPropagation();
          handleQueryChange("");
          inputRef.current?.focus();
        }
        // else let the dialog close naturally
        break;
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-result-item]");
    const target = items[selectedIndex];
    if (target) {
      target.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Whether we have results to show
  const hasQuery = query.length >= 2 && !isCommandMode;
  const showResults = hasQuery && filteredResults.length > 0;
  const showEmpty = hasQuery && !isSearching && filteredResults.length === 0;
  const showRecents = !query && recents.length > 0;
  const showSuggestions = !query && suggestions.length > 0;
  const showQuickActions = !query;
  const showCommands = isCommandMode;
  const showPreviewPanel =
    showPreview && !isCommandMode && (showResults || !!topHit);

  // Quick actions for empty state
  const quickActions = [
    { label: "New Case", href: "/cases?action=new", icon: "\u{1F4C1}" },
    { label: "New Lead", href: "/leads?action=new", icon: "\u{1F504}" },
    { label: "Upload Doc", href: "/documents", icon: "\u{1F4C4}" },
    { label: "Go to Queue", href: "/queue", icon: "\u2611\uFE0F" },
  ];

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-[#EAEAEA] bg-white px-3 py-[7px] text-[13px] text-[#999] transition-colors duration-200 hover:border-[#CCC]"
      >
        <HugeiconsIcon icon={Search01Icon} size={14} />
        <span className="hidden md:inline">Search...</span>
        <kbd className="pointer-events-none ml-2 hidden h-5 select-none items-center gap-1 rounded border border-[#EAEAEA] bg-[#FAFAFA] px-1.5 font-mono text-[10px] font-medium text-[#999] md:inline-flex">
          <span className="text-xs">&#8984;</span>K
        </kbd>
      </button>

      {/* Command palette dialog */}
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] overflow-hidden rounded-xl bg-white p-0 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
            style={{
              width: showPreviewPanel ? 680 : 420,
              maxWidth: "calc(100vw - 32px)",
              maxHeight: 500,
              border: "1px solid #EAEAEA",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
            onKeyDown={handleKeyDown}
          >
            {/* Accessible title (hidden) */}
            <DialogPrimitive.Title className="sr-only">
              Command Palette
            </DialogPrimitive.Title>

            {/* Search input */}
            <div
              className="flex items-center border-b border-[#EAEAEA] px-3"
              style={{ height: 48 }}
            >
              <HugeiconsIcon
                icon={Search01Icon}
                size={16}
                className="mr-2.5 shrink-0 text-[#999]"
              />
              <input
                ref={inputRef}
                type="text"
                className="flex-1 bg-transparent outline-none text-[15px] text-[#111] placeholder:text-[#999]"
                style={{
                  fontFamily: "var(--font-geist-sans, 'Geist', sans-serif)",
                }}
                placeholder="Search cases, contacts, tasks... or > for commands"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => handleQueryChange("")}
                  className="shrink-0 text-[#999] hover:text-[#666] text-xs ml-2"
                >
                  Clear
                </button>
              )}
              <kbd className="pointer-events-none ml-2 hidden h-5 shrink-0 select-none items-center gap-1 rounded border border-[#EAEAEA] bg-[#FAFAFA] px-1.5 font-mono text-[10px] font-medium text-[#999] md:inline-flex">
                <span className="text-xs">&#8984;</span>K
              </kbd>
            </div>

            {/* Filter chips (only when searching, not in command mode) */}
            {(hasQuery || (query.length >= 2 && !isCommandMode)) && (
              <FilterChips active={filter} onChange={handleFilterChange} />
            )}

            {/* Main content area */}
            <div className="flex" style={{ minHeight: 200, maxHeight: 400 }}>
              {/* Results / Recents / Commands list */}
              <div
                ref={listRef}
                className="flex-1 overflow-y-auto"
                style={{ minWidth: 0 }}
              >
                {/* Loading state */}
                {isSearching && (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex items-center gap-2 text-[13px] text-[#999]">
                      <div
                        className="h-3.5 w-3.5 rounded-full border-2 border-[#E5E5E5] border-t-[#999]"
                        style={{ animation: "spin 600ms linear infinite" }}
                      />
                      Searching...
                    </div>
                  </div>
                )}

                {/* Top Hit */}
                {!isSearching && topHit && showResults && (
                  <div className="px-2 pt-2">
                    <div className="px-2 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#999]">
                        Top Result
                      </span>
                    </div>
                    <button
                      type="button"
                      data-result-item
                      onClick={() => navigate(topHit.href, topHit)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors duration-75"
                      style={{
                        backgroundColor:
                          selectedIndex === 0 ? "#F0F0F0" : "transparent",
                      }}
                      onMouseEnter={() => setSelectedIndex(0)}
                    >
                      <span className="text-base shrink-0">
                        {typeIcon(topHit.type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-[#111] truncate">
                          {topHit.title}
                        </p>
                        <p className="text-[12px] text-[#666] truncate">
                          {topHit.subtitle}
                        </p>
                      </div>
                      {topHit.badge && (
                        <Badge color={topHit.badgeColor}>{topHit.badge}</Badge>
                      )}
                    </button>
                  </div>
                )}

                {/* Grouped search results */}
                {!isSearching &&
                  showResults &&
                  Object.entries(groupedResults).map(([group, items]) => (
                    <div key={group} className="px-2 pt-2">
                      <div className="px-2 pb-1">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-[#999]">
                          {group}
                        </span>
                      </div>
                      {items.map((item) => {
                        const idx = flatList.indexOf(item);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            data-result-item
                            onClick={() => navigate(item.href, item)}
                            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-75"
                            style={{
                              backgroundColor:
                                idx === selectedIndex
                                  ? "#F0F0F0"
                                  : "transparent",
                            }}
                            onMouseEnter={() => {
                              if (idx >= 0) setSelectedIndex(idx);
                            }}
                          >
                            <span className="text-[13px] shrink-0 w-5 text-center">
                              {typeIcon(item.type)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-[#111] truncate">
                                {item.title}
                              </p>
                              <p className="text-[12px] text-[#666] truncate">
                                {item.subtitle}
                              </p>
                            </div>
                            {item.badge && (
                              <Badge color={item.badgeColor}>
                                {item.badge}
                              </Badge>
                            )}
                            {item.metadata && !item.badge && (
                              <span className="text-[11px] text-[#999] shrink-0">
                                {item.metadata}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}

                {/* No results */}
                {showEmpty && (
                  <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                    <p className="text-[13px] text-[#666]">
                      No results for &ldquo;{query}&rdquo;
                    </p>
                    <p className="mt-1 text-[12px] text-[#999]">
                      Try searching by case number, name, or document title
                    </p>
                    <div className="mt-4 flex gap-2">
                      {quickActions.slice(0, 2).map((a) => (
                        <button
                          key={a.href}
                          type="button"
                          onClick={() => navigate(a.href)}
                          className="rounded-md border border-[#E5E5E5] px-3 py-1.5 text-[12px] font-medium text-[#666] transition-colors duration-100 hover:bg-[#FAFAFA]"
                        >
                          {a.icon} {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Command mode */}
                {showCommands && (
                  <div className="px-2 pt-2">
                    {(["action", "navigation", "admin"] as const).map((cat) => {
                      const items = (flatList as CommandItem[]).filter(
                        (c) => "category" in c && c.category === cat,
                      );
                      if (items.length === 0) return null;
                      return (
                        <div key={cat} className="mb-1">
                          <div className="px-2 pb-1 pt-1">
                            <span className="text-[11px] font-medium uppercase tracking-wider text-[#999]">
                              {cat === "action"
                                ? "Quick Actions"
                                : cat === "navigation"
                                  ? "Go To"
                                  : "Admin"}
                            </span>
                          </div>
                          {items.map((cmd) => {
                            const idx = flatList.indexOf(cmd);
                            return (
                              <button
                                key={cmd.id}
                                type="button"
                                data-result-item
                                onClick={() => navigate(cmd.href)}
                                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-75"
                                style={{
                                  backgroundColor:
                                    idx === selectedIndex
                                      ? "#F0F0F0"
                                      : "transparent",
                                }}
                                onMouseEnter={() => {
                                  if (idx >= 0) setSelectedIndex(idx);
                                }}
                              >
                                <span className="text-[13px] shrink-0 w-5 text-center">
                                  {typeIcon(cmd.category)}
                                </span>
                                <span className="text-[13px] font-medium text-[#111]">
                                  {cmd.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                    {(flatList as CommandItem[]).length === 0 && (
                      <div className="py-6 text-center text-[13px] text-[#999]">
                        No matching commands
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state: Recents + Quick Actions */}
                {showQuickActions && (
                  <div className="px-2 pt-2">
                    {/* Recent items */}
                    {showRecents && (
                      <div className="mb-1">
                        <div className="px-2 pb-1">
                          <span className="text-[11px] font-medium uppercase tracking-wider text-[#999]">
                            Recent
                          </span>
                        </div>
                        {recents.slice(0, 8).map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => navigate(r.href, r)}
                            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-75 hover:bg-[#FAFAFA]"
                          >
                            <span className="text-[13px] shrink-0 w-5 text-center">
                              {typeIcon(r.type)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-[#111] truncate">
                                {r.title}
                              </p>
                              {r.subtitle && (
                                <p className="text-[11px] text-[#999] truncate">
                                  {r.subtitle}
                                </p>
                              )}
                            </div>
                            <span className="text-[10px] text-[#CCC] shrink-0">
                              {formatTimeAgo(r.timestamp)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Suggested items from DB */}
                    {showSuggestions && (
                      <div className="mb-1">
                        <div className="px-2 pb-1 pt-1">
                          <span className="text-[11px] font-medium uppercase tracking-wider text-[#999]">
                            Suggested
                          </span>
                        </div>
                        {suggestions.slice(0, 6).map((s) => (
                          <button
                            key={`${s.type}-${s.id}`}
                            type="button"
                            onClick={() =>
                              navigate(s.href, {
                                id: s.id,
                                type: s.type,
                                title: s.title,
                                subtitle: s.subtitle,
                                href: s.href,
                                timestamp: Date.now(),
                              })
                            }
                            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-75 hover:bg-[#FAFAFA]"
                          >
                            <span className="text-[13px] shrink-0 w-5 text-center">
                              {typeIcon(s.type)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-[#111] truncate">
                                {s.title}
                              </p>
                              {s.subtitle && (
                                <p className="text-[11px] text-[#999] truncate">
                                  {s.subtitle}
                                </p>
                              )}
                            </div>
                            {s.badge && (
                              <span className="text-[10px] font-mono text-[#999] shrink-0">
                                {s.badge}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Quick actions */}
                    <div className="mb-1">
                      <div className="px-2 pb-1 pt-1">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-[#999]">
                          Quick Actions
                        </span>
                      </div>
                      {quickActions.map((a) => (
                        <button
                          key={a.href}
                          type="button"
                          onClick={() => navigate(a.href)}
                          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-75 hover:bg-[#FAFAFA]"
                        >
                          <span className="text-[13px] shrink-0 w-5 text-center">
                            {a.icon}
                          </span>
                          <span className="text-[13px] font-medium text-[#111]">
                            {a.label}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Hint for command mode */}
                    <div className="px-2 py-3 text-center">
                      <span className="text-[11px] text-[#CCC]">
                        Type{" "}
                        <kbd className="rounded border border-[#E5E5E5] bg-[#FAFAFA] px-1 py-0.5 font-mono text-[10px]">
                          &gt;
                        </kbd>{" "}
                        for commands
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Preview panel */}
              {showPreviewPanel && (
                <PreviewPanel item={selectedItem} visible={showPreview} />
              )}
            </div>

            {/* Footer */}
            <FooterHints />

            {/* Spinner animation keyframes */}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

// ---------------------------------------------------------------------------
// Utility: relative time
// ---------------------------------------------------------------------------

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
