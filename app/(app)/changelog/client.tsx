"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon,
  Calendar03Icon,
  GitCommitIcon,
  ArrowRight01Icon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import {
  getChangelogCommits,
  type CommitEntry,
  type CommitType,
} from "@/app/actions/changelog";
import {
  getCommitDetails,
  type CommitDetails,
} from "@/app/actions/changelog-details";

/* ─── Type badge config ─── */
const TYPE_CONFIG: Record<
  CommitType,
  { label: string; color: string; bg: string; dot: string }
> = {
  feat: {
    label: "Feature",
    color: "#0070F3",
    bg: "rgba(0,112,243,0.08)",
    dot: "bg-[#0070F3]",
  },
  fix: {
    label: "Fix",
    color: "#EE0000",
    bg: "rgba(238,0,0,0.08)",
    dot: "bg-[#EE0000]",
  },
  chore: {
    label: "Chore",
    color: "#666",
    bg: "rgba(102,102,102,0.08)",
    dot: "bg-[#999]",
  },
  docs: {
    label: "Docs",
    color: "#1d72b8",
    bg: "rgba(29,114,184,0.08)",
    dot: "bg-[#1d72b8]",
  },
  refactor: {
    label: "Refactor",
    color: "#7b5fe6",
    bg: "rgba(123,95,230,0.08)",
    dot: "bg-[#7b5fe6]",
  },
  perf: {
    label: "Perf",
    color: "#F5A623",
    bg: "rgba(245,166,35,0.08)",
    dot: "bg-[#F5A623]",
  },
  ci: {
    label: "CI",
    color: "#666",
    bg: "rgba(102,102,102,0.08)",
    dot: "bg-[#999]",
  },
  test: {
    label: "Test",
    color: "#1d72b8",
    bg: "rgba(29,114,184,0.08)",
    dot: "bg-[#1d72b8]",
  },
  other: {
    label: "Update",
    color: "#666",
    bg: "rgba(102,102,102,0.08)",
    dot: "bg-[#999]",
  },
};

/* ─── Time bucketing ─── */
interface CommitBucket {
  key: string;
  label: string;
  commits: CommitEntry[];
}

function bucketCommits(commits: CommitEntry[]): CommitBucket[] {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const bucketMap = new Map<string, CommitEntry[]>();
  const bucketOrder: string[] = [];

  function addToBucket(key: string, commit: CommitEntry) {
    if (!bucketMap.has(key)) {
      bucketMap.set(key, []);
      bucketOrder.push(key);
    }
    bucketMap.get(key)!.push(commit);
  }

  for (const commit of commits) {
    const d = new Date(commit.date);

    if (d >= startOfToday) {
      addToBucket("today", commit);
    } else if (d >= startOfWeek) {
      addToBucket("this-week", commit);
    } else if (d >= startOfMonth) {
      addToBucket("this-month", commit);
    } else {
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      addToBucket(monthKey, commit);
    }
  }

  return bucketOrder.map((key) => ({
    key,
    label: bucketLabel(key),
    commits: bucketMap.get(key)!,
  }));
}

