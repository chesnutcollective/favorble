"use client";

import { useState, useRef, useTransition, useOptimistic } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  draftReplyToMessage,
  approveDraftAndSend,
  editAiDraft,
  rejectAiDraft,
} from "@/app/actions/ai";

type Message = {
  id: string;
  type: string;
  body: string | null;
  fromAddress: string | null;
  createdAt: string;
};

type Props = {
  messages: Message[];
  caseId: string;
  isConfigured: boolean;
  onSendMessage: (data: { caseId: string; body: string }) => Promise<Message>;
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

export function MessageThread({
  messages: initialMessages,
  caseId,
  isConfigured,
  onSendMessage,
}: Props) {
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    initialMessages,
    (state: Message[], newMsg: Message) => [newMsg, ...state],
  );

  // Track AI drafts per inbound message id
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [draftPending, startDraftTransition] = useTransition();

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

  function handleApproveDraft(messageId: string) {
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
        addOptimisticMessage({
          id: res.communicationId ?? `optimistic-${Date.now()}`,
          type: "message_outbound",
          body: finalBody,
          fromAddress: "You",
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

  function handleSend() {
    const trimmed = body.trim();
    if (!trimmed) return;

    const optimisticMsg: Message = {
      id: `optimistic-${Date.now()}`,
      type: "message_outbound",
      body: trimmed,
      fromAddress: "You",
      createdAt: new Date().toISOString(),
    };

    setBody("");

    startTransition(async () => {
      addOptimisticMessage(optimisticMsg);
      await onSendMessage({ caseId, body: trimmed });
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="space-y-4">
      {/* Message list */}
      {optimisticMessages.length === 0 ? (
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
            Send the first message below
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {optimisticMessages.map((msg) => {
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
                          {diffChars(draft.originalBody, draft.body)} chars
                          changed
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
                    {(draft.status === "ready" ||
                      draft.status === "saving") && (
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
                            onClick={() => handleApproveDraft(msg.id)}
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
          })}
        </div>
      )}

      {/* Compose form */}
      <div className="border border-border rounded-lg p-3 bg-background">
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={3}
          className="border-0 p-0 focus-visible:ring-0 resize-none"
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-muted-foreground">
            {isConfigured
              ? "Messages will be sent via Case Status"
              : "Messages are recorded locally only"}
          </p>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!body.trim() || isPending}
          >
            {isPending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
