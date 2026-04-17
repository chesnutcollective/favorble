"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { COLORS } from "@/lib/design-tokens";
import {
  getMessages,
  sendMessage,
  markChannelRead,
} from "@/app/actions/team-chat";
import { HugeiconsIcon } from "@hugeicons/react";
import { BubbleChatIcon, Mail01Icon } from "@hugeicons/core-free-icons";
import type { ChatMessage } from "./team-chat-client";

/**
 * A single-channel team-chat panel, scoped to one channel id.
 *
 * Used by the per-case team-chat tab where there is always exactly one
 * channel (the case-scoped channel auto-created by
 * `getOrCreateCaseChannel`). Shares server actions (`getMessages`,
 * `sendMessage`, `markChannelRead`) with the global team-chat UI.
 */

type CaseChatPanelProps = {
  channelId: string;
  channelName: string;
  channelDescription: string | null;
  initialMessages: ChatMessage[];
  currentUserId: string;
  currentUserFirstName: string;
  currentUserLastName: string;
};

function initialsFor(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  const a = first ? first[0] : "";
  const b = last ? last[0] : "";
  return `${a}${b}`.toUpperCase() || "?";
}

function formatTime(value: Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function CaseChatPanel({
  channelId,
  channelName,
  channelDescription,
  initialMessages,
  currentUserId,
  currentUserFirstName,
  currentUserLastName,
}: CaseChatPanelProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [isSending, startSendTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mark this channel as read on mount
  useEffect(() => {
    void markChannelRead(channelId);
  }, [channelId]);

  const refresh = useCallback(async () => {
    try {
      const fresh = await getMessages(channelId);
      setMessages(fresh as ChatMessage[]);
    } catch {
      // Silent — the optimistic message is already on screen.
    }
  }, [channelId]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;

    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      content,
      parentMessageId: null,
      mentionedUserIds: null,
      reactions: null,
      editedAt: null,
      createdAt: new Date(),
      userId: currentUserId,
      userFirstName: currentUserFirstName,
      userLastName: currentUserLastName,
      userAvatarUrl: null,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    startSendTransition(async () => {
      try {
        await sendMessage(channelId, content);
        await refresh();
        router.refresh();
      } catch {
        toast.error("Failed to send message.");
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div
      className="flex flex-col rounded-[10px] border border-[#EAEAEA] overflow-hidden bg-white"
      style={{ height: "calc(100vh - 320px)", minHeight: "480px" }}
    >
      {/* Channel header */}
      <header className="border-b border-[#EAEAEA] px-4 py-3 shrink-0">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <HugeiconsIcon
            icon={BubbleChatIcon}
            size={16}
            color={COLORS.brand}
            aria-hidden="true"
          />
          {channelName}
        </h2>
        {channelDescription && (
          <p className="text-[11px] text-[#666] mt-0.5">{channelDescription}</p>
        )}
      </header>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ backgroundColor: "#FFFFFF" }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <HugeiconsIcon icon={BubbleChatIcon} size={24} color="#ccc" aria-hidden="true" />
            <p className="text-xs text-[#999] mt-2">
              No messages in this case channel yet. Start the conversation!
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isSelf = m.userId === currentUserId;
            const authorName =
              [m.userFirstName, m.userLastName]
                .filter(Boolean)
                .join(" ")
                .trim() || "Unknown";
            const initials = initialsFor(m.userFirstName, m.userLastName);
            return (
              <div key={m.id} className="flex items-start gap-3">
                <div
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white"
                  style={{
                    backgroundColor: isSelf ? COLORS.brand : COLORS.text2,
                  }}
                >
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p
                      className="text-xs font-semibold"
                      style={{ color: isSelf ? COLORS.brand : COLORS.text1 }}
                    >
                      {isSelf ? `${authorName} (you)` : authorName}
                    </p>
                    <p className="text-[10px] text-[#999]">
                      {formatTime(m.createdAt)}
                    </p>
                  </div>
                  <p className="text-xs text-[#333] mt-0.5 leading-relaxed whitespace-pre-wrap break-words">
                    {m.content}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Compose input */}
      <div
        className="border-t border-[#EAEAEA] p-3 pr-20 sm:pr-24 shrink-0"
        style={{ backgroundColor: COLORS.surface }}
      >
        <form onSubmit={handleSend}>
          <Card className="p-0">
            <CardContent className="flex items-center gap-2 p-2">
              <input
                ref={inputRef}
                type="text"
                placeholder={`Message ${channelName}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSending}
                className="flex-1 bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-[#999] disabled:opacity-60"
              />
              <Button
                type="submit"
                size="sm"
                disabled={isSending || !draft.trim()}
                style={{ backgroundColor: COLORS.brand }}
              >
                <HugeiconsIcon icon={Mail01Icon} size={14} aria-hidden="true" />
                {isSending ? "Sending..." : "Send"}
              </Button>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
