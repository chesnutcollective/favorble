"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  resendPortalInvite,
  sendPortalInvite,
} from "@/app/actions/portal-invites";

type Status = "never" | "invited" | "active" | "suspended";

/**
 * Inline "Invite / Resend" control for the firm-side contact detail page.
 * Rendered next to the Edit button on `/contacts/[id]`.
 *
 * Copy + action choice are driven by the claimant's current portal status:
 *   - never      → "Invite to portal"          → sendPortalInvite
 *   - invited    → "Resend invite"             → resendPortalInvite
 *   - active     → hidden (renders null)
 *   - suspended  → "Reactivate invite"         → resendPortalInvite
 */
export function PortalInviteRowButton({
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

  if (status === "active") return null;

  const label =
    status === "invited"
      ? "Resend invite"
      : status === "suspended"
        ? "Reactivate invite"
        : "Invite to portal";

  function handleClick() {
    startTransition(async () => {
      const action =
        status === "never" ? sendPortalInvite : resendPortalInvite;
      const result = await action(contactId);
      if (result.ok) {
        toast.success(
          status === "never" ? "Portal invite sent" : "Portal invite resent",
        );
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to send invite");
      }
    });
  }

  const paddingCls =
    size === "sm" ? "h-7 px-3 text-[12px]" : "h-9 px-4 text-[13px]";

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={pending}
      className={paddingCls}
    >
      {pending ? "Sending…" : label}
    </Button>
  );
}
