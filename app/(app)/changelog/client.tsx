"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon,
  Calendar03Icon,
  GitCommitIcon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import {
  getChangelogCommits,
  type CommitEntry,
  type CommitType,
} from "@/app/actions/changelog";

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
      // Group by month: "2026-03" etc.
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
  // "2026-03" -> "March 2026"
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

/* ─── Commit Row ─── */
function CommitRow({
  commit,
  isLast,
}: {
  commit: CommitEntry;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = TYPE_CONFIG[commit.type];

  return (
    <div className="group relative flex gap-3 pb-4">
      {/* Vertical line */}
      {!isLast && (
        <div className="absolute left-[3px] top-3 h-full w-px bg-[#EAEAEA]" />
      )}

      {/* Timeline dot */}
      <div
        className={cn(
          "relative z-10 mt-1.5 h-2 w-2 shrink-0 rounded-full",
          cfg.dot,
        )}
      />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Type badge */}
          <span
            className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
            style={{ color: cfg.color, backgroundColor: cfg.bg }}
          >
            {cfg.label}
          </span>
          {/* Subject */}
          <span className="text-[13px] font-medium text-foreground leading-snug">
            {commit.subject}
          </span>
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
            className="hidden sm:inline-flex items-center gap-0.5 font-mono text-[#999] hover:text-[#0070F3] transition-colors"
          >
            {commit.shortHash}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={10}
              className="opacity-0 group-hover:opacity-100 transition-opacity -rotate-45"
            />
          </a>
          {/* Body toggle */}
          {commit.body && (
            <>
              <span className="text-[#EAEAEA]">&middot;</span>
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="text-[#999] hover:text-foreground transition-colors"
              >
                {expanded ? "Hide details" : "Show details"}
              </button>
            </>
          )}
        </div>

        {/* Expanded body */}
        {expanded && commit.body && (
          <pre className="mt-2 whitespace-pre-wrap rounded border border-[#EAEAEA] bg-[#FAFAFA] p-3 text-xs text-[#666] font-mono leading-relaxed">
            {commit.body}
          </pre>
        )}
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
        <HugeiconsIcon icon={Icon} size={16} color={PRIMARY} />
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

  // Mark as viewed for nav badge
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
