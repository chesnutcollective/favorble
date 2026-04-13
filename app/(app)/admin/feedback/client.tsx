"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
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

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status as FeedbackStatus] ?? STATUS_COLORS.open;
  const label = STATUS_LABELS[status as FeedbackStatus] ?? status;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function FeedbackAdminClient({
  items,
  stats,
}: {
  items: Item[];
  stats: FeedbackStats;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Item | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkPending, startBulk] = useTransition();
  const [exportPending, startExport] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (categoryFilter !== "all" && i.category !== categoryFilter)
        return false;
      if (!q) return true;
      return (
        i.message.toLowerCase().includes(q) ||
        i.userEmail.toLowerCase().includes(q) ||
        (i.userName?.toLowerCase().includes(q) ?? false) ||
        (i.pageUrl?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, search, statusFilter, categoryFilter]);

  const trendPct =
    stats.lastWeek === 0
      ? stats.thisWeek > 0
        ? 100
        : 0
      : Math.round(((stats.thisWeek - stats.lastWeek) / stats.lastWeek) * 100);

  const allFilteredChecked =
    filtered.length > 0 && filtered.every((i) => checkedIds.has(i.id));

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

  function handleBulkStatus(status: FeedbackStatus) {
    const ids = Array.from(checkedIds);
    if (ids.length === 0) return;
    startBulk(async () => {
      const result = await bulkUpdateFeedbackAction({ ids, status });
      if (result.success) {
        toast.success(
          `Marked ${result.updated ?? ids.length} item(s) as ${STATUS_LABELS[status]}.`,
        );
        clearChecked();
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
        clearChecked();
      } else {
        toast.error(result.error ?? "Delete failed");
      }
    });
  }

  function handleExportForClaude() {
    startExport(async () => {
      const result = await buildClaudeExportAction({
        includeStatuses: ["open"],
      });
      if (!result.success || !result.prompt) {
        toast.error(result.error ?? "Export failed");
        return;
      }
      try {
        await navigator.clipboard.writeText(result.prompt);
        toast.success(
          `Copied prompt for ${result.itemCount ?? 0} open item(s) to clipboard.`,
        );
      } catch {
        toast.error("Could not copy to clipboard — see console.");
        // eslint-disable-next-line no-console
        console.log(result.prompt);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="Feedback"
          description="Super-admin-submitted feedback — triage bugs, feature requests, and UX issues."
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportForClaude}
          disabled={exportPending}
        >
          {exportPending ? "Building..." : "Export for Claude"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={stats.total} />
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
        <StatCard
          label="Top category"
          value={stats.byCategory[0]?.count ?? 0}
          subtitle={
            stats.byCategory[0]
              ? CATEGORY_LABELS[stats.byCategory[0].category]
              : "—"
          }
        />
      </div>

      {/* Filters */}
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
        <span className="text-[12px] text-muted-foreground">
          {filtered.length} of {items.length}
        </span>
      </div>

      {/* Bulk action bar — only when something is checked */}
      {checkedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-xs font-medium">
            {checkedIds.size} selected
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkPending}
            onClick={() => handleBulkStatus("building")}
          >
            Mark Building
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkPending}
            onClick={() => handleBulkStatus("staging")}
          >
            Mark Staging
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkPending}
            onClick={() => handleBulkStatus("production")}
          >
            Mark Production
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkPending}
            onClick={() => handleBulkStatus("wont_fix")}
          >
            Won&apos;t fix
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
          <Button
            size="sm"
            variant="ghost"
            onClick={clearChecked}
            className="ml-auto text-xs"
          >
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allFilteredChecked}
                  onChange={toggleAllFiltered}
                  aria-label="Select all visible"
                />
              </th>
              <th className="px-3 py-2">Submitted</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Message</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No feedback{search || statusFilter !== "all" || categoryFilter !== "all" ? " matching filters" : " yet"}.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer border-t hover:bg-muted/30"
                  onClick={() => setSelected(item)}
                >
                  <td
                    className="px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={checkedIds.has(item.id)}
                      onChange={() => toggleOne(item.id)}
                      aria-label={`Select feedback from ${item.userEmail}`}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {timeAgo(item.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="font-medium">
                      {item.userName ?? item.userEmail.split("@")[0]}
                    </div>
                    <div className="text-muted-foreground">{item.userEmail}</div>
                  </td>
                  <td className="px-3 py-2">
                    <CategoryBadge category={item.category} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="line-clamp-2 max-w-md">{item.message}</div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <FeedbackDetailDialog
          item={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: number | string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-[10px] border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {subtitle && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

function FeedbackDetailDialog({
  item,
  onClose,
}: {
  item: Item;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<FeedbackStatus>(
    item.status as FeedbackStatus,
  );
  const [notes, setNotes] = useState(item.adminNotes ?? "");
  const [link, setLink] = useState(item.resolvedLink ?? "");
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateFeedbackAction({
        id: item.id,
        status,
        adminNotes: notes.trim() || null,
        resolvedLink: link.trim() || null,
      });
      if (result.success) {
        toast.success("Feedback updated.");
        onClose();
      } else {
        toast.error(result.error ?? "Update failed");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CategoryBadge category={item.category} />
            <span className="text-sm font-normal text-muted-foreground">
              {timeAgo(item.createdAt)} ·{" "}
              {item.userName ?? item.userEmail}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Message
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{item.message}</p>
          </div>

          {item.pageUrl && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Submitted from
              </p>
              <a
                href={item.pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block truncate text-xs text-blue-600 hover:underline"
              >
                {item.pageTitle ? `${item.pageTitle} — ` : ""}
                {item.pageUrl}
              </a>
            </div>
          )}

          <ContextBlocks context={item.context} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="fb-status">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as FeedbackStatus)}
              >
                <SelectTrigger id="fb-status" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="fb-link">Resolved link</Label>
              <Input
                id="fb-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="PR / commit URL"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="fb-notes">Admin notes</Label>
            <Textarea
              id="fb-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes..."
              className="mt-1"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={isPending}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Context blocks ──

type ContextShape = {
  screenshot?: { base64: string; width?: number; height?: number };
  voiceTranscript?: string;
  pin?: { selector: string; text: string; clickX: number; clickY: number };
  browser?: { userAgent?: string; viewport?: { width: number; height: number } };
  persona?: {
    actorPersonaId: string;
    effectivePersonaId: string;
    isViewingAs: boolean;
    personaLabel: string;
  };
  activeTab?: string;
};

function ContextBlocks({ context }: { context: unknown }) {
  const ctx = (context && typeof context === "object"
    ? (context as ContextShape)
    : {}) as ContextShape;

  const hasAny =
    ctx.screenshot ||
    ctx.voiceTranscript ||
    ctx.pin ||
    ctx.persona ||
    ctx.browser ||
    ctx.activeTab;
  if (!hasAny) return null;

  return (
    <div className="space-y-4">
      {ctx.screenshot && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Screenshot
          </p>
          <ScreenshotWithPin
            base64={ctx.screenshot.base64}
            width={ctx.screenshot.width}
            height={ctx.screenshot.height}
            pin={ctx.pin}
          />
        </div>
      )}

      {ctx.voiceTranscript && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Voice transcript
          </p>
          <p className="rounded-md border bg-muted/30 px-2 py-1.5 text-xs italic">
            “{ctx.voiceTranscript}”
          </p>
        </div>
      )}

      {ctx.pin && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pinned element
          </p>
          <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
            <p className="font-medium">{ctx.pin.text || "(no visible text)"}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
              {ctx.pin.selector}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              click @ ({ctx.pin.clickX}, {ctx.pin.clickY})
            </p>
          </div>
        </div>
      )}

      {(ctx.persona || ctx.browser || ctx.activeTab) && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Session
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-2 py-1.5 text-[11px]">
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
          </dl>
        </div>
      )}
    </div>
  );
}

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

  // Click marker is positioned as percent of intrinsic dims so it scales with
  // the displayed image regardless of CSS sizing.
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
          className="h-auto max-h-48 w-full object-contain"
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
