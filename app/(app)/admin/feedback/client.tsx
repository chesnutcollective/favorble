"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Camera01Icon,
  Mic01Icon,
  Target02Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import {
  updateFeedbackAction,
  bulkUpdateFeedbackAction,
  deleteFeedbackAction,
  buildClaudeExportAction,
} from "@/lib/feedback/actions";
import type { FeedbackStats } from "@/lib/feedback/service";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  CATEGORY_LABELS,
  STATUS_LABELS,
  CATEGORY_COLORS,
  STATUS_COLORS,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@/lib/feedback/constants";

type Item = {
  id: string;
  organizationId: string;
  userId: string | null;
  userEmail: string;
  userName: string | null;
  message: string;
  category: string;
  status: string;
  pageUrl: string | null;
  pageTitle: string | null;
  context: unknown;
  statusHistory: unknown;
  adminNotes: string | null;
  resolvedLink: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Types ──

type ContextShape = {
  screenshot?: { base64: string; width?: number; height?: number };
  voiceTranscript?: string;
  pin?: { selector: string; text: string; clickX: number; clickY: number };
  browser?: {
    userAgent?: string;
    viewport?: { width: number; height: number };
  };
  persona?: {
    actorPersonaId: string;
    effectivePersonaId: string;
    isViewingAs: boolean;
    personaLabel: string;
  };
  activeTab?: string;
};

function getContext(ctx: unknown): ContextShape {
  return ctx && typeof ctx === "object" ? (ctx as ContextShape) : {};
}

// ── Small visual helpers ──

function CategoryDot({ category }: { category: string }) {
  const c = CATEGORY_COLORS[category as FeedbackCategory] ?? CATEGORY_COLORS.other;
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: c.fg }}
      title={CATEGORY_LABELS[category as FeedbackCategory] ?? category}
    />
  );
}

function CategoryBadge({ category }: { category: string }) {
  const c = CATEGORY_COLORS[category as FeedbackCategory] ?? CATEGORY_COLORS.other;
  const label = CATEGORY_LABELS[category as FeedbackCategory] ?? category;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLORS[status as FeedbackStatus] ?? STATUS_COLORS.open;
  const label = STATUS_LABELS[status as FeedbackStatus] ?? status;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function ageClass(createdAtIso: string, status: string): string {
  if (status !== "open") return "";
  const days = (Date.now() - new Date(createdAtIso).getTime()) / (24 * 60 * 60 * 1000);
  if (days > 7) return "border-l-[3px] border-l-red-500";
  if (days > 3) return "border-l-[3px] border-l-amber-500";
  return "border-l-[3px] border-l-transparent";
}

/**
 * Infer environment (prod vs staging) from the submitted pageUrl. Returns null
 * when nothing useful is present (e.g. localhost or no URL).
 */
function inferEnv(pageUrl: string | null): "production" | "staging" | null {
  if (!pageUrl) return null;
  const lower = pageUrl.toLowerCase();
  if (lower.includes("staging") || lower.includes("preview.")) return "staging";
  if (lower.startsWith("http://localhost")) return null;
  if (
    lower.startsWith("https://favorble.") ||
    lower.startsWith("https://app.favorble.") ||
    lower.includes(".vercel.app") === false
  ) {
    return "production";
  }
  return null;
}

function EnvBadge({ pageUrl }: { pageUrl: string | null }) {
  const env = inferEnv(pageUrl);
  if (!env) return null;
  const isProd = env === "production";
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
      style={{
        background: isProd ? "rgba(22,163,148,0.10)" : "rgba(29,114,184,0.10)",
        color: isProd ? "#0f9e8a" : "#1d72b8",
      }}
    >
      {env}
    </span>
  );
}

// ── Main component ──

