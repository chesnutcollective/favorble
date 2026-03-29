"use client";

import { useState, useRef, useTransition, useOptimistic } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(59,89,152,0.08)]">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[#3b5998]"
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
            return (
              <div
                key={msg.id}
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
                </div>
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
