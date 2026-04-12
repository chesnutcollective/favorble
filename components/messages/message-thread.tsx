"use client";

import { useState, useRef, useTransition, useOptimistic, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  draftReplyToMessage,
  approveDraftAndSend,
  editAiDraft,
  rejectAiDraft,
} from "@/app/actions/ai";
import {
  previewOutboundQa,
  type QaPreviewResult,
} from "@/app/actions/qa-preview";

/**
 * CM-1 — Threaded message view.
 *
 * Renders a list of conversation threads (collapsible cards) plus a
 * "Standalone messages" bucket for messages with no threadId. Each
 * thread card shows participants, message count, and the oldest →
 * newest range. Within a thread, messages are rendered chronologically
 * (oldest first) so the conversation flows naturally.
 *
 * The compose box at the top supports "Start new thread" — picking
 * that mode mints a fresh client-side threadId so the next outbound
 * send is tracked as the seed of a new conversation. Existing threads
 * can also be replied to from their own card.
 *
 * Note: the outbound `sendCaseMessage` action does not currently take
 * a threadId argument; the client generates one for display while we
 * wait for the server-side action to plumb it through.
 */

export type SerializedMessage = {
  id: string;
  type: string;
  body: string | null;
  fromAddress: string | null;
  threadId: string | null;
  createdAt: string;
};

export type ThreadSummary = {
  threadId: string;
  messageCount: number;
  participants: string[];
  oldestAt: string;
  newestAt: string;
};

export type ThreadGroup = {
  summary: ThreadSummary;
  messages: SerializedMessage[];
};

type Props = {
  threads: ThreadGroup[];
  standalone: SerializedMessage[];
  caseId: string;
  isConfigured: boolean;
  onSendMessage: (data: {
    caseId: string;
    body: string;
  }) => Promise<SerializedMessage | { id: string; type: string; body: string | null; fromAddress: string | null; createdAt: string }>;
};

type DraftState = {
  draftId: string | null;
  body: string;
  originalBody: string;
  status: "idle" | "generating" | "ready" | "saving" | "error";
  error: string | null;
};

const EMPTY_DRAFT: DraftState = {
  draftId: null,
  body: "",
  originalBody: "",
  status: "idle",
  error: null,
};

function diffChars(a: string, b: string): number {
  if (a === b) return 0;
  return Math.abs(a.length - b.length);
}

function newClientThreadId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatRange(oldestAt: string, newestAt: string): string {
  const o = new Date(oldestAt);
  const n = new Date(newestAt);
  const sameDay = o.toDateString() === n.toDateString();
  if (sameDay) return o.toLocaleDateString();
  return `${o.toLocaleDateString()} → ${n.toLocaleDateString()}`;
}

