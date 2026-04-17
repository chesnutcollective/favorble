"use client";

/**
 * Breadcrumbs — shell-level "where am I" trail for deep staff routes.
 *
 * Splits `usePathname()` on `/`, humanizes each segment, and renders
 * `<Link>` crumbs separated by a chevron. The final segment is rendered
 * as plain text with `aria-current="page"`.
 *
 * ### Dynamic segments
 * For paths containing opaque IDs (case UUIDs, integration IDs, user
 * IDs, etc.) the server-rendered page can pass a `labels` prop, keyed
 * by the raw segment, to override the humanized label.
 *
 *   <Breadcrumbs labels={{ [caseId]: caseNumber }} />
 *
 * ### Hidden routes
 * Top-level staff pages (dashboard, cases, queue) hide the breadcrumb
 * since the persona rail + subnav already answer "where am I?". This
 * component returns `null` on those routes automatically.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { humanizeToken } from "@/lib/human-labels";

// ─── Label context ────────────────────────────────────────────────
//
// Server-rendered pages (e.g. the /cases/[id] layout) can inject a
// raw-segment → display-label mapping by rendering `<BreadcrumbLabel
// segment={caseId} label={caseNumber} />`. The shell-level <Breadcrumbs />
// reads from this context when resolving each crumb.

type LabelMap = Record<string, string>;
type LabelSetter = (segment: string, label: string | null) => void;

const BreadcrumbLabelContext = createContext<{
  labels: LabelMap;
  setLabel: LabelSetter;
} | null>(null);

/**
 * Wrap the app shell with this provider so deeper pages can register
 * friendly labels for opaque segments (UUIDs, external IDs).
 */
export function BreadcrumbsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [labels, setLabels] = useState<LabelMap>({});
  const setLabel: LabelSetter = (segment, label) => {
    setLabels((prev) => {
      if (label == null) {
        if (!(segment in prev)) return prev;
        const next: LabelMap = {};
        for (const k of Object.keys(prev)) {
          if (k !== segment) next[k] = prev[k] as string;
        }
        return next;
      }
      if (prev[segment] === label) return prev;
      return { ...prev, [segment]: label };
    });
  };
  const value = useMemo(() => ({ labels, setLabel }), [labels]);
  return (
    <BreadcrumbLabelContext.Provider value={value}>
      {children}
    </BreadcrumbLabelContext.Provider>
  );
}

/**
 * Client-component side-effect that registers a label for the given
 * segment. Render it from any page or layout (wrapped in a client
 * boundary) to make breadcrumbs render friendly copy for that segment.
 */
export function BreadcrumbLabel({
  segment,
  label,
}: {
  segment: string;
  label: string;
}) {
  const ctx = useContext(BreadcrumbLabelContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setLabel(segment, label);
    return () => ctx.setLabel(segment, null);
  }, [ctx, segment, label]);
  return null;
}

type BreadcrumbsProps = {
  /** Raw-segment → display-label overrides (e.g. case UUID → "HS-12345"). */
  labels?: Record<string, string>;
  /** Optional top-level aliases (e.g. "admin" → "Admin Console"). */
  rootLabels?: Record<string, string>;
  className?: string;
};

// Routes where breadcrumbs should NOT render. These are one-level pages
// whose location is already obvious from the nav rail / subnav.
const HIDDEN_ROOTS = new Set<string>([
  "dashboard",
  "cases",
  "queue",
  "mail",
  "messages",
  "calendar",
  "contacts",
  "leads",
  "tasks",
  "team-chat",
  "drafts",
  "settings",
  "supervisor",
  "changelog",
  "documents",
  "billing",
  "trust",
  "hearings",
  "filing",
  "appeals-council",
  "coaching",
  "email",
  "phi-writer",
  "medical-records",
  "fee-collection",
  "post-hearing",
]);

// Top-level segments that always benefit from a crumb trail when deeper.
// Everything below expands into full crumbs.
const DEFAULT_ROOT_LABELS: Record<string, string> = {
  admin: "Admin",
  reports: "Reports",
  cases: "Cases",
  integrations: "Integrations",
};

export function Breadcrumbs({
  labels,
  rootLabels,
  className,
}: BreadcrumbsProps) {
  const pathname = usePathname();
  const ctx = useContext(BreadcrumbLabelContext);
  const ctxLabels = ctx?.labels;

  const crumbs = useMemo(() => {
    if (!pathname) return [];
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) return [];

    // Hide on top-level pages (one segment, in the hidden-roots set).
    if (segments.length === 1 && HIDDEN_ROOTS.has(segments[0] ?? "")) {
      return [];
    }

    const mergedRootLabels = { ...DEFAULT_ROOT_LABELS, ...(rootLabels ?? {}) };

    return segments.map((seg, idx) => {
      const href = `/${segments.slice(0, idx + 1).join("/")}`;
      const explicit = labels?.[seg] ?? ctxLabels?.[seg];
      const rootAlias = idx === 0 ? mergedRootLabels[seg] : undefined;
      const label = explicit ?? rootAlias ?? humanizeToken(seg);
      return {
        href,
        label,
        raw: seg,
        isLast: idx === segments.length - 1,
      };
    });
  }, [pathname, labels, rootLabels, ctxLabels]);

  if (crumbs.length === 0) return null;
  // Only render when we actually add value: 2+ crumbs.
  if (crumbs.length < 2) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        minWidth: 0,
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      <ol
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          margin: 0,
          padding: 0,
          listStyle: "none",
          minWidth: 0,
          flexWrap: "nowrap",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        {crumbs.map((crumb, idx) => (
          <li
            key={crumb.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            {idx > 0 && (
              <span
                aria-hidden="true"
                style={{
                  color: "var(--muted-foreground, #9CA3AF)",
                  opacity: 0.6,
                  fontSize: 12,
                  userSelect: "none",
                }}
              >
                {"\u203A"}
              </span>
            )}
            {crumb.isLast ? (
              <span
                aria-current="page"
                title={crumb.label}
                style={{
                  color: "var(--foreground, #171717)",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 260,
                }}
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                title={crumb.label}
                style={{
                  color: "var(--muted-foreground, #6B7280)",
                  textDecoration: "none",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 200,
                  transition: "color 120ms ease",
                }}
                className="ttn-breadcrumb-link"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
