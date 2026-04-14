"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitNpsResponse } from "@/app/actions/nps";

/**
 * 0–10 NPS scale + optional comment textarea + submit. On success we push to
 * /portal/nps/thanks — the parent server page handles the already-responded
 * case, so this component only runs when a fresh submission is expected.
 */
export function NpsSurveyForm({
  responseId,
  labels,
}: {
  responseId: string;
  labels: {
    scaleLowLabel: string;
    scaleHighLabel: string;
    commentLabel: string;
    commentPlaceholder: string;
    submit: string;
    submitting: string;
    errorGeneric: string;
  };
}) {
  const router = useRouter();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function buttonStyle(n: number): string {
    const selected = score === n;
    const tone =
      n <= 6
        ? "text-[#991b1b]"
        : n <= 8
          ? "text-[#92400e]"
          : "text-[#065f46]";
    const bg = selected
      ? "bg-[#263c94] text-white ring-[#263c94]"
      : `bg-white ${tone} ring-[#E8E2D8] hover:ring-[#263c94]`;
    return `flex h-11 w-11 items-center justify-center rounded-lg text-[15px] font-semibold ring-1 transition-colors sm:h-12 sm:w-12 ${bg}`;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (score === null) return;
    setError(null);
    startTransition(async () => {
      const result = await submitNpsResponse(
        responseId,
        score,
        comment.trim() || null,
      );
      if (!result.ok) {
        setError(result.error || labels.errorGeneric);
        return;
      }
      router.push("/portal/nps/thanks");
    });
  }

  return (
    <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
      <div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={score === i}
              aria-label={`${i}`}
              onClick={() => setScore(i)}
              className={buttonStyle(i)}
            >
              {i}
            </button>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-foreground/60">
          <span>{labels.scaleLowLabel}</span>
          <span>{labels.scaleHighLabel}</span>
        </div>
      </div>

      <div>
        <label
          htmlFor="nps-comment"
          className="block text-[13px] font-medium text-foreground"
        >
          {labels.commentLabel}
        </label>
        <textarea
          id="nps-comment"
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={labels.commentPlaceholder}
          maxLength={2000}
          className="mt-1.5 block w-full rounded-lg border border-[#E8E2D8] bg-white px-3 py-2 text-[15px] text-foreground placeholder:text-foreground/40 focus:border-[#263c94] focus:outline-none focus:ring-2 focus:ring-[#263c94]/20"
        />
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-[#991b1b]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={score === null || isPending}
        className="inline-flex items-center justify-center rounded-lg bg-[#263c94] px-5 py-2.5 text-[14px] font-medium text-white hover:bg-[#1e2f78] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
