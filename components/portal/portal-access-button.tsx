"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  revokePortalAccess,
  restorePortalAccess,
} from "@/app/actions/portal-invites";

type Status = "never" | "invited" | "active" | "suspended";

/**
 * Phase 6 — pause / unpause control for a claimant's portal access.
 * Rendered on the contact detail page next to the Edit + Invite buttons.
 *
 * Only visible when the contact has an existing portal account (status
 * 'invited', 'active', or 'suspended' — not 'never').
 *
 * Behaviour:
 *   - invited / active   → "Pause portal access" → revokePortalAccess
 *   - suspended          → "Resume portal access" → restorePortalAccess
 *
 * Pausing prompts for an optional reason via a lightweight in-component
 * textarea popover. The reason is persisted on portal_users.suspended_reason
 * so staff can see why access was paused later without cross-referencing
 * audit logs.
 */
export function PortalAccessButton({
  contactId,
  status,
  size = "md",
}: {
  contactId: string;
  status: Status;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showPausePrompt, setShowPausePrompt] = useState(false);
  const [reason, setReason] = useState("");

  if (status === "never") return null;

  const paddingCls =
    size === "sm" ? "h-7 px-3 text-[12px]" : "h-9 px-4 text-[13px]";

  if (status === "suspended") {
    function handleResume() {
      startTransition(async () => {
        const result = await restorePortalAccess(contactId);
        if (result.ok) {
          toast.success("Portal access resumed");
          router.refresh();
        } else {
          toast.error(result.error ?? "Failed to resume portal access");
        }
      });
    }
    return (
      <Button
        type="button"
        variant="outline"
        onClick={handleResume}
        disabled={pending}
        className={paddingCls}
      >
        {pending ? "Resuming…" : "Resume portal access"}
      </Button>
    );
  }

  // status is 'invited' or 'active' — show pause flow.
  function handleSubmitPause() {
    startTransition(async () => {
      const result = await revokePortalAccess(
        contactId,
        reason.trim() || undefined,
      );
      if (result.ok) {
        toast.success("Portal access paused");
        setShowPausePrompt(false);
        setReason("");
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to pause portal access");
      }
    });
  }

  if (!showPausePrompt) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setShowPausePrompt(true)}
        disabled={pending}
        className={paddingCls}
      >
        Pause portal access
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-white p-3 shadow-sm">
      <label
        htmlFor={`pause-reason-${contactId}`}
        className="text-[12px] font-medium text-foreground/80"
      >
        Why are you pausing portal access?{" "}
        <span className="text-foreground/50">(optional)</span>
      </label>
      <textarea
        id={`pause-reason-${contactId}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        className="w-64 rounded-md border border-border px-2 py-1 text-[13px] focus:border-[#1d72b8] focus:outline-none focus:ring-1 focus:ring-[#1d72b8]"
        placeholder="e.g. awaiting fee agreement review"
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleSubmitPause}
          disabled={pending}
          className="h-8 px-3 text-[12px]"
        >
          {pending ? "Pausing…" : "Confirm pause"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setShowPausePrompt(false);
            setReason("");
          }}
          disabled={pending}
          className="h-8 px-3 text-[12px]"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
