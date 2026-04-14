"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitationAction } from "./actions";

type Props = {
  token: string;
  firstName: string;
  email: string;
  expiresAt: string;
};

/**
 * Minimal accept-invite card. For Wave 1 this confirms the email and calls
 * a server action that stamps the invitation accepted + activates the
 * portal_users row. Wire-up to Clerk sign-up ticketing will be finished in
 * Wave 2 once the custom domain is provisioned — until then staff share
 * the URL directly with the claimant.
 */
export function InviteAcceptCard({
  token,
  firstName,
  email,
  expiresAt,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formEmail, setFormEmail] = useState(email);
  const [error, setError] = useState<string | null>(null);

  const expires = new Date(expiresAt);

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8]">
      <p className="text-[12px] font-medium uppercase tracking-wide text-[#104e60]">
        Your portal invite
      </p>
      <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">
        Welcome, {firstName || "there"}.
      </h1>
      <p className="mt-2 text-[16px] leading-relaxed text-foreground/70">
        Confirm your email below to create your portal account. You&apos;ll
        be able to message your team, upload documents, and keep track of
        your case.
      </p>
      <p className="mt-2 text-[12px] text-foreground/50">
        Link expires {expires.toLocaleDateString()} at{" "}
        {expires.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
        .
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await acceptInvitationAction({
              token,
              email: formEmail,
            });
            if (!result.ok) {
              setError(result.error ?? "Something went wrong.");
              return;
            }
            router.push("/portal");
          });
        }}
      >
        <label className="block">
          <span className="text-[13px] font-medium text-foreground/80">
            Email address
          </span>
          <input
            type="email"
            required
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            className="mt-1 w-full rounded-2xl border border-border bg-white px-4 py-2.5 text-[15px] text-foreground outline-none focus:border-[#104e60] focus:ring-2 focus:ring-[#104e60]/20"
          />
        </label>

        {error ? (
          <p className="rounded-2xl bg-red-50 px-4 py-2 text-[13px] text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending || !formEmail}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#104e60] px-4 py-2.5 text-[15px] font-medium text-white hover:bg-[#0d3f4e] disabled:opacity-60"
        >
          {isPending ? "Creating account…" : "Create portal account"}
        </button>
      </form>
    </div>
  );
}
