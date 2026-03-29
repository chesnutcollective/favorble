"use client";

import { formatDistanceToNow } from "date-fns";

type AuditEntry = {
  id: string;
  entityType: string;
  action: string;
  createdAt: Date;
};

/** Human-readable labels for action types */
const ACTION_LABELS: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  transition: "Transitioned",
};

/** Human-readable labels for entity types */
const ENTITY_LABELS: Record<string, string> = {
  case: "Case",
  task: "Task",
  contact: "Contact",
  document: "Document",
  field: "Field",
  message: "Message",
  assignment: "Assignment",
  stage: "Stage",
  note: "Note",
  calendar_event: "Calendar Event",
  user: "User",
  workflow: "Workflow",
  template: "Template",
};

function getActionLabel(action: string): string {
  return (
    ACTION_LABELS[action] ??
    action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function getEntityLabel(entityType: string): string {
  return (
    ENTITY_LABELS[entityType] ??
    entityType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function ActivityFeed({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-[#999] py-4 text-center">
        No recent activity
      </p>
    );
  }

  return (
    <div>
      {entries.map((entry) => {
        const actionLabel = getActionLabel(entry.action);
        const entityLabel = getEntityLabel(entry.entityType);

        return (
          <div
            key={entry.id}
            className="flex items-center gap-3 py-2.5 border-b border-[#EAEAEA] last:border-b-0"
          >
            <div className="shrink-0 h-2 w-2 rounded-full bg-black" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate">
                <span className="font-medium">{entityLabel}</span>{" "}
                <span className="text-[#666]">
                  {actionLabel.toLowerCase()}
                </span>
              </p>
            </div>
            <span className="text-xs text-[#999] font-mono shrink-0 tabular-nums">
              {formatDistanceToNow(entry.createdAt, { addSuffix: true })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
