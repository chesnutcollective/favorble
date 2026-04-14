"use client";

import { Eye } from "lucide-react";

type Props = {
  contactId: string;
};

/**
 * Staff-side "View as client" button — opens the portal in a new tab with
 * ?impersonate=<contactId>. Middleware validates the staff user's role and
 * sets the impersonation cookie scoped to /portal so the client layout
 * renders a read-only preview.
 */
export function ViewAsClientButton({ contactId }: Props) {
  const href = `/portal?impersonate=${encodeURIComponent(contactId)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:border-[#CCC]"
      title="Open the claimant's portal in a new tab"
    >
      <Eye className="size-4" />
      <span>View as client</span>
    </a>
  );
}