export function MessageThread({
  threads: initialThreads,
  standalone: initialStandalone,
  caseId,
  isConfigured,
  onSendMessage,
}: Props) {
  const [body, setBody] = useState("");
  const [composeThreadId, setComposeThreadId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Optimistic state — when a new outbound message is sent, we tack it
  // onto either the targeted thread or the standalone bucket so the UI
  // updates without waiting for a refetch.
  type State = { threads: ThreadGroup[]; standalone: SerializedMessage[] };
  const initialState: State = useMemo(
    () => ({ threads: initialThreads, standalone: initialStandalone }),
    [initialThreads, initialStandalone],
  );

  const [optimistic, addOptimistic] = useOptimistic(
    initialState,
    (state: State, newMsg: SerializedMessage): State => {
      // If the message has a threadId that already exists, append to
      // it; otherwise mint a synthetic thread group so the UI shows
      // the new conversation immediately.
      if (newMsg.threadId) {
        const existing = state.threads.find(
          (t) => t.summary.threadId === newMsg.threadId,
        );
        if (existing) {
          const merged = [...existing.messages, newMsg];
          const updated: ThreadGroup = {
            summary: {
              ...existing.summary,
              messageCount: merged.length,
              newestAt: newMsg.createdAt,
              participants: Array.from(
                new Set([
                  ...existing.summary.participants,
                  ...(newMsg.fromAddress ? [newMsg.fromAddress] : []),
                ]),
              ),
            },
            messages: merged,
          };
          return {
            ...state,
            threads: state.threads.map((t) =>
              t.summary.threadId === newMsg.threadId ? updated : t,
            ),
          };
        }
        // New thread bucket
        const fresh: ThreadGroup = {
          summary: {
            threadId: newMsg.threadId,
            messageCount: 1,
            participants: newMsg.fromAddress ? [newMsg.fromAddress] : [],
            oldestAt: newMsg.createdAt,
            newestAt: newMsg.createdAt,
          },
          messages: [newMsg],
        };
        return { ...state, threads: [fresh, ...state.threads] };
      }
      return { ...state, standalone: [newMsg, ...state.standalone] };
    },
  );

  // Track AI drafts per inbound message id
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [draftPending, startDraftTransition] = useTransition();

  // Collapsed state per thread (collapsed = false by default)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // QA-2: Pre-send inline QA preview state
  const [qaPreview, setQaPreview] = useState<QaPreviewResult | null>(null);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaChecking, setQaChecking] = useState(false);
  // Stash the message + threadId so "Send anyway" can dispatch the
  // original send without re-typing.
  const [qaPendingSend, setQaPendingSend] = useState<{
    body: string;
    threadId: string | null;
  } | null>(null);

  function setDraft(messageId: string, update: Partial<DraftState>) {
    setDrafts((prev) => {
      const existing = prev[messageId] ?? EMPTY_DRAFT;
      return {
        ...prev,
        [messageId]: { ...existing, ...update },
      };
    });
  }

  function handleDraftReply(messageId: string) {
    setDraft(messageId, {
      status: "generating",
      error: null,
      draftId: null,
      body: "",
      originalBody: "",
    });
    startDraftTransition(async () => {
      try {
        const result = await draftReplyToMessage(messageId);
        if (result.error || !result.draftId) {
          setDraft(messageId, {
            status: "error",
            error: result.error ?? "Draft generation failed",
          });
          return;
        }
        const draftBody = result.body ?? "";
        setDraft(messageId, {
          draftId: result.draftId,
          status: "ready",
          body: draftBody,
          originalBody: draftBody,
          error: null,
        });
      } catch (err) {
        setDraft(messageId, {
          status: "error",
          error: err instanceof Error ? err.message : "Draft generation failed",
        });
      }
    });
  }

  function handleDraftBodyChange(messageId: string, newBody: string) {
    setDraft(messageId, { body: newBody });
  }

  function handleSaveDraft(messageId: string) {
    const draft = drafts[messageId];
    if (!draft?.draftId) return;
    const draftId = draft.draftId;
    setDraft(messageId, { status: "saving" });
    startDraftTransition(async () => {
      try {
        const res = await editAiDraft(draftId, draft.body);
        if (!res.success) {
          setDraft(messageId, {
            status: "error",
            error: res.error ?? "Save failed",
          });
        } else {
          setDraft(messageId, { status: "ready", error: null });
        }
      } catch (err) {
        setDraft(messageId, {
          status: "error",
          error: err instanceof Error ? err.message : "Save failed",
        });
      }
    });
  }

  function handleApproveDraft(
    messageId: string,
    threadIdHint: string | null,
  ) {
    const draft = drafts[messageId];
    if (!draft?.draftId) return;
    const draftId = draft.draftId;
    const finalBody = draft.body;
    setDraft(messageId, { status: "saving" });
    startDraftTransition(async () => {
      try {
        const res = await approveDraftAndSend(draftId, finalBody);
        if (!res.success) {
          setDraft(messageId, {
            status: "error",
            error: res.error ?? "Send failed",
          });
          return;
        }
        addOptimistic({
          id: res.communicationId ?? `optimistic-${Date.now()}`,
          type: "message_outbound",
          body: finalBody,
          fromAddress: "You",
          threadId: threadIdHint,
          createdAt: new Date().toISOString(),
        });
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[messageId];
          return next;
        });
      } catch (err) {
        setDraft(messageId, {
          status: "error",
          error: err instanceof Error ? err.message : "Send failed",
        });
      }
    });
  }

  function handleRejectDraft(messageId: string) {
    const draft = drafts[messageId];
    if (!draft?.draftId) return;
    const draftId = draft.draftId;
    startDraftTransition(async () => {
      try {
        await rejectAiDraft(draftId);
      } catch {
        // Non-fatal
      }
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    });
  }

  function handleStartNewThread() {
    setComposeThreadId(newClientThreadId());
    textareaRef.current?.focus();
  }

  /**
   * Actually dispatch the message — called after QA passes or the user
   * clicks "Send anyway".
   */
  function dispatchSend(trimmed: string, targetThreadId: string | null) {
    const optimisticMsg: SerializedMessage = {
      id: `optimistic-${Date.now()}`,
      type: "message_outbound",
      body: trimmed,
      fromAddress: "You",
      threadId: targetThreadId,
      createdAt: new Date().toISOString(),
    };

    setBody("");
    setComposeThreadId(null);
    setQaPreview(null);
    setQaError(null);
    setQaPendingSend(null);

    startTransition(async () => {
      addOptimistic(optimisticMsg);
      await onSendMessage({ caseId, body: trimmed });
    });
  }

  /**
   * QA-2: Pre-flight QA check. If it passes, auto-send. If it fails,
   * show the results inline so the user can fix or override.
   */
  function handleSend() {
    const trimmed = body.trim();
    if (!trimmed) return;

    const targetThreadId = composeThreadId;

    // Clear previous preview
    setQaPreview(null);
    setQaError(null);
    setQaChecking(true);
    setQaPendingSend({ body: trimmed, threadId: targetThreadId });

    startTransition(async () => {
      try {
        const res = await previewOutboundQa(caseId, trimmed);
        if (!res.ok) {
          setQaError(res.error);
          setQaChecking(false);
          return;
        }
        setQaChecking(false);
        if (res.result.passed) {
          // Auto-send — QA passed
          dispatchSend(trimmed, targetThreadId);
        } else {
          // Show preview and let the user decide
          setQaPreview(res.result);
        }
      } catch {
        setQaError("QA check failed — you can still send the message");
        setQaChecking(false);
      }
    });
  }

  function handleSendAnyway() {
    if (!qaPendingSend) return;
    dispatchSend(qaPendingSend.body, qaPendingSend.threadId);
  }

  function handleDismissQa() {
    setQaPreview(null);
    setQaError(null);
    setQaPendingSend(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  const hasAny =
    optimistic.threads.length > 0 || optimistic.standalone.length > 0;

  return (
    <div className="space-y-4">
      {/* Compose form */}
      <div className="border border-border rounded-lg p-3 bg-background space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {composeThreadId
              ? "Composing a new thread"
              : "Composing a standalone message"}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleStartNewThread}
            className="h-7 text-xs"
          >
            Start new thread
          </Button>
        </div>
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={3}
          className="border-0 p-0 focus-visible:ring-0 resize-none"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {isConfigured
              ? "Messages will be sent via Case Status"
              : "Messages are recorded locally only"}
          </p>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!body.trim() || isPending || qaChecking}
          >
            {qaChecking ? "Checking..." : isPending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>

      {/* QA-2: Pre-send QA preview results */}
      {qaChecking && (
        <div className="border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 rounded-lg p-3">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Running quality check before sending...
          </p>
        </div>
      )}
      {qaError && !qaChecking && (
        <div className="border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 rounded-lg p-3 space-y-2">
          <p className="text-xs text-amber-700 dark:text-amber-300">{qaError}</p>
          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={handleDismissQa} className="h-7 text-xs">
              Dismiss
            </Button>
            {qaPendingSend && (
              <Button size="sm" variant="outline" onClick={handleSendAnyway} className="h-7 text-xs">
                Send anyway
              </Button>
            )}
          </div>
        </div>
      )}
      {qaPreview && !qaChecking && (
        <div
          className={`border rounded-lg p-3 space-y-2 ${
            qaPreview.passed
              ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
              : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">
              {qaPreview.passed ? "\u2713" : "\u26A0"}
            </span>
            <span className="text-xs font-medium">
              QA Score: {qaPreview.score}/100
              {qaPreview.passed ? " — Passed" : " — Needs review"}
            </span>
          </div>
          {qaPreview.issues.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Issues:</p>
              <ul className="text-xs text-amber-700 dark:text-amber-300 list-disc pl-4 space-y-0.5">
                {qaPreview.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          {qaPreview.suggestions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Suggestions:</p>
              <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                {qaPreview.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={handleDismissQa} className="h-7 text-xs">
              Edit message
            </Button>
            <Button size="sm" variant="outline" onClick={handleSendAnyway} className="h-7 text-xs">
              Send anyway
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasAny && (
        <div
          className="flex flex-col items-center justify-center py-10 text-center"
          style={{ animation: "emptyStateIn 0.3s ease-out" }}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(38,60,148,0.08)]">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[#263c94]"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">
            No messages yet
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Send the first message above
          </p>
        </div>
      )}

      {/* Thread cards */}
      {optimistic.threads.map((group) => {
        const isCollapsed = collapsed[group.summary.threadId] ?? false;
        const chronological = [...group.messages].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() -
            new Date(b.createdAt).getTime(),
        );
        return (
          <div
            key={group.summary.threadId}
            className="border border-border rounded-lg bg-background"
          >
            <button
              type="button"
              onClick={() =>
                setCollapsed((prev) => ({
                  ...prev,
                  [group.summary.threadId]: !isCollapsed,
                }))
              }
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 rounded-t-lg"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    Thread
                  </Badge>
                  <span className="text-xs font-medium text-foreground">
                    {group.summary.messageCount} message
                    {group.summary.messageCount === 1 ? "" : "s"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatRange(
                      group.summary.oldestAt,
                      group.summary.newestAt,
                    )}
                  </span>
                </div>
                {group.summary.participants.length > 0 && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                    {group.summary.participants.join(", ")}
                  </p>
                )}
              </div>
              <span className="ml-2 text-xs text-muted-foreground">
                {isCollapsed ? "▸" : "▾"}
              </span>
            </button>

            {!isCollapsed && (
              <div className="p-3 border-t border-border space-y-3">
                {chronological.map((msg) =>
                  renderMessage({
                    msg,
                    drafts,
                    draftPending,
                    handleDraftReply,
                    handleDraftBodyChange,
                    handleSaveDraft,
                    handleApproveDraft,
                    handleRejectDraft,
                    threadIdHint: group.summary.threadId,
                  }),
                )}
                <div className="pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      setComposeThreadId(group.summary.threadId);
                      textareaRef.current?.focus();
                      textareaRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }}
                  >
                    Reply in thread
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Standalone messages */}
      {optimistic.standalone.length > 0 && (
        <div className="border border-dashed border-border rounded-lg bg-background">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground">
              Standalone messages ({optimistic.standalone.length})
            </span>
          </div>
          <div className="p-3 space-y-3">
            {optimistic.standalone.map((msg) =>
              renderMessage({
                msg,
                drafts,
                draftPending,
                handleDraftReply,
                handleDraftBodyChange,
                handleSaveDraft,
                handleApproveDraft,
                handleRejectDraft,
                threadIdHint: null,
              }),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function renderMessage({
  msg,
  drafts,
  draftPending,
  handleDraftReply,
  handleDraftBodyChange,
  handleSaveDraft,
  handleApproveDraft,
  handleRejectDraft,
  threadIdHint,
}: {
  msg: SerializedMessage;
  drafts: Record<string, DraftState>;
  draftPending: boolean;
  handleDraftReply: (id: string) => void;
  handleDraftBodyChange: (id: string, body: string) => void;
  handleSaveDraft: (id: string) => void;
  handleApproveDraft: (id: string, threadIdHint: string | null) => void;
  handleRejectDraft: (id: string) => void;
  threadIdHint: string | null;
}) {
  const isInbound = msg.type === "message_inbound";
  const isOptimistic = msg.id.startsWith("optimistic-");
  const draft = drafts[msg.id];
  return (
    <div key={msg.id} className="space-y-2">
      <div
        className={`flex ${isInbound ? "justify-start" : "justify-end"}`}
      >
        <div
          className={`max-w-[80%] rounded-lg p-3 ${
            isInbound
              ? "bg-muted text-foreground"
              : "bg-blue-600 text-white"
          } ${isOptimistic ? "opacity-60" : ""}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Badge
              variant="outline"
              className={`text-xs ${
                isInbound
                  ? "border-border text-muted-foreground"
                  : "border-blue-300 text-blue-100"
              }`}
            >
              {isInbound ? "Client" : "Staff"}
            </Badge>
            {msg.fromAddress && (
              <span
                className={`text-xs ${isInbound ? "text-muted-foreground" : "text-blue-200"}`}
              >
                {msg.fromAddress}
              </span>
            )}
          </div>
          {msg.body && (
            <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
          )}
          <p
            className={`mt-1 text-xs ${isInbound ? "text-muted-foreground" : "text-blue-200"}`}
          >
            {isOptimistic
              ? "Sending..."
              : new Date(msg.createdAt).toLocaleString()}
          </p>
          {isInbound && !isOptimistic && !draft && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDraftReply(msg.id)}
                disabled={draftPending}
                className="h-7 text-xs"
              >
                Draft AI reply
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Draft editor for this message */}
      {isInbound && draft && (
        <div className="ml-0 sm:ml-8 border border-border rounded-lg p-3 bg-background space-y-2">
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-xs">
              AI Draft{draft.draftId ? ` · ${draft.status}` : ""}
            </Badge>
            {draft.status === "ready" && draft.body.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {diffChars(draft.originalBody, draft.body)} chars changed
              </span>
            )}
          </div>
          {draft.status === "generating" && (
            <p className="text-xs text-muted-foreground">
              Generating reply from case context...
            </p>
          )}
          {draft.status === "error" && (
            <p className="text-xs text-destructive">
              {draft.error ?? "Failed to generate draft"}
            </p>
          )}
          {(draft.status === "ready" || draft.status === "saving") && (
            <>
              <Textarea
                value={draft.body}
                onChange={(e) =>
                  handleDraftBodyChange(msg.id, e.target.value)
                }
                rows={6}
                placeholder="AI draft will appear here. Edit as needed, then approve to send."
                className="text-sm"
              />
              <div className="flex flex-wrap items-center gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRejectDraft(msg.id)}
                  disabled={draftPending}
                  className="h-7 text-xs"
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSaveDraft(msg.id)}
                  disabled={draftPending || !draft.body.trim()}
                  className="h-7 text-xs"
                >
                  Save edit
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleApproveDraft(msg.id, threadIdHint)}
                  disabled={draftPending || !draft.body.trim()}
                  className="h-7 text-xs"
                >
                  Approve &amp; send
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
