"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { MessageSquare, Send } from "lucide-react";
import { usePortalImpersonation } from "@/components/portal/portal-impersonation-context";
import type { PortalMessageRow } from "@/app/actions/portal-messages";

type SendAction = (input: {
  body: string;
  caseId?: string | null;
}) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;

type Props = {
  firmName: string;
  claimantName: string;
  messages: PortalMessageRow[];
  cases: Array<{ id: string; caseNumber: string }>;
  selectedCaseId: string | null;
  sendAction: SendAction;
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const sameDay = new Date().toDateString() === d.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const thisYear = new Date().getFullYear();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === thisYear
      ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
      : {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        };
  return d.toLocaleString([], opts);
}

/**
 * Groups messages into day buckets so the UI can show a lightweight date
 * separator between them (mirrors how iMessage / WhatsApp do it).
 */
function bucketByDay(
  messages: PortalMessageRow[],
): Array<{ dayLabel: string; items: PortalMessageRow[] }> {
  const buckets: Record<string, PortalMessageRow[]> = {};
  const order: string[] = [];
  for (const m of messages) {
    const key = new Date(m.createdAt).toDateString();
    if (!buckets[key]) {
      buckets[key] = [];
      order.push(key);
    }
    buckets[key].push(m);
  }
  return order.map((key) => ({
    dayLabel: new Date(key).toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
    items: buckets[key],
  }));
}

export function PortalThreadView({
  firmName,
  claimantName,
  messages,
  cases,
  selectedCaseId,
  sendAction,
}: Props) {
  const { isImpersonating } = usePortalImpersonation();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [optimistic, addOptimistic] = useOptimistic<
    PortalMessageRow[],
    PortalMessageRow
  >(messages, (state, next) => [...state, next]);

  const grouped = useMemo(() => bucketByDay(optimistic), [optimistic]);

  const submit = useCallback(() => {
    const trimmed = body.trim();
    if (!trimmed || isImpersonating) return;
    setError(null);
    const optimisticMsg: PortalMessageRow = {
      id: `optimistic-${Date.now()}`,
      direction: "inbound",
      body: trimmed,
      fromAddress: claimantName,
      createdAt: new Date().toISOString(),
      readAt: null,
      sentByPortalUserId: null,
      caseId: selectedCaseId,
    };
    setBody("");
    startTransition(async () => {
      addOptimistic(optimisticMsg);
      const res = await sendAction({
        body: trimmed,
        caseId: selectedCaseId,
      });
      if (!res.ok) {
        setError(res.error);
        // restore the draft so the claimant doesn't lose their text
        setBody(trimmed);
      } else {
        router.refresh();
      }
    });
  }, [
    addOptimistic,
    body,
    claimantName,
    isImpersonating,
    router,
    selectedCaseId,
    sendAction,
  ]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  const composerDisabled = isImpersonating || isPending;

  return (
    <div className="flex min-h-[calc(100dvh-140px)] flex-col gap-4 lg:min-h-[calc(100dvh-180px)]">
      {/* Header */}
      <header className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#104e60]/10 text-[#104e60]">
              <MessageSquare className="size-5" />
            </span>
            <div>
              <h1 className="text-[20px] font-semibold tracking-tight text-foreground sm:text-[22px]">
                {firmName}
              </h1>
              <p className="mt-0.5 text-[14px] text-foreground/60">
                Usually replies within 1 business day
              </p>
            </div>
          </div>

          {cases.length > 1 ? (
            <CasePicker cases={cases} selectedCaseId={selectedCaseId} />
          ) : null}
        </div>
      </header>

      {/* Thread */}
      <div className="flex-1 space-y-6 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8] sm:p-6">
        {optimistic.length === 0 ? (
          <EmptyState firmName={firmName} />
        ) : (
          grouped.map((bucket) => (
            <section key={bucket.dayLabel} className="space-y-3">
              <div className="flex items-center justify-center">
                <span className="rounded-full bg-[#F2EEE5] px-3 py-0.5 text-[11px] font-medium uppercase tracking-wide text-foreground/60">
                  {bucket.dayLabel}
                </span>
              </div>
              {bucket.items.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
            </section>
          ))
        )}
      </div>

      {/* Composer — sticky on mobile */}
      <div
        className="sticky bottom-0 z-30 -mx-4 border-t border-[#E8E2D8] bg-white/95 px-4 pt-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      >
        {error ? (
          <p className="mb-2 text-[13px] text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {isImpersonating ? (
          <div className="rounded-2xl border border-[#E8E2D8] bg-[#F7F5F2] p-3 text-[14px] text-foreground/70">
            You&apos;re previewing this client&apos;s portal. Messaging is
            disabled while impersonating.
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex items-end gap-2 rounded-2xl border border-[#E8E2D8] bg-white p-2 shadow-[0_1px_2px_rgba(16,24,40,0.04)] focus-within:border-[#104e60]/40 focus-within:ring-2 focus-within:ring-[#104e60]/15"
          >
            <label htmlFor="portal-message-body" className="sr-only">
              Message your legal team
            </label>
            <textarea
              id="portal-message-body"
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write a message to your team..."
              rows={1}
              disabled={composerDisabled}
              className="min-h-[44px] max-h-[160px] flex-1 resize-none bg-transparent px-2 py-2 text-[17px] leading-snug text-foreground placeholder:text-foreground/40 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={composerDisabled || !body.trim()}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#104e60] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send message"
            >
              <Send className="size-4" />
            </button>
          </form>
        )}
        <p className="mt-2 text-[12px] text-foreground/50">
          Tip: press <kbd className="font-mono text-[11px]">⌘ + Enter</kbd> to
          send.
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: PortalMessageRow }) {
  const fromClient = msg.direction === "inbound";
  const isOptimistic = msg.id.startsWith("optimistic-");
  return (
    <div className={`flex ${fromClient ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-[17px] leading-relaxed sm:max-w-[75%] ${
          fromClient
            ? "bg-[#104e60] text-white"
            : "bg-[#F2EEE5] text-foreground"
        } ${isOptimistic ? "opacity-70" : ""}`}
      >
        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        <p
          className={`mt-1.5 text-[11px] ${
            fromClient ? "text-white/70" : "text-foreground/50"
          }`}
        >
          {isOptimistic ? "Sending..." : formatTimestamp(msg.createdAt)}
        </p>
      </div>
    </div>
  );
}

function EmptyState({ firmName }: { firmName: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-[#104e60]/10 text-[#104e60]">
        <MessageSquare className="size-6" />
      </span>
      <h2 className="mt-3 text-[17px] font-semibold text-foreground">
        Start the conversation
      </h2>
      <p className="mt-1 max-w-md text-[15px] leading-relaxed text-foreground/60">
        Send {firmName} a message below. We&apos;ll reply during business
        hours, and you&apos;ll see every update from your team right here.
      </p>
    </div>
  );
}

function CasePicker({
  cases,
  selectedCaseId,
}: {
  cases: Array<{ id: string; caseNumber: string }>;
  selectedCaseId: string | null;
}) {
  return (
    <nav
      aria-label="Choose a case"
      className="flex flex-wrap items-center gap-1 rounded-full bg-[#F2EEE5] p-1"
    >
      {cases.map((c) => {
        const active = c.id === selectedCaseId;
        return (
          <Link
            key={c.id}
            href={`/portal/messages?caseId=${encodeURIComponent(c.id)}`}
            className={`rounded-full px-3 py-1 text-[12px] font-medium ${
              active
                ? "bg-white text-foreground shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            <span className="font-mono">{c.caseNumber}</span>
          </Link>
        );
      })}
    </nav>
  );
}
