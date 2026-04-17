"use client";

import { Phone } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { usePortalImpersonation } from "@/components/portal/portal-impersonation-context";
import { usePortalT } from "@/components/portal/use-portal-t";
import type {
  CallbackTimeWindow,
  requestCallback as RequestCallbackAction,
} from "@/app/actions/portal-appointments";

type Props = {
  requestAction: typeof RequestCallbackAction;
};

const MAX_REASON_LENGTH = 500;

const WINDOW_OPTIONS: ReadonlyArray<{
  value: CallbackTimeWindow;
  tKey: string;
  fallback: string;
}> = [
  {
    value: "morning",
    tKey: "portal.appointments.callback.window.morning",
    fallback: "Morning (before noon)",
  },
  {
    value: "afternoon",
    tKey: "portal.appointments.callback.window.afternoon",
    fallback: "Afternoon (noon–5pm)",
  },
  {
    value: "evening",
    tKey: "portal.appointments.callback.window.evening",
    fallback: "Evening (after 5pm)",
  },
  {
    value: "no_preference",
    tKey: "portal.appointments.callback.window.noPreference",
    fallback: "No preference",
  },
];

function tOrFallback(
  t: ReturnType<typeof usePortalT>["t"],
  key: string,
  fallback: string,
): string {
  const value = t(key);
  // getTranslation returns the key itself when missing — detect that and fall back.
  return value === key ? fallback : value;
}

/**
 * "Request a call" entry point on the empty appointments view. Opens a
 * dialog where the claimant picks a preferred time window + describes what
 * they want to discuss. Submits via the portal-messages pipeline so the firm
 * sees it in their inbound message queue.
 */
export function RequestCallbackButton({ requestAction }: Props) {
  const { isImpersonating } = usePortalImpersonation();
  const { t } = usePortalT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={isImpersonating}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#104e60] px-5 py-2.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Phone className="size-4" />
        {tOrFallback(
          t,
          "portal.appointments.callback.cta",
          "Request a call from your team",
        )}
      </button>
      {open ? (
        <CallbackDialog
          onClose={() => setOpen(false)}
          requestAction={requestAction}
        />
      ) : null}
    </>
  );
}

function CallbackDialog({
  onClose,
  requestAction,
}: {
  onClose: () => void;
  requestAction: typeof RequestCallbackAction;
}) {
  const { isImpersonating } = usePortalImpersonation();
  const { t } = usePortalT();
  const [window, setWindow] = useState<CallbackTimeWindow>("no_preference");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isImpersonating) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setError(
        tOrFallback(
          t,
          "portal.appointments.callback.reasonRequired",
          "Please tell us what you'd like to discuss.",
        ),
      );
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await requestAction({ window, reason: trimmed });
      if (!res.ok) {
        setError(res.error);
      } else {
        toast.success(
          tOrFallback(
            t,
            "portal.appointments.callback.success",
            "Callback request sent. Your team will reach out.",
          ),
        );
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="callback-title"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={tOrFallback(t, "portal.common.closeDialog", "Close dialog")}
        className="fixed inset-0 bg-black/60"
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ring-[#E8E2D8]">
        <h2
          id="callback-title"
          className="text-[18px] font-semibold text-foreground"
        >
          {tOrFallback(
            t,
            "portal.appointments.callback.title",
            "Request a callback",
          )}
        </h2>
        <p className="mt-1 text-[14px] text-foreground/70">
          {tOrFallback(
            t,
            "portal.appointments.callback.subtitle",
            "Pick a time window that works for you and tell us what you'd like to discuss. Your team will follow up.",
          )}
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-[14px] font-medium text-foreground/80">
              {tOrFallback(
                t,
                "portal.appointments.callback.windowLabel",
                "Preferred time window",
              )}
            </legend>
            <div className="space-y-2">
              {WINDOW_OPTIONS.map((opt) => {
                const checked = window === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-[15px] ${
                      checked
                        ? "border-[#104e60]/60 bg-[#104e60]/5 text-foreground"
                        : "border-[#E8E2D8] bg-white text-foreground/80 hover:border-[#CCC]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="callback-window"
                      value={opt.value}
                      checked={checked}
                      onChange={() => setWindow(opt.value)}
                      disabled={isImpersonating || isPending}
                      className="size-4 accent-[#104e60]"
                    />
                    <span>{tOrFallback(t, opt.tKey, opt.fallback)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <label
              htmlFor="callback-reason"
              className="block text-[14px] font-medium text-foreground/80"
            >
              {tOrFallback(
                t,
                "portal.appointments.callback.reasonLabel",
                "What would you like to discuss?",
              )}
            </label>
            <textarea
              id="callback-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON_LENGTH))}
              rows={4}
              maxLength={MAX_REASON_LENGTH}
              disabled={isImpersonating || isPending}
              placeholder={tOrFallback(
                t,
                "portal.appointments.callback.reasonPlaceholder",
                "A quick note helps your team prepare before they call.",
              )}
              className="w-full rounded-2xl border border-[#E8E2D8] bg-white p-3 text-[15px] leading-relaxed text-foreground focus:border-[#104e60]/40 focus:outline-none focus:ring-2 focus:ring-[#104e60]/15 disabled:opacity-50"
            />
            <p className="text-right text-[12px] text-foreground/50">
              {reason.length}/{MAX_REASON_LENGTH}
            </p>
          </div>

          {error ? (
            <p className="text-[13px] text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#E8E2D8] bg-white px-4 py-2 text-[14px] font-medium text-foreground/80 hover:border-[#CCC]"
            >
              {tOrFallback(t, "portal.common.cancel", "Cancel")}
            </button>
            <button
              type="submit"
              disabled={isImpersonating || isPending || !reason.trim()}
              className="rounded-full bg-[#104e60] px-4 py-2 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending
                ? tOrFallback(t, "portal.common.sending", "Sending…")
                : tOrFallback(
                    t,
                    "portal.appointments.callback.submit",
                    "Send request",
                  )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
