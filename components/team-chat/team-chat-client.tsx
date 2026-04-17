"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { COLORS } from "@/lib/design-tokens";
import {
  getMessages,
  sendMessage,
  markChannelRead,
} from "@/app/actions/team-chat";
import { HugeiconsIcon } from "@hugeicons/react";
import { BubbleChatIcon, Mail01Icon } from "@hugeicons/core-free-icons";

export type ChatChannel = {
  id: string;
  name: string;
  description: string | null;
  channelType: string;
  caseId: string | null;
  isPrivate: boolean;
  createdAt: Date;
  lastMessageContent: string | null;
  lastMessageAt: Date | null;
  lastMessageAuthor: string | null;
  unreadCount: number;
};

export type ChatMessage = {
  id: string;
  content: string;
  parentMessageId: string | null;
  mentionedUserIds: string[] | null;
  reactions: unknown;
  editedAt: Date | null;
  createdAt: Date;
  userId: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  userAvatarUrl: string | null;
};

type TeamChatClientProps = {
  channels: ChatChannel[];
  initialMessages: ChatMessage[];
  initialChannelId: string;
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
  const combined = `${a}${b}`.toUpperCase();
  return combined || "?";
}

function formatTime(value: Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatRelativeDate(value: Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

export function TeamChatClient({
  channels,
  initialMessages,
  initialChannelId,
  currentUserId,
  currentUserFirstName,
  currentUserLastName,
}: TeamChatClientProps) {
  const router = useRouter();
  const [activeChannelId, setActiveChannelId] =
    useState<string>(initialChannelId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [channelUnreads, setChannelUnreads] = useState<Record<string, number>>(
    () => {
      const map: Record<string, number> = {};
      for (const c of channels) {
        map[c.id] = c.unreadCount;
      }
      return map;
    },
  );
  const [draft, setDraft] = useState("");
  const [isSending, startSendTransition] = useTransition();
  const [isLoadingChannel, startLoadTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const activeChannel =
    channels.find((c) => c.id === activeChannelId) ?? channels[0];

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when channel changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeChannelId]);

  const teamChannels = channels.filter((c) => c.channelType !== "case");
  const caseChannels = channels.filter((c) => c.channelType === "case");

  const handleSelectChannel = useCallback(
    (channelId: string) => {
      if (channelId === activeChannelId) return;
      setActiveChannelId(channelId);
      startLoadTransition(async () => {
        try {
          const rows = await getMessages(channelId);
          setMessages(rows as ChatMessage[]);
          // Mark as read and clear unread count locally
          await markChannelRead(channelId);
          setChannelUnreads((prev) => ({ ...prev, [channelId]: 0 }));
        } catch {
          toast.error("Failed to load messages.");
        }
      });
    },
    [activeChannelId],
  );

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !activeChannel) return;

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
        await sendMessage(activeChannel.id, content);
        const fresh = await getMessages(activeChannel.id);
        setMessages(fresh as ChatMessage[]);
        router.refresh();
      } catch {
        toast.error("Failed to send message.");
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      }
    });
  }

  // Handle Enter key to send
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
    }
  }

  if (!activeChannel) {
    return null;
  }

  return (
    <div
      className="grid gap-0 rounded-[10px] border border-[#EAEAEA] overflow-hidden bg-white"
      style={{ height: "calc(100vh - 200px)", minHeight: "520px" }}
    >
      <div className="grid grid-cols-[280px_1fr] h-full">
        {/* ------------------------------------------------------------------ */}
        {/* Channel sidebar                                                     */}
        {/* ------------------------------------------------------------------ */}
        <aside
          className="border-r border-[#EAEAEA] flex flex-col h-full overflow-hidden"
          style={{ backgroundColor: COLORS.surface }}
        >
          <ScrollArea className="flex-1">
            <div className="p-3">
              {/* Team channels */}
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#666] mb-2 px-2">
                Channels
              </p>
              <ul className="space-y-0.5">
                {teamChannels.map((c) => {
                  const isActive = c.id === activeChannelId;
                  const unread = channelUnreads[c.id] ?? 0;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectChannel(c.id)}
                        className="w-full text-left rounded-md px-2 py-2 transition-colors group"
                        style={{
                          backgroundColor: isActive
                            ? COLORS.brandMuted
                            : "transparent",
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="text-xs truncate"
                            style={{
                              color: isActive ? COLORS.brand : "#333",
                              fontWeight: isActive || unread > 0 ? 600 : 400,
                            }}
                          >
                            # {c.name}
                          </span>
                          {unread > 0 && (
                            <Badge
                              className="h-4 min-w-[16px] px-1 text-[10px] font-semibold shrink-0"
                              style={{
                                backgroundColor: COLORS.brand,
                                color: "#fff",
                                border: "none",
                              }}
                            >
                              {unread}
                            </Badge>
                          )}
                        </div>
                        {c.lastMessageContent && (
                          <p className="text-[10px] text-[#999] mt-0.5 truncate leading-tight">
                            {c.lastMessageAuthor
                              ? `${c.lastMessageAuthor}: `
                              : ""}
                            {truncate(c.lastMessageContent, 40)}
                          </p>
                        )}
                      </button>
                    </li>
                  );
                })}
                {teamChannels.length === 0 && (
                  <li className="px-2 py-1 text-[11px] text-[#999]">
                    No channels
                  </li>
                )}
              </ul>

              {/* Case channels */}
              {caseChannels.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#666] mb-2 mt-4 px-2">
                    Case Channels
                  </p>
                  <ul className="space-y-0.5">
                    {caseChannels.map((c) => {
                      const isActive = c.id === activeChannelId;
                      const unread = channelUnreads[c.id] ?? 0;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectChannel(c.id)}
                            className="w-full text-left rounded-md px-2 py-2 transition-colors"
                            style={{
                              backgroundColor: isActive
                                ? COLORS.brandMuted
                                : "transparent",
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className="text-xs truncate"
                                style={{
                                  color: isActive ? COLORS.brand : "#333",
                                  fontWeight:
                                    isActive || unread > 0 ? 600 : 400,
                                }}
                              >
                                {c.name}
                              </span>
                              {unread > 0 && (
                                <Badge
                                  className="h-4 min-w-[16px] px-1 text-[10px] font-semibold shrink-0"
                                  style={{
                                    backgroundColor: COLORS.brand,
                                    color: "#fff",
                                    border: "none",
                                  }}
                                >
                                  {unread}
                                </Badge>
                              )}
                            </div>
                            {c.lastMessageContent && (
                              <p className="text-[10px] text-[#999] mt-0.5 truncate leading-tight">
                                {c.lastMessageAuthor
                                  ? `${c.lastMessageAuthor}: `
                                  : ""}
                                {truncate(c.lastMessageContent, 40)}
                              </p>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* ------------------------------------------------------------------ */}
        {/* Active channel: header + messages + compose                         */}
        {/* ------------------------------------------------------------------ */}
        <section className="flex flex-col h-full overflow-hidden">
          {/* Channel header */}
          <header className="border-b border-[#EAEAEA] px-4 py-3 shrink-0">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <HugeiconsIcon
                icon={BubbleChatIcon}
                size={16}
                color={COLORS.brand}
                aria-hidden="true"
              />
              {activeChannel.channelType === "case" ? "" : "# "}
              {activeChannel.name}
            </h2>
            {activeChannel.description && (
              <p className="text-[11px] text-[#666] mt-0.5">
                {activeChannel.description}
              </p>
            )}
          </header>

          {/* Message list */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
            style={{ backgroundColor: "#FFFFFF" }}
          >
            {isLoadingChannel && messages.length === 0 && (
              <p className="text-xs text-[#999]">Loading messages...</p>
            )}
            {!isLoadingChannel && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <HugeiconsIcon icon={BubbleChatIcon} size={24} color="#ccc" aria-hidden="true" />
                <p className="text-xs text-[#999] mt-2">
                  No messages yet. Say hi!
                </p>
              </div>
            )}
            {messages.map((m) => {
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
                        style={{
                          color: isSelf ? COLORS.brand : COLORS.text1,
                        }}
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
            })}
          </div>

          {/* Compose input — extra right padding keeps the Send button
              clear of the fixed feedback FAB in the bottom-right corner. */}
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
                    placeholder={`Message ${
                      activeChannel.channelType === "case" ? "" : "#"
                    }${activeChannel.name}`}
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
        </section>
      </div>
    </div>
  );
}