function bucketLabel(key: string): string {
  if (key === "today") return "Today";
  if (key === "this-week") return "This Week";
  if (key === "this-month") return "This Month";
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function bucketIcon(key: string) {
  if (key === "today") return Clock01Icon;
  if (key === "this-week") return Calendar03Icon;
  return GitCommitIcon;
}

/* ─── Relative time ─── */
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;

  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/* ─── Tiny inline markdown renderer ───
 * Handles **bold**, paragraphs, and `code` so we don't add a markdown dep.
 * For anything richer we'd reach for react-markdown.
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={key++} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      parts.push(
        <code
          key={key++}
          className="rounded bg-[#F5F5F5] px-1 py-0.5 font-mono text-[11px]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MarkdownParagraphs({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="text-[13px] leading-relaxed text-[#444]">
          {renderInlineMarkdown(para)}
        </p>
      ))}
    </>
  );
}

/* ─── Detail panel rendered inside the accordion ─── */
function CommitDetailBody({
  commit,
  details,
  loading,
}: {
  commit: CommitEntry;
  details: CommitDetails | null;
  loading: boolean;
}) {
  if (loading && !details) {
    return (
      <div className="space-y-2 pt-3">
        <div className="h-3 w-3/4 animate-pulse rounded bg-[#F0F0F0]" />
        <div className="h-3 w-full animate-pulse rounded bg-[#F0F0F0]" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-[#F0F0F0]" />
      </div>
    );
  }

  // Fallback when the AI summary isn't available (no API key, error, etc.) —
  // show whatever git gave us so the accordion is never empty.
  if (!details || details.status !== "ready") {
    return (
      <div className="space-y-3 pt-3">
        {commit.body ? (
          <pre className="whitespace-pre-wrap rounded border border-[#EAEAEA] bg-[#FAFAFA] p-3 font-mono text-xs leading-relaxed text-[#666]">
            {commit.body}
          </pre>
        ) : (
          <p className="text-[12px] text-[#999]">
            No detailed explanation available yet.
          </p>
        )}
        {details?.errorMessage && (
          <p className="text-[11px] text-[#EE0000]">
            Generation error: {details.errorMessage}
          </p>
        )}
        {details?.filesChanged && details.filesChanged.length > 0 && (
          <FileList
            files={details.filesChanged}
            additions={details.additions}
            deletions={details.deletions}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-3">
      {/* Summary line */}
      {details.summary && (
        <p className="text-[14px] font-medium leading-snug text-foreground">
          {details.summary}
        </p>
      )}

      {/* Bullets */}
      {details.bullets && details.bullets.length > 0 && (
        <ul className="space-y-1.5">
          {details.bullets.map((b, i) => (
            <li
              key={i}
              className="relative pl-4 text-[13px] leading-snug text-[#444] before:absolute before:left-0 before:top-[7px] before:h-1 before:w-1 before:rounded-full before:bg-[#0070F3]"
            >
              {renderInlineMarkdown(b)}
            </li>
          ))}
        </ul>
      )}

      {/* Details paragraphs */}
      {details.details && (
        <div className="space-y-2 border-l-2 border-[#EAEAEA] pl-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#999]">
            What changed
          </div>
          <MarkdownParagraphs text={details.details} />
        </div>
      )}

      {/* User impact */}
      {details.userImpact && (
        <div className="rounded border border-[#E0EFFE] bg-[#F4F9FF] p-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#0070F3]">
            What this means for you
          </div>
          <MarkdownParagraphs text={details.userImpact} />
        </div>
      )}

      {/* Risk notes */}
      {details.riskNotes && details.riskNotes.trim() && (
        <div className="rounded border border-[#FCE4A1] bg-[#FFFBED] p-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#A86A00]">
            Watch for
          </div>
          <MarkdownParagraphs text={details.riskNotes} />
        </div>
      )}

      {/* File list */}
      {details.filesChanged && details.filesChanged.length > 0 && (
        <FileList
          files={details.filesChanged}
          additions={details.additions}
          deletions={details.deletions}
        />
      )}
    </div>
  );
}

function FileList({
  files,
  additions,
  deletions,
}: {
  files: NonNullable<CommitDetails["filesChanged"]>;
  additions: number | null;
  deletions: number | null;
}) {
  return (
    <details className="group rounded border border-[#EAEAEA] bg-white">
      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-[12px] text-[#666]">
        <span>
          {files.length} file{files.length === 1 ? "" : "s"} changed
          {additions !== null && deletions !== null && (
            <>
              {" — "}
              <span className="text-[#0E8345]">+{additions}</span>{" "}
              <span className="text-[#EE0000]">-{deletions}</span>
            </>
          )}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={12}
          className="transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <ul className="border-t border-[#EAEAEA] px-3 py-2">
        {files.map((f) => (
          <li
            key={f.path}
            className="flex items-center justify-between gap-2 py-0.5 font-mono text-[11px] text-[#666]"
          >
            <span className="truncate" title={f.path}>
              {f.path}
            </span>
            <span className="shrink-0 text-[10px] text-[#999]">
              <span className="text-[#0E8345]">+{f.additions}</span>{" "}
              <span className="text-[#EE0000]">-{f.deletions}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ─── Commit Row ─── */
function CommitRow({
  commit,
  isLast,
}: {
  commit: CommitEntry;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<CommitDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);
  const cfg = TYPE_CONFIG[commit.type];

  // Lazy-load details the first time the accordion opens. Track in-flight via a
  // ref so we don't depend on `loading`/`details` and trigger our own cleanup.
  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    setLoading(true);
    getCommitDetails(commit.hash)
      .then((result) => {
        if (!cancelled) setDetails(result);
      })
      .catch(() => {
        // Network/server failure — fallback renders the raw commit body
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, commit.hash]);

  return (
    <div className="group relative flex gap-3 pb-4">
      {!isLast && (
        <div className="absolute left-[3px] top-3 h-full w-px bg-[#EAEAEA]" />
      )}

      <div
        className={cn(
          "relative z-10 mt-1.5 h-2 w-2 shrink-0 rounded-full",
          cfg.dot,
        )}
      />

      <div className="min-w-0 flex-1">
        <Collapsible open={open} onOpenChange={setOpen}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{ color: cfg.color, backgroundColor: cfg.bg }}
            >
              {cfg.label}
            </span>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="text-left text-[13px] font-medium leading-snug text-foreground hover:underline"
              >
                {commit.subject}
              </button>
            </CollapsibleTrigger>
          </div>

          {/* Meta row */}
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[#999]">
            <span>{commit.author}</span>
            <span className="text-[#EAEAEA]">&middot;</span>
            <span>{formatRelativeTime(commit.date)}</span>
            <span className="text-[#EAEAEA]">&middot;</span>
            <a
              href={commit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-0.5 font-mono text-[#999] transition-colors hover:text-[#0070F3] sm:inline-flex"
            >
              {commit.shortHash}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={10}
                className="-rotate-45 opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden="true"
              />
            </a>
            <span className="text-[#EAEAEA]">&middot;</span>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[#999] transition-colors hover:text-foreground"
              >
                {open ? "Hide details" : "Show details"}
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={10}
                  className={cn(
                    "transition-transform",
                    open && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent>
            <CommitDetailBody
              commit={commit}
              details={details}
              loading={loading}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

/* ─── Section ─── */
function BucketSection({ bucket }: { bucket: CommitBucket }) {
  const Icon = bucketIcon(bucket.key);
  const PRIMARY = "#263c94";

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={Icon} size={16} color={PRIMARY} aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">
          {bucket.label}
        </h2>
        <Badge variant="outline" className="ml-1 text-[10px]">
          {bucket.commits.length}
        </Badge>
      </div>

      <div className="rounded-md border border-[#EAEAEA] bg-white p-4">
        {bucket.commits.map((commit, i) => (
          <CommitRow
            key={commit.hash}
            commit={commit}
            isLast={i === bucket.commits.length - 1}
          />
        ))}
      </div>
    </section>
  );
}

/* ─── Main client component ─── */
export function ChangelogClient({
  initialCommits,
  initialHasMore,
}: {
  initialCommits: CommitEntry[];
  initialHasMore: boolean;
}) {
  const [commits, setCommits] = useState(initialCommits);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    try {
      localStorage.setItem("changelog:lastViewedAt", new Date().toISOString());
    } catch {
      // storage unavailable
    }
  }, []);

  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    startTransition(async () => {
      const result = await getChangelogCommits(nextPage, 50);
      setCommits((prev) => [...prev, ...result.commits]);
      setHasMore(result.hasMore);
      setPage(nextPage);
    });
  }, [page]);

  const buckets = bucketCommits(commits);

  if (commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <HugeiconsIcon
          icon={GitCommitIcon}
          size={32}
          className="text-[#999]"
          aria-hidden="true"
        />
        <p className="mt-4 text-[14px] font-medium text-foreground">
          No commits found
        </p>
        <p className="mt-1 max-w-xs text-[13px] text-[#666]">
          Commits will appear here as the team pushes changes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {buckets.map((bucket) => (
        <BucketSection key={bucket.key} bucket={bucket} />
      ))}

      {hasMore && (
        <div className="flex justify-center pt-2 pb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={isPending}
          >
            {isPending ? "Loading..." : "Load more commits"}
          </Button>
        </div>
      )}
    </div>
  );
}
