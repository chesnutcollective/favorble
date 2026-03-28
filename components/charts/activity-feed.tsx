"use client";

import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

type AuditEntry = {
  id: string;
  entityType: string;
  action: string;
  createdAt: Date;
};

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
  transition: "bg-purple-100 text-purple-700",
};

export function ActivityFeed({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No recent activity
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center gap-3 rounded-md p-2 hover:bg-accent"
        >
          <Badge
            className={`text-xs shrink-0 ${ACTION_COLORS[entry.action] ?? "bg-muted text-foreground"}`}
          >
            {entry.action}
          </Badge>
          <span className="text-sm text-foreground flex-1 truncate">
            {entry.entityType}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatDistanceToNow(entry.createdAt, { addSuffix: true })}
          </span>
        </div>
      ))}
    </div>
  );
}