export function FeedbackAdminClient({
  items,
  stats,
  initialSelectedId,
}: {
  items: Item[];
  stats: FeedbackStats;
  initialSelectedId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [envFilter, setEnvFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  );
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkPending, startBulk] = useTransition();
  const [exportPending, startExport] = useTransition();

  // Keep URL in sync with the selected item so links are shareable and the
  // back button navigates naturally.
  useEffect(() => {
    const current = searchParams.get("id");
    if (current === selectedId) return;
    const params = new URLSearchParams(searchParams.toString());
    if (selectedId) params.set("id", selectedId);
    else params.delete("id");
    const qs = params.toString();
    router.replace(`/admin/feedback${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [selectedId, searchParams, router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
      if (envFilter !== "all") {
        const env = inferEnv(i.pageUrl);
        if (envFilter === "unknown" ? env !== null : env !== envFilter)
          return false;
      }
      if (!q) return true;
      return (
        i.message.toLowerCase().includes(q) ||
        i.userEmail.toLowerCase().includes(q) ||
        (i.userName?.toLowerCase().includes(q) ?? false) ||
        (i.pageUrl?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, search, statusFilter, categoryFilter, envFilter]);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );

  const allFilteredChecked =
    filtered.length > 0 && filtered.every((i) => checkedIds.has(i.id));

  const trendPct =
    stats.lastWeek === 0
      ? stats.thisWeek > 0
        ? 100
        : 0
      : Math.round(((stats.thisWeek - stats.lastWeek) / stats.lastWeek) * 100);

  function toggleOne(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    if (allFilteredChecked) {
      setCheckedIds((prev) => {
        const next = new Set(prev);
        for (const i of filtered) next.delete(i.id);
        return next;
      });
    } else {
      setCheckedIds((prev) => {
        const next = new Set(prev);
        for (const i of filtered) next.add(i.id);
        return next;
      });
    }
  }

  function clearChecked() {
    setCheckedIds(new Set());
  }

  function selectAllOpen() {
    setCheckedIds(
      (prev) => new Set([...prev, ...filtered.filter((i) => i.status === "open").map((i) => i.id)]),
    );
  }

  function handleBulkStatus(status: FeedbackStatus) {
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;
    startBulk(async () => {
      const result = await bulkUpdateFeedbackAction({ ids, status });
      if (result.success) {
        toast.success(
          `Marked ${result.updated ?? ids.length} as ${STATUS_LABELS[status]}.`,
        );
        clearChecked();
        router.refresh();
      } else {
        toast.error(result.error ?? "Bulk update failed");
      }
    });
  }

  function handleBulkDelete() {
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Permanently delete ${ids.length} feedback item${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
      )
    )
      return;
    startBulk(async () => {
      const result = await deleteFeedbackAction({ ids });
      if (result.success) {
        toast.success(`Deleted ${result.deleted ?? ids.length} item(s).`);
        if (selectedId && ids.includes(selectedId)) setSelectedId(null);
        clearChecked();
        router.refresh();
      } else {
        toast.error(result.error ?? "Delete failed");
      }
    });
  }

  function handleExportForClaude(scope: "all-open" | "selected") {
    startExport(async () => {
      const result = await buildClaudeExportAction({
        includeStatuses: scope === "all-open" ? ["open"] : undefined,
      });
      if (!result.success || !result.prompt) {
        toast.error(result.error ?? "Export failed");
        return;
      }
      // When exporting "selected", further filter the prompt client-side.
      // For Phase 3 we lean on the server returning all open items, then
      // strip blocks not in the selected set when scope === "selected".
      let finalPrompt = result.prompt;
      if (scope === "selected") {
        const ids = Array.from(checkedIds);
        if (ids.length === 0) {
          toast.error("Select at least one item to export.");
          return;
        }
        // Keep only the blocks whose `id: <uuid>` matches a checked id.
        const blocks = finalPrompt.split("[[feedback-export]]");
        const filteredBlocks = [blocks[0]];
        for (let i = 1; i < blocks.length; i++) {
          const match = /id:\s+([0-9a-f-]+)/.exec(blocks[i]);
          if (match && ids.includes(match[1])) {
            filteredBlocks.push(blocks[i]);
          }
        }
        finalPrompt = filteredBlocks.join("[[feedback-export]]");
      }
      try {
        await navigator.clipboard.writeText(finalPrompt);
        const count =
          scope === "selected"
            ? checkedIds.size
            : (result.itemCount ?? 0);
        toast.success(`Copied prompt for ${count} item(s) to clipboard.`);
      } catch {
        toast.error("Could not copy — see console.");
        // eslint-disable-next-line no-console
        console.log(finalPrompt);
      }
    });
  }

  const hasSelection = checkedIds.size > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="Feedback"
          description="Super-admin-submitted feedback — triage bugs, feature requests, and UX issues."
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExportForClaude("all-open")}
          disabled={exportPending}
        >
          {exportPending ? "Building..." : "Export all open"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Needs triage"
          value={stats.needsTriage}
          subtitle="Open > 48h"
          accent={stats.needsTriage > 0 ? "#d1453b" : undefined}
        />
        <StatCard
          label="Open"
          value={stats.open}
          subtitle={`${stats.total > 0 ? Math.round((stats.open / stats.total) * 100) : 0}% of total`}
        />
        <StatCard
          label="This week"
          value={stats.thisWeek}
          subtitle={
            trendPct === 0
              ? "same as last week"
              : `${trendPct > 0 ? "↑" : "↓"} ${Math.abs(trendPct)}% vs last week`
          }
        />
        <PipelineCard byStatus={stats.byStatus} total={stats.total} />
      </div>

      {/* Filter row / bulk bar — same vertical slot so layout doesn't jump */}
      {hasSelection ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-xs font-medium">
            {checkedIds.size} selected
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <Button size="sm" variant="outline" disabled={bulkPending} onClick={() => handleBulkStatus("building")}>
            Building
          </Button>
          <Button size="sm" variant="outline" disabled={bulkPending} onClick={() => handleBulkStatus("staging")}>
            Staging
          </Button>
          <Button size="sm" variant="outline" disabled={bulkPending} onClick={() => handleBulkStatus("production")}>
            Production
          </Button>
          <Button size="sm" variant="outline" disabled={bulkPending} onClick={() => handleBulkStatus("wont_fix")}>
            Won&apos;t fix
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={exportPending}
            onClick={() => handleExportForClaude("selected")}
          >
            Export selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkPending}
            onClick={handleBulkDelete}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={clearChecked} className="ml-auto text-xs">
            Clear
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search message, user, or page URL..."
            className="max-w-sm"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {FEEDBACK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {FEEDBACK_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={envFilter} onValueChange={setEnvFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All envs</SelectItem>
              <SelectItem value="production">Production</SelectItem>
              <SelectItem value="staging">Staging</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[12px] text-muted-foreground">
            {filtered.length} of {items.length}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={selectAllOpen}
            className="ml-auto text-xs"
            disabled={!filtered.some((i) => i.status === "open")}
          >
            Select all open
          </Button>
        </div>
      )}

      {/* Master-detail */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* List */}
        <div className="min-w-0 overflow-hidden rounded-md border">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <input
              type="checkbox"
              checked={allFilteredChecked}
              onChange={toggleAllFiltered}
              aria-label="Select all visible"
            />
            <span>{filtered.length} shown</span>
          </div>
          <div className="max-h-[calc(100vh-24rem)] min-h-[24rem] overflow-y-auto">
            {filtered.length === 0 ? (
              <EmptyState
                hasFilters={
                  search !== "" ||
                  statusFilter !== "all" ||
                  categoryFilter !== "all" ||
                  envFilter !== "all"
                }
                hasItems={items.length > 0}
                onClear={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setCategoryFilter("all");
                  setEnvFilter("all");
                }}
              />
            ) : (
              filtered.map((item) => (
                <ListRow
                  key={item.id}
                  item={item}
                  selected={selectedId === item.id}
                  checked={checkedIds.has(item.id)}
                  onSelect={() => setSelectedId(item.id)}
                  onCheck={() => toggleOne(item.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Detail */}
        <div className="min-w-0 rounded-md border">
          {selected ? (
            <DetailPanel
              item={selected}
              onClose={() => setSelectedId(null)}
              onDelete={async () => {
                if (!confirm("Delete this feedback? This cannot be undone."))
                  return;
                const result = await deleteFeedbackAction({ ids: [selected.id] });
                if (result.success) {
                  toast.success("Deleted.");
                  setSelectedId(null);
                  router.refresh();
                } else {
                  toast.error(result.error ?? "Delete failed");
                }
              }}
            />
          ) : (
            <div className="flex h-full min-h-[24rem] flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
              <p>Select a feedback item to view details.</p>
              {filtered.length > 0 && (
                <p className="mt-1 text-xs">
                  {filtered.length} visible · click any row on the left.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── List row ──

function ListRow({
  item,
  selected,
  checked,
  onSelect,
  onCheck,
}: {
  item: Item;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onCheck: () => void;
}) {
  const ctx = getContext(item.context);
  const hasScreenshot = Boolean(ctx.screenshot);
  const hasVoice = Boolean(ctx.voiceTranscript);
  const hasPin = Boolean(ctx.pin);

  return (
    <div
      onClick={onSelect}
      className={`flex cursor-pointer items-start gap-2 border-b px-3 py-2 transition-colors last:border-b-0 hover:bg-muted/40 ${ageClass(item.createdAt, item.status)} ${selected ? "bg-muted/50" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={onCheck}
        className="mt-1.5 shrink-0"
        aria-label="Select item"
      />
      <CategoryDot category={item.category} />
      <div className="min-w-0 flex-1">
        {/* Line 1: message + status */}
        <div className="flex items-start gap-2">
          <p className="line-clamp-2 flex-1 break-words text-xs font-medium">
            {item.message}
          </p>
          <StatusPill status={item.status} />
        </div>
        {/* Line 2: meta */}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground/80">
            {item.userName ?? item.userEmail.split("@")[0]}
          </span>
          <span>·</span>
          <span>{timeAgo(item.createdAt)}</span>
          <EnvBadge pageUrl={item.pageUrl} />
          <span className="flex items-center gap-1">
            {hasScreenshot && (
              <HugeiconsIcon
                icon={Camera01Icon}
                size={11}
                aria-label="Has screenshot"
              />
            )}
            {hasVoice && (
              <HugeiconsIcon
                icon={Mic01Icon}
                size={11}
                aria-label="Has voice note"
              />
            )}
            {hasPin && (
              <HugeiconsIcon
                icon={Target02Icon}
                size={11}
                aria-label="Has pinned element"
              />
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Detail panel ──

function DetailPanel({
  item,
  onClose,
  onDelete,
}: {
  item: Item;
  onClose: () => void;
  onDelete: () => void;
}) {
  const ctx = getContext(item.context);
  const [status, setStatus] = useState<FeedbackStatus>(
    item.status as FeedbackStatus,
  );
  const [notes, setNotes] = useState(item.adminNotes ?? "");
  const [link, setLink] = useState(item.resolvedLink ?? "");
  const [isPending, startTransition] = useTransition();
  const [contextOpen, setContextOpen] = useState(false);
  const router = useRouter();

  // Reset inputs when switching items
  useEffect(() => {
    setStatus(item.status as FeedbackStatus);
    setNotes(item.adminNotes ?? "");
    setLink(item.resolvedLink ?? "");
  }, [item.id, item.status, item.adminNotes, item.resolvedLink]);

  function save() {
    startTransition(async () => {
      const result = await updateFeedbackAction({
        id: item.id,
        status,
        adminNotes: notes.trim() || null,
        resolvedLink: link.trim() || null,
      });
      if (result.success) {
        toast.success("Saved.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Update failed");
      }
    });
  }

  function quickStatus(next: FeedbackStatus) {
    setStatus(next);
    startTransition(async () => {
      const result = await updateFeedbackAction({ id: item.id, status: next });
      if (result.success) {
        toast.success(`Moved to ${STATUS_LABELS[next]}.`);
        router.refresh();
      } else {
        toast.error(result.error ?? "Update failed");
      }
    });
  }

  const dirty =
    status !== item.status ||
    (notes.trim() || null) !== (item.adminNotes ?? null) ||
    (link.trim() || null) !== (item.resolvedLink ?? null);

  return (
    <div className="flex h-full flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 space-y-2 border-b bg-background/95 p-4 backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <CategoryBadge category={item.category} />
            <span className="text-[11px] text-muted-foreground">
              {timeAgo(item.createdAt)} ago · {item.userName ?? item.userEmail}
            </span>
            <EnvBadge pageUrl={item.pageUrl} />
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              title="Delete"
            >
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} title="Close">
              <HugeiconsIcon icon={Cancel01Icon} size={16} />
            </Button>
          </div>
        </div>
        <StatusPipeline current={status} onClick={quickStatus} />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {ctx.screenshot && (
          <section>
            <SectionLabel>Screenshot</SectionLabel>
            <ScreenshotWithPin
              base64={ctx.screenshot.base64}
              width={ctx.screenshot.width}
              height={ctx.screenshot.height}
              pin={ctx.pin}
            />
          </section>
        )}

        <section>
          <SectionLabel>Message</SectionLabel>
          <p className="whitespace-pre-wrap text-sm">{item.message}</p>
        </section>

        {item.pageUrl && (
          <section>
            <SectionLabel>Submitted from</SectionLabel>
            <a
              href={item.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-xs text-blue-600 hover:underline"
            >
              {item.pageTitle ? `${item.pageTitle} — ` : ""}
              {item.pageUrl}
            </a>
          </section>
        )}

        {ctx.pin && (
          <section>
            <SectionLabel>Pinned element</SectionLabel>
            <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
              <p className="break-words font-medium">
                {ctx.pin.text || "(no visible text)"}
              </p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                {ctx.pin.selector}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                click @ ({ctx.pin.clickX}, {ctx.pin.clickY})
              </p>
            </div>
          </section>
        )}

        {ctx.voiceTranscript && (
          <section>
            <SectionLabel>Voice transcript</SectionLabel>
            <p className="rounded-md border bg-muted/30 px-2 py-1.5 text-xs italic">
              “{ctx.voiceTranscript}”
            </p>
          </section>
        )}

        <section className="space-y-3">
          <div>
            <Label htmlFor="fb-notes" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Admin notes
            </Label>
            <Textarea
              id="fb-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes..."
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="fb-link" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Resolved link
            </Label>
            <Input
              id="fb-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="PR / commit URL"
              className="mt-1"
            />
          </div>
        </section>

        <section>
          <button
            type="button"
            onClick={() => setContextOpen((v) => !v)}
            className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            Context
            <span className="text-[10px]">{contextOpen ? "▾" : "▸"}</span>
          </button>
          {contextOpen && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-2 py-1.5 text-[11px]">
              {ctx.persona && (
                <>
                  <dt className="text-muted-foreground">Persona</dt>
                  <dd>
                    <span className="font-medium">{ctx.persona.personaLabel}</span>
                    {ctx.persona.isViewingAs && (
                      <span className="ml-1 text-muted-foreground">
                        (viewing as — actor is {ctx.persona.actorPersonaId})
                      </span>
                    )}
                  </dd>
                </>
              )}
              {ctx.activeTab && (
                <>
                  <dt className="text-muted-foreground">Active tab</dt>
                  <dd className="font-mono">{ctx.activeTab}</dd>
                </>
              )}
              {ctx.browser?.viewport && (
                <>
                  <dt className="text-muted-foreground">Viewport</dt>
                  <dd className="font-mono">
                    {ctx.browser.viewport.width}×{ctx.browser.viewport.height}
                  </dd>
                </>
              )}
              {ctx.browser?.userAgent && (
                <>
                  <dt className="text-muted-foreground">UA</dt>
                  <dd className="truncate font-mono text-[10px]">
                    {ctx.browser.userAgent}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">Submitter</dt>
              <dd>
                {item.userName ? `${item.userName} · ` : ""}
                {item.userEmail}
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{new Date(item.createdAt).toLocaleString()}</dd>
            </dl>
          )}
        </section>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background/95 p-3 backdrop-blur">
        {dirty && (
          <span className="mr-auto text-[11px] text-muted-foreground">
            Unsaved changes
          </span>
        )}
        <Button
          size="sm"
          onClick={save}
          disabled={isPending || !dirty}
        >
          {isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

// ── Status pipeline ──

const PIPELINE_ORDER: FeedbackStatus[] = [
  "open",
  "building",
  "testing",
  "staging",
  "production",
];

function StatusPipeline({
  current,
  onClick,
}: {
  current: FeedbackStatus;
  onClick: (next: FeedbackStatus) => void;
}) {
  const currentIdx = PIPELINE_ORDER.indexOf(current);
  const isWontFix = current === "wont_fix";

  return (
    <div className="flex flex-wrap items-center gap-1">
      <div className="inline-flex rounded-md border bg-background p-0.5">
        {PIPELINE_ORDER.map((s, idx) => {
          const isCurrent = s === current;
          const isPast = currentIdx >= 0 && idx < currentIdx && !isWontFix;
          const color = STATUS_COLORS[s];
          return (
            <button
              key={s}
              type="button"
              onClick={() => onClick(s)}
              className="rounded px-2 py-1 text-[10px] font-semibold transition-colors"
              style={{
                background: isCurrent ? color.bg : "transparent",
                color: isCurrent ? color.fg : isPast ? "#64646f" : "#9a9aa5",
              }}
              title={`Move to ${STATUS_LABELS[s]}`}
            >
              {isPast && "✓ "}
              {STATUS_LABELS[s]}
            </button>
          );
        })}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onClick("wont_fix")}
        className="h-7 text-[10px]"
        style={isWontFix ? { color: STATUS_COLORS.wont_fix.fg } : undefined}
      >
        {isWontFix ? "✓ Won’t fix" : "Won’t fix"}
      </Button>
    </div>
  );
}

// ── Stats cards ──

function StatCard({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: number | string;
  subtitle?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-[10px] border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
      {subtitle && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

function PipelineCard({
  byStatus,
  total,
}: {
  byStatus: FeedbackStats["byStatus"];
  total: number;
}) {
  const order: FeedbackStatus[] = [
    "open",
    "building",
    "testing",
    "staging",
    "production",
    "wont_fix",
  ];
  const counts = new Map(byStatus.map((b) => [b.status, b.count]));

  return (
    <div className="rounded-[10px] border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Pipeline
      </p>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
        {order.map((s) => {
          const n = counts.get(s) ?? 0;
          if (n === 0 || total === 0) return null;
          const pct = (n / total) * 100;
          const color = STATUS_COLORS[s];
          return (
            <div
              key={s}
              style={{ width: `${pct}%`, background: color.fg }}
              title={`${STATUS_LABELS[s]}: ${n}`}
            />
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-0.5 text-[9px]">
        {order.map((s) => {
          const n = counts.get(s) ?? 0;
          if (n === 0) return null;
          const color = STATUS_COLORS[s];
          return (
            <div key={s} className="flex items-center gap-1">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: color.fg }}
              />
              <span className="text-muted-foreground">{STATUS_LABELS[s]}</span>
              <span className="font-mono font-semibold">{n}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Empty state ──

function EmptyState({
  hasFilters,
  hasItems,
  onClear,
}: {
  hasFilters: boolean;
  hasItems: boolean;
  onClear: () => void;
}) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
        <p>No matches for the current filters.</p>
        <Button size="sm" variant="ghost" onClick={onClear} className="mt-2">
          Clear filters
        </Button>
      </div>
    );
  }
  if (!hasItems) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">No feedback yet.</p>
        <p className="mt-1 max-w-xs">
          The floating widget is live in the bottom-right of every page. Submit
          your first one to see it here.
        </p>
      </div>
    );
  }
  return null;
}

// ── Screenshot with pin indicator ──

function ScreenshotWithPin({
  base64,
  width,
  height,
  pin,
}: {
  base64: string;
  width?: number;
  height?: number;
  pin?: { clickX: number; clickY: number };
}) {
  const [enlarged, setEnlarged] = useState(false);
  const src = `data:image/jpeg;base64,${base64}`;

  const pinPct =
    pin && width && height
      ? {
          left: `${(pin.clickX / width) * 100}%`,
          top: `${(pin.clickY / height) * 100}%`,
        }
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setEnlarged(true)}
        className="relative block w-full overflow-hidden rounded-md border"
      >
        <Image
          src={src}
          alt="Submitted screenshot"
          width={width ?? 1280}
          height={height ?? 720}
          className="h-auto max-h-56 w-full object-contain"
          unoptimized
        />
        {pinPct && (
          <span
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
            style={{ ...pinPct, background: "#d1453b" }}
          />
        )}
      </button>
      <Dialog open={enlarged} onOpenChange={setEnlarged}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-sm">Screenshot</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Image
              src={src}
              alt="Submitted screenshot"
              width={width ?? 1280}
              height={height ?? 720}
              className="h-auto w-full object-contain"
              unoptimized
            />
            {pinPct && (
              <span
                className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
                style={{ ...pinPct, background: "#d1453b" }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}
