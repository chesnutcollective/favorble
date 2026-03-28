"use client";

import { cn } from "@/lib/utils";

export type TimelineEvent = {
  id: string;
  type: string;
  title: string;
  description?: string;
  timestamp: string;
  actor?: string;
  metadata?: Record<string, unknown>;
};

type TimelineProps = {
  events: TimelineEvent[];
  className?: string;
};

const EVENT_COLORS: Record<string, string> = {
  stage_changed: "bg-blue-500",
  task_created: "bg-green-500",
  task_completed: "bg-emerald-500",
  document_uploaded: "bg-purple-500",
  document_deleted: "bg-red-400",
  note_added: "bg-amber-500",
  message_received: "bg-indigo-500",
  message_sent: "bg-indigo-400",
  assignment_changed: "bg-accent0",
  case_created: "bg-blue-600",
  workflow_executed: "bg-green-600",
};

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

/**
 * Renders basic markdown: **bold**, _italic_, and - bullet lists.
 * Outputs plain React elements, no dependencies.
 */
function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];
  let key = 0;

  function flushBullets() {
    if (bulletBuffer.length === 0) return;
    elements.push(
      <ul key={key++} className="list-disc pl-4 space-y-0.5">
        {bulletBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    bulletBuffer = [];
  }

  function renderInline(line: string): React.ReactNode {
    // Process bold (**text**) and italic (_text_) inline
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let partKey = 0;

    while (remaining.length > 0) {
      // Check for bold: **...**
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      // Check for italic: _..._
      const italicMatch = remaining.match(/(?<!\w)_(.+?)_(?!\w)/);

      // Find earliest match
      let earliest: { type: "bold" | "italic"; index: number; match: RegExpMatchArray } | null = null;

      if (boldMatch?.index !== undefined) {
        earliest = { type: "bold", index: boldMatch.index, match: boldMatch };
      }
      if (italicMatch?.index !== undefined) {
        if (!earliest || italicMatch.index < earliest.index) {
          earliest = { type: "italic", index: italicMatch.index, match: italicMatch };
        }
      }

      if (!earliest) {
        parts.push(remaining);
        break;
      }

      // Add text before the match
      if (earliest.index > 0) {
        parts.push(remaining.slice(0, earliest.index));
      }

      if (earliest.type === "bold") {
        parts.push(
          <strong key={partKey++} className="font-semibold text-foreground">
            {earliest.match[1]}
          </strong>,
        );
      } else {
        parts.push(<em key={partKey++}>{earliest.match[1]}</em>);
      }

      remaining = remaining.slice(earliest.index + earliest.match[0].length);
    }

    return parts.length === 1 ? parts[0] : <>{parts}</>;
  }

  for (const line of lines) {
    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    if (bulletMatch) {
      bulletBuffer.push(bulletMatch[1]);
    } else {
      flushBullets();
      if (line.trim() === "") {
        elements.push(<br key={key++} />);
      } else {
        elements.push(<p key={key++}>{renderInline(line)}</p>);
      }
    }
  }
  flushBullets();

  return <>{elements}</>;
}

export function Timeline({ events, className }: TimelineProps) {
  if (events.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No activity yet
      </div>
    );
  }

  return (
    <div className={cn("space-y-0", className)}>
      {events.map((event, index) => {
        const dotColor = EVENT_COLORS[event.type] ?? "bg-gray-400";
        const isLast = index === events.length - 1;

        return (
          <div key={event.id} className="relative flex gap-3 pb-4">
            {/* Vertical line */}
            {!isLast && (
              <div className="absolute left-[7px] top-4 h-full w-px bg-muted" />
            )}

            {/* Dot */}
            <div
              className={cn(
                "relative z-10 mt-1 h-4 w-4 shrink-0 rounded-full border-2 border-white",
                dotColor,
              )}
            />

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                  {event.title}
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeTime(event.timestamp)}
                </span>
              </div>
              {event.description && (
                <div className="mt-0.5 text-sm text-muted-foreground">
                  <MarkdownText text={event.description} />
                </div>
              )}
              {event.actor && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  by {event.actor}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
