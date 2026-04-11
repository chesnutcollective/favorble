"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  generateCoachingDraft,
  generateCoachingScript,
  resolveCoachingFlag,
  dismissCoachingFlag,
} from "@/app/actions/coaching";

type Props = {
  flagId: string;
  status: "open" | "in_progress" | "resolved" | "dismissed";
  hasConversationDraft: boolean;
  hasCallScript: boolean;
};

export function FlagActionsClient({
  flagId,
  status,
  hasConversationDraft,
  hasCallScript,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const canAct = status === "open" || status === "in_progress";

  const onGenerateDraft = () =>
    startTransition(async () => {
      const result = await generateCoachingDraft(flagId);
      setMessage(
        result.success
          ? "Conversation draft queued — refresh in a few seconds."
          : result.error ?? "Failed to queue draft",
      );
      setTimeout(() => router.refresh(), 1500);
    });

  const onGenerateScript = () =>
    startTransition(async () => {
      const result = await generateCoachingScript(flagId);
      setMessage(
        result.success
          ? "Call script queued — refresh in a few seconds."
          : result.error ?? "Failed to queue script",
      );
      setTimeout(() => router.refresh(), 1500);
    });

  const onResolve = () =>
    startTransition(async () => {
      const notes = window.prompt("Resolution notes (optional):") ?? undefined;
      await resolveCoachingFlag(flagId, notes);
      setMessage("Flag resolved.");
      router.refresh();
    });

  const onDismiss = () =>
    startTransition(async () => {
      const reason = window.prompt("Dismissal reason:");
      if (!reason) return;
      await dismissCoachingFlag(flagId, reason);
      setMessage("Flag dismissed.");
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="default"
        size="sm"
        onClick={onGenerateDraft}
        disabled={isPending || !canAct}
      >
        {hasConversationDraft
          ? "Regenerate conversation draft"
          : "Generate conversation draft"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onGenerateScript}
        disabled={isPending || !canAct}
      >
        {hasCallScript ? "Regenerate call script" : "Generate call script"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onResolve}
        disabled={isPending || !canAct}
      >
        Resolve
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onDismiss}
        disabled={isPending || !canAct}
      >
        Dismiss
      </Button>
      {message && (
        <span className="text-[12px] text-[#666]">{message}</span>
      )}
    </div>
  );
}
