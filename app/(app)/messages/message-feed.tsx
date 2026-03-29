"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";

type Message = {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  fromAddress: string | null;
  sourceSystem: string | null;
  createdAt: string;
  caseId: string | null;
  caseNumber: string | null;
};

const TYPE_CONFIG: Record<string, { label: string }> = {
  message_inbound: { label: "Inbound Message" },
  message_outbound: { label: "Outbound Message" },
  email_inbound: { label: "Inbound Email" },
  email_outbound: { label: "Outbound Email" },
  phone_inbound: { label: "Inbound Call" },
  phone_outbound: { label: "Outbound Call" },
  note: { label: "Note" },
};

function formatMessageType(type: string): { label: string } {
  if (TYPE_CONFIG[type]) return TYPE_CONFIG[type];
  const label = type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return { label };
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDate.getTime() === today.getTime()) return "Today";
  if (msgDate.getTime() === yesterday.getTime()) return "Yesterday";

  // If within the last 7 days, show the day name
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (msgDate.getTime() > weekAgo.getTime()) {
    return date.toLocaleDateString("en-US", { weekday: "long" });
  }

  // If same year, show "March 27"
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
  }

  // Otherwise show full date
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const PAGE_SIZE = 20;

export function MessageFeed({ messages }: { messages: Message[] }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visibleMessages = messages.slice(0, visibleCount);
  const hasMore = visibleCount < messages.length;

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { label: string; messages: Message[] }[] = [];
    let currentGroup: string | null = null;

    for (const msg of visibleMessages) {
      const group = getDateGroup(msg.createdAt);
      if (group !== currentGroup) {
        groups.push({ label: group, messages: [msg] });
        currentGroup = group;
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    }
    return groups;
  }, [visibleMessages]);

  return (
    <div className="space-y-1">
      {groupedMessages.map((group) => (
        <div key={group.label}>
          {/* Date separator */}
          <div className="sticky top-0 z-10 flex items-center gap-3 py-3">
            <div className="h-px flex-1 bg-[#eaeaea]" />
            <span className="shrink-0 font-mono text-xs text-[#999]">
              {group.label}
            </span>
            <div className="h-px flex-1 bg-[#eaeaea]" />
          </div>

          <div className="space-y-2">
            {group.messages.map((msg) => {
              const typeInfo = formatMessageType(msg.type);
              return (
                <Card
                  key={msg.id}
                  className="border-[#eaeaea] transition-colors duration-200 hover:border-[#999]"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full bg-[#999]" />
                          <Badge
                            variant="outline"
                            className="border-[#eaeaea] text-[#666]"
                          >
                            {typeInfo.label}
                          </Badge>
                          {msg.caseId && msg.caseNumber && (
                            <Link
                              href={`/cases/${msg.caseId}/messages`}
                              className="text-sm font-medium text-[#171717] hover:underline"
                            >
                              Case #{msg.caseNumber}
                            </Link>
                          )}
                        </div>
                        {msg.subject && (
                          <p className="mt-1 text-sm font-medium text-[#171717]">
                            {msg.subject}
                          </p>
                        )}
                        {msg.body && (
                          <p className="mt-0.5 text-sm text-[#666] line-clamp-2">
                            {msg.body}
                          </p>
                        )}
                        {msg.fromAddress && (
                          <p className="mt-1 text-xs text-[#666]">
                            From: {msg.fromAddress}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-[#666]">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {hasMore && (
        <div className="flex justify-center pt-4 pb-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            className="gap-2"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
            Load more ({messages.length - visibleCount} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}
