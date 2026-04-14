"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COLORS } from "@/lib/design-tokens";
import {
  fetchMyNotifications,
  fetchMyUnreadCount,
  markAllRead,
  markRead,
  type ClientNotification,
} from "@/app/actions/notifications";

/**
 * Notification bell UI. Renders a bell icon with an unread badge and a
 * dropdown panel listing recent notifications. Polls the unread count
 * every 30 seconds and refetches the full list whenever the panel is
 * opened.
 */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [unread, setUnread] = React.useState<number>(0);
  const [items, setItems] = React.useState<ClientNotification[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Poll unread count every 30s
  React.useEffect(() => {
    let cancelled = false;

    async function refreshCount() {
      try {
        const n = await fetchMyUnreadCount();
        if (!cancelled) setUnread(n);
      } catch {
        // swallow — the bell is best-effort
      }
    }

    refreshCount();
    const interval = setInterval(refreshCount, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Refetch list whenever the dropdown opens
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchMyNotifications(20)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleMarkAllRead() {
    await markAllRead();
    setUnread(0);
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        readAt: item.readAt ?? new Date().toISOString(),
      })),
    );
  }

  async function handleRowClick(item: ClientNotification) {
    if (!item.readAt) {
      await markRead(item.id);
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, readAt: new Date().toISOString() } : it,
        ),
      );
      setUnread((n) => Math.max(0, n - 1));
    }
    if (item.actionHref) {
      setOpen(false);
      router.push(item.actionHref);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-[#52525e] hover:bg-[#EAEAEA] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          <BellIcon />
          {unread > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white"
              style={{ backgroundColor: COLORS.bad, height: 16 }}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[360px] max-h-[480px] overflow-hidden p-0"
      >
        <div className="flex items-center justify-between border-b border-[#EAEAEA] px-3 py-2">
          <span className="text-sm font-semibold text-foreground">
            Notifications
          </span>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={unread === 0}
            className="text-xs font-medium hover:underline disabled:opacity-40 disabled:no-underline"
            style={{
              color: unread > 0 ? COLORS.brand : COLORS.text3,
            }}
          >
            Mark all read
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {loading ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              You&apos;re all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-[#F0F0F0]">
              {items.map((item) => {
                const isUnread = !item.readAt;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleRowClick(item)}
                      className="w-full px-3 py-2.5 text-left transition-colors hover:bg-[#F8F9FC]"
                      style={{
                        backgroundColor: isUnread
                          ? COLORS.brandSubtle
                          : undefined,
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className="line-clamp-1 text-[13px] font-semibold"
                          style={{
                            color: isUnread ? COLORS.text1 : COLORS.text2,
                          }}
                        >
                          {item.title}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {item.sourceEventId && <AiBadge />}
                          <PriorityBadge priority={item.priority} />
                        </span>
                      </div>
                      <p
                        className="mt-0.5 line-clamp-2 text-[12px]"
                        style={{
                          color: isUnread ? COLORS.text2 : COLORS.text3,
                        }}
                      >
                        {item.body}
                      </p>
                      <p
                        className="mt-1 text-[10px]"
                        style={{ color: COLORS.text3 }}
                      >
                        {formatRelative(item.createdAt)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AiBadge() {
  return (
    <span
      title="Generated with AI"
      className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: COLORS.brandSubtle,
        color: COLORS.brand,
      }}
    >
      <span aria-hidden="true">{"\u2699"}</span>
      AI
    </span>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: ClientNotification["priority"];
}) {
  const config: Record<
    ClientNotification["priority"],
    { label: string; bg: string; fg: string }
  > = {
    info: { label: "Info", bg: COLORS.okSubtle, fg: COLORS.ok },
    normal: {
      label: "Normal",
      bg: "rgba(139,139,151,0.12)",
      fg: COLORS.text2,
    },
    high: { label: "High", bg: COLORS.warnSubtle, fg: COLORS.warn },
    urgent: { label: "Urgent", bg: COLORS.badSubtle, fg: COLORS.bad },
  };
  const c = config[priority];
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {c.label}
    </span>
  );
}

function BellIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
