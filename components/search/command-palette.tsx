"use client";

/**
 * CommandPalette — the cmd+K global search experience.
 *
 * This is the phase 0 shell: it hits /api/search/v2, renders results
 * grouped by entity type, supports keyboard navigation, shows a
 * "matched in" sub-label, and wires the scoped-prefix grammar from the
 * query parser. Phase 1 layers in facet chips, preview pane, local
 * IndexedDB cache, and the full command (verb) mode.
 *
 * Design goals:
 *   - Feels instant: ≤100ms debounce, selection preserved across swaps.
 *   - Readable from any page: appears over a dimmed backdrop, 640px wide.
 *   - Keyboard first: arrows, Enter, Escape, ⌘⏎ for new tab.
 *   - Respects reduced-motion preference.
 */

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  EntityType,
  SearchResponse,
  SearchResult,
} from "@/lib/search/types";

const DEBOUNCE_MS = 120;
const RECENT_STORAGE_KEY = "favorble.search.recents.v2";
const RECENT_CAP = 8;

type RecentItem = {
  entityId: string;
  entityType: EntityType;
  title: string;
  subtitle: string | null;
  href: string;
  ts: number;
};

// ─── Hook: global ⌘K open-state ───────────────────────────────────

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return { open, setOpen };
}

// ─── Main component ───────────────────────────────────────────────

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [recents, setRecents] = useState<RecentItem[]>(() => loadRecents());

  // Focus the input on open.
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
    } else {
      setQuery("");
      setResponse(null);
      setHighlighted(0);
    }
  }, [open]);

  // Debounced fetch.
  useEffect(() => {
    if (!open) return;
    const q = deferredQuery.trim();
    if (!q) {
      setResponse(null);
      setLoading(false);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `/api/search/v2?q=${encodeURIComponent(q)}&limit=30`;
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) {
          setResponse(null);
          return;
        }
        const data = (await res.json()) as SearchResponse;
        setResponse(data);
        setHighlighted(0);
      } catch {
        setResponse(null);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [deferredQuery, open]);

  const flatResults = useMemo(() => response?.results ?? [], [response]);
  const groupedResults = useMemo(() => groupByType(flatResults), [flatResults]);
  // Flat list of indices in the order they appear, for keyboard nav.
  const navigableResults = flatResults;

  const commit = useCallback(
    (result: SearchResult, opts: { newTab?: boolean } = {}) => {
      pushRecent({
        entityId: result.entityId,
        entityType: result.entityType,
        title: result.title,
        subtitle: result.subtitle,
        href: result.href,
        ts: Date.now(),
      });
      setRecents(loadRecents());
      setOpen(false);
      if (opts.newTab) {
        window.open(result.href, "_blank", "noopener,noreferrer");
      } else {
        router.push(result.href);
      }
    },
    [router, setOpen],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((i) => Math.min(i + 1, navigableResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const result = navigableResults[highlighted];
        if (result) {
          commit(result, { newTab: e.metaKey || e.ctrlKey });
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === "Backspace" && !query) {
        // no-op for now; phase 1 pops the scope chip here
      }
    },
    [commit, highlighted, navigableResults, query, setOpen],
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ttn-search-trigger"
        aria-label="Open search"
      >
        <span className="ttn-search-placeholder">Search…</span>
        <kbd className="ttn-search-badge">⌘K</kbd>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        backgroundColor: "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "14vh",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="combobox"
        aria-expanded="true"
        aria-owns="cmdp-listbox"
        aria-haspopup="listbox"
        style={{
          width: "min(640px, calc(100vw - 32px))",
          maxHeight: "68vh",
          backgroundColor: "#ffffff",
          borderRadius: 12,
          boxShadow:
            "0 1px 3px rgba(0,0,0,0.04), 0 20px 40px rgba(15, 23, 42, 0.22)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid #EAEAEA",
        }}
      >
        {/* Input bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "14px 16px",
            borderBottom: "1px solid #F0F0F0",
            gap: 10,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width={16}
            height={16}
            fill="none"
            stroke="#999"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx={11} cy={11} r={7} />
            <line x1={21} y1={21} x2={16.65} y2={16.65} />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search cases, contacts, documents, emails…"
            aria-label="Search"
            aria-autocomplete="list"
            aria-controls="cmdp-listbox"
            aria-activedescendant={
              navigableResults[highlighted]
                ? `cmdp-row-${navigableResults[highlighted].id}`
                : undefined
            }
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: 15,
              background: "transparent",
              color: "#111",
            }}
          />
          {loading && (
            <span
              aria-hidden
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: "#999",
              }}
            >
              …
            </span>
          )}
          <kbd
            style={{
              fontSize: 10,
              fontFamily: "monospace",
              color: "#999",
              padding: "2px 6px",
              borderRadius: 4,
              border: "1px solid #EAEAEA",
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results region */}
        <div
          id="cmdp-listbox"
          role="listbox"
          aria-live="polite"
          aria-label="Search results"
          style={{ overflowY: "auto", flex: 1 }}
        >
          {!query && (
            <RecentSection
              recents={recents}
              onPick={(r) => {
                setOpen(false);
                router.push(r.href);
              }}
            />
          )}

          {query && !loading && flatResults.length === 0 && (
            <EmptyState query={query} />
          )}

          {groupedResults.map((group) => (
            <ResultGroup
              key={group.type}
              type={group.type}
              results={group.results}
              highlightedId={navigableResults[highlighted]?.id}
              onPick={commit}
            />
          ))}
        </div>

        {/* Footer hints */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 14px",
            borderTop: "1px solid #F0F0F0",
            fontSize: 11,
            color: "#999",
            fontFamily: "monospace",
          }}
        >
          <span>
            {response?.totalHits ?? 0} result
            {(response?.totalHits ?? 0) === 1 ? "" : "s"}
            {response?.latencyMs != null ? ` · ${response.latencyMs}ms` : ""}
          </span>
          <span>↑↓ navigate · ↵ open · ⌘↵ new tab · esc close</span>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────

function ResultGroup({
  type,
  results,
  highlightedId,
  onPick,
}: {
  type: EntityType;
  results: SearchResult[];
  highlightedId: string | undefined;
  onPick: (r: SearchResult, opts?: { newTab?: boolean }) => void;
}) {
  return (
    <div>
      <div
        style={{
          padding: "8px 16px 4px",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#999",
        }}
      >
        {typeLabel(type)}
        <span style={{ marginLeft: 8, color: "#C7C7C7" }}>
          {results.length}
        </span>
      </div>
      {results.map((r) => (
        <ResultRow
          key={r.id}
          result={r}
          highlighted={r.id === highlightedId}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

function ResultRow({
  result,
  highlighted,
  onPick,
}: {
  result: SearchResult;
  highlighted: boolean;
  onPick: (r: SearchResult, opts?: { newTab?: boolean }) => void;
}) {
  return (
    <div
      id={`cmdp-row-${result.id}`}
      role="option"
      aria-selected={highlighted}
      onMouseDown={(e) => {
        e.preventDefault();
        onPick(result, { newTab: e.metaKey || e.ctrlKey });
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        cursor: "pointer",
        backgroundColor: highlighted ? "#F3F5F9" : "transparent",
        borderLeft: highlighted ? "2px solid #263c94" : "2px solid transparent",
      }}
    >
      <EntityIcon type={result.entityType} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: "#171717",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          dangerouslySetInnerHTML={{
            __html: renderWithHighlights(result.title),
          }}
        />
        {result.snippet && (
          <div
            style={{
              fontSize: 11,
              color: "#6B7280",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginTop: 2,
            }}
            dangerouslySetInnerHTML={{
              __html: renderWithHighlights(result.snippet),
            }}
          />
        )}
        {result.subtitle && !result.snippet && (
          <div
            style={{
              fontSize: 11,
              color: "#6B7280",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginTop: 2,
            }}
          >
            {result.subtitle}
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: 10,
          color: "#A1A1AA",
          fontFamily: "monospace",
        }}
      >
        {matchedFieldLabel(result.matchedField)}
      </span>
    </div>
  );
}

function RecentSection({
  recents,
  onPick,
}: {
  recents: RecentItem[];
  onPick: (r: RecentItem) => void;
}) {
  if (!recents.length) {
    return (
      <div
        style={{
          padding: "24px 16px",
          color: "#9CA3AF",
          fontSize: 12,
        }}
      >
        <div style={{ marginBottom: 6, color: "#6B7280" }}>
          Start typing to search across cases, contacts, documents, and more.
        </div>
        <div style={{ fontSize: 11 }}>
          Tip: use <code>case:HS-12345</code>, <code>@name</code>,{" "}
          <code>stage:4D</code>, or <code>this week</code> to narrow.
        </div>
      </div>
    );
  }
  return (
    <div>
      <div
        style={{
          padding: "8px 16px 4px",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#999",
        }}
      >
        Recent
      </div>
      {recents.map((r) => (
        <button
          key={`${r.entityType}:${r.entityId}`}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(r);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 16px",
            cursor: "pointer",
            backgroundColor: "transparent",
            border: "none",
            width: "100%",
            textAlign: "left",
          }}
        >
          <EntityIcon type={r.entityType} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                color: "#171717",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {r.title}
            </div>
            {r.subtitle && (
              <div
                style={{
                  fontSize: 11,
                  color: "#6B7280",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  marginTop: 2,
                }}
              >
                {r.subtitle}
              </div>
            )}
          </div>
          <span style={{ fontSize: 10, color: "#A1A1AA" }}>
            {typeLabel(r.entityType)}
          </span>
        </button>
      ))}
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div
      style={{
        padding: "28px 16px",
        textAlign: "center",
        color: "#6B7280",
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 500, color: "#171717", marginBottom: 4 }}>
        No results for “{query}”.
      </div>
      <div style={{ fontSize: 11, color: "#9CA3AF" }}>
        Try removing a filter, or search by case number like{" "}
        <code>HS-12345</code>.
      </div>
    </div>
  );
}

function EntityIcon({ type }: { type: EntityType }) {
  const { label, bg, fg } = iconMeta(type);
  return (
    <div
      aria-hidden
      style={{
        flexShrink: 0,
        width: 22,
        height: 22,
        borderRadius: 5,
        backgroundColor: bg,
        color: fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: "monospace",
      }}
    >
      {label}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function groupByType(results: SearchResult[]) {
  const groups = new Map<EntityType, SearchResult[]>();
  for (const r of results) {
    const existing = groups.get(r.entityType);
    if (existing) existing.push(r);
    else groups.set(r.entityType, [r]);
  }
  return Array.from(groups.entries()).map(([type, results]) => ({
    type,
    results,
  }));
}

function typeLabel(type: EntityType): string {
  switch (type) {
    case "case":
      return "Cases";
    case "contact":
      return "Contacts";
    case "lead":
      return "Leads";
    case "user":
      return "People";
    case "document":
      return "Documents";
    case "document_chunk":
      return "Passages";
    case "chronology_entry":
      return "Chronology";
    case "calendar_event":
      return "Calendar";
    case "task":
      return "Tasks";
    case "communication":
      return "Messages";
    case "chat_message":
      return "Team Chat";
    case "outbound_mail":
      return "Mail";
    case "invoice":
      return "Invoices";
    case "time_entry":
      return "Time";
    case "expense":
      return "Expenses";
    case "payment":
      return "Payments";
    case "trust_transaction":
      return "Trust";
    case "workflow":
      return "Workflows";
    case "document_template":
      return "Templates";
    case "audit_log_entry":
      return "Audit Log";
    default:
      return String(type);
  }
}

function matchedFieldLabel(field: string): string {
  switch (field) {
    case "title":
      return "title";
    case "subtitle":
      return "meta";
    case "body":
      return "content";
    case "identifier":
      return "id match";
    case "tag":
      return "tag";
    case "facet":
      return "facet";
    default:
      return field;
  }
}

function iconMeta(type: EntityType): { label: string; bg: string; fg: string } {
  switch (type) {
    case "case":
      return { label: "CA", bg: "#EEF1FA", fg: "#263c94" };
    case "contact":
      return { label: "CT", bg: "#E6F7EF", fg: "#047857" };
    case "lead":
      return { label: "LD", bg: "#FEF3C7", fg: "#92400E" };
    case "user":
      return { label: "PP", bg: "#F3E8FF", fg: "#6B21A8" };
    case "document":
      return { label: "DC", bg: "#E5EFFF", fg: "#1d4ed8" };
    case "document_chunk":
      return { label: "¶", bg: "#DBEAFE", fg: "#1e40af" };
    case "chronology_entry":
      return { label: "CH", bg: "#FCE7F3", fg: "#9d174d" };
    case "calendar_event":
      return { label: "CL", bg: "#FEE4E2", fg: "#b91c1c" };
    case "task":
      return { label: "TK", bg: "#FEF3C7", fg: "#B45309" };
    case "communication":
      return { label: "MS", bg: "#DBEAFE", fg: "#1d4ed8" };
    case "chat_message":
      return { label: "CM", bg: "#E0E7FF", fg: "#4338ca" };
    case "outbound_mail":
      return { label: "MA", bg: "#FDE68A", fg: "#78350F" };
    case "invoice":
      return { label: "$", bg: "#D1FAE5", fg: "#065F46" };
    case "trust_transaction":
      return { label: "TR", bg: "#E0F2FE", fg: "#0369A1" };
    default:
      return { label: "··", bg: "#F3F4F6", fg: "#4B5563" };
  }
}

function renderWithHighlights(text: string): string {
  // postgres ts_headline wraps matches in « » by default (configured in
  // the SQL). Convert to <mark> for the DOM, escaping anything else.
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(
      /«/g,
      '<mark style="background:#FEF3C7;color:inherit;padding:0 1px;">',
    )
    .replace(/»/g, "</mark>");
}

function loadRecents(): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, RECENT_CAP);
  } catch {
    return [];
  }
}

function pushRecent(item: RecentItem) {
  if (typeof window === "undefined") return;
  try {
    const existing = loadRecents().filter(
      (r) =>
        !(r.entityId === item.entityId && r.entityType === item.entityType),
    );
    const next = [item, ...existing].slice(0, RECENT_CAP);
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota exceeded, ignore */
  }
}
