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
  create: "created",
  update: "updated",
  delete: "deleted",
  transition: "transitioned",
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

/** Dot color based on action type */
function getDotColor(action: string): string {
  switch (action) {
    case "create":
      return "bg-[#0070F3]"; // blue — new items
    case "update":
    case "transition":
      return "bg-[#1d72b8]"; // green — completions/transitions
    case "delete":
      return "bg-[#F5A623]"; // amber — warnings
    default:
      return "bg-[#EAEAEA]"; // gray default
  }
}

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
      <p className="text-[13px] text-[#999] py-4 text-center">
        No recent activity
      </p>
    );
  }

  return (
    <ul className="list-none">
      {entries.map((entry) => {
        const actionLabel = getActionLabel(entry.action);
        const entityLabel = getEntityLabel(entry.entityType);

        return (
          <li
            key={entry.id}
            className="flex gap-3 py-3 border-b border-[#EAEAEA] last:border-b-0 text-[13px]"
          >
            <div
              className={`w-2 h-2 rounded-full shrink-0 mt-[5px] ${getDotColor(entry.action)}`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[#666]">
                <strong className="font-medium text-[#171717]">
                  {entityLabel}
                </strong>{" "}
                {actionLabel}
              </p>
              <p className="text-[11px] font-mono text-[#999] mt-0.5">
                {formatDistanceToNow(entry.createdAt, { addSuffix: true })}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
