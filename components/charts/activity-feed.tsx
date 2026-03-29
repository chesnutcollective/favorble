"use client";

import { Badge } from "@/components/ui/badge";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  CheckmarkCircle02Icon,
  PencilEdit01Icon,
  Message01Icon,
  Briefcase01Icon,
  Contact01Icon,
  AssignmentsIcon,
  Task01Icon,
  File01Icon,
} from "@hugeicons/core-free-icons";
import { formatDistanceToNow } from "date-fns";

type AuditEntry = {
  id: string;
  entityType: string;
  action: string;
  createdAt: Date;
};

type ActivityMeta = {
  label: string;
  icon: IconSvgElement;
  badgeClass: string;
  iconColor: string;
};

/** Human-readable labels, icons, and colors for action types */
const ACTION_META: Record<string, ActivityMeta> = {
  create: {
    label: "Created",
    icon: Briefcase01Icon,
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
    iconColor: "rgb(16 185 129)",
  },
  update: {
    label: "Updated",
    icon: PencilEdit01Icon,
    badgeClass: "bg-sky-100 text-sky-700 border-sky-200",
    iconColor: "rgb(14 165 233)",
  },
  delete: {
    label: "Deleted",
    icon: CheckmarkCircle02Icon,
    badgeClass: "bg-red-100 text-red-700 border-red-200",
    iconColor: "rgb(239 68 68)",
  },
  transition: {
    label: "Transitioned",
    icon: AssignmentsIcon,
    badgeClass: "bg-violet-100 text-violet-700 border-violet-200",
    iconColor: "rgb(139 92 246)",
  },
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

/** Icons for entity types */
const ENTITY_ICONS: Record<string, IconSvgElement> = {
  case: Briefcase01Icon,
  task: Task01Icon,
  contact: Contact01Icon,
  document: File01Icon,
  field: PencilEdit01Icon,
  message: Message01Icon,
  assignment: AssignmentsIcon,
  stage: AssignmentsIcon,
  note: PencilEdit01Icon,
};

function getActionMeta(action: string): ActivityMeta {
  return (
    ACTION_META[action] ?? {
      label: action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: Task01Icon,
      badgeClass: "bg-muted text-foreground",
      iconColor: "rgb(107 114 128)",
    }
  );
}

function getEntityLabel(entityType: string): string {
  return (
    ENTITY_LABELS[entityType] ??
    entityType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function getEntityIcon(entityType: string): IconSvgElement {
  return ENTITY_ICONS[entityType] ?? Task01Icon;
}

export function ActivityFeed({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No recent activity
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {entries.map((entry) => {
        const meta = getActionMeta(entry.action);
        const entityIcon = getEntityIcon(entry.entityType);
        const entityLabel = getEntityLabel(entry.entityType);

        return (
          <div
            key={entry.id}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/60 transition-colors"
          >
            <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-muted/60">
              <HugeiconsIcon
                icon={entityIcon}
                size={16}
                color={meta.iconColor}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate">
                <span className="font-medium">{entityLabel}</span>{" "}
                <span className="text-muted-foreground">
                  {meta.label.toLowerCase()}
                </span>
              </p>
            </div>
            <Badge className={`text-[11px] shrink-0 border ${meta.badgeClass}`}>
              {meta.label}
            </Badge>
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              {formatDistanceToNow(entry.createdAt, { addSuffix: true })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
