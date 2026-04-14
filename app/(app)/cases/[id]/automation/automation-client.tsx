"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { FlashIcon } from "@hugeicons/core-free-icons";
import { toggleCaseWorkflow } from "@/app/actions/case-automation";
import type { CaseWorkflowTemplate } from "@/app/actions/case-automation";

type AutomationClientProps = {
  caseId: string;
  templates: CaseWorkflowTemplate[];
};

export function CaseAutomationClient({
  caseId,
  templates,
}: AutomationClientProps) {
  const [rows, setRows] = useState<CaseWorkflowTemplate[]>(templates);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleToggle(templateId: string, nextEnabled: boolean) {
    // Optimistic: flip local state, then persist. Restore on error.
    const disabled = !nextEnabled;
    const prev = rows;
    setRows((curr) =>
      curr.map((r) =>
        r.id === templateId
          ? {
              ...r,
              disabledForCase: disabled,
              nextFirePrediction: rebuildPrediction(r, disabled),
            }
          : r,
      ),
    );
    setPendingId(templateId);

    startTransition(async () => {
      try {
        await toggleCaseWorkflow(caseId, templateId, disabled);
        toast.success(
          disabled
            ? "Workflow disabled for this case."
            : "Workflow re-enabled for this case.",
        );
      } catch {
        toast.error("Failed to update workflow override.");
        setRows(prev);
      } finally {
        setPendingId(null);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <HugeiconsIcon
            icon={FlashIcon}
            size={28}
            color="#ccc"
            className="mx-auto"
          />
          <p className="mt-3 text-sm text-muted-foreground">
            No active workflow templates match this case&apos;s current or
            downstream stages.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ask an admin to add stage-triggered workflows under Admin &rarr;
            Workflows.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((t) => {
        const enabled = !t.disabledForCase;
        const isPending = pendingId === t.id;
        return (
          <Card key={t.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <HugeiconsIcon
                    icon={FlashIcon}
                    size={16}
                    color="rgb(245 158 11)"
                    className="mt-0.5 shrink-0"
                  />
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">
                      {t.name}
                    </CardTitle>
                    {t.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {enabled ? "Enabled" : "Disabled"}
                  </span>
                  <Switch
                    checked={enabled}
                    disabled={isPending}
                    onCheckedChange={(next) => handleToggle(t.id, next)}
                    aria-label={
                      enabled
                        ? "Disable workflow for this case"
                        : "Enable workflow for this case"
                    }
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-xs">
                  {t.triggerLabel}
                </Badge>
                {t.triggerStageName && (
                  <Badge variant="outline" className="text-xs">
                    Stage: {t.triggerStageName}
                  </Badge>
                )}
                <span>{t.nextFirePrediction}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function rebuildPrediction(
  row: CaseWorkflowTemplate,
  disabled: boolean,
): string {
  // Strip any existing "(disabled…)" suffix so toggling is idempotent.
  const base = row.nextFirePrediction.replace(
    / \(disabled for this case\)$/,
    "",
  );
  return disabled ? `${base} (disabled for this case)` : base;
}
