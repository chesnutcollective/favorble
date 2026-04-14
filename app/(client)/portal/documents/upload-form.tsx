"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { usePortalImpersonation } from "@/components/portal/portal-impersonation-context";
import { uploadPortalDocument } from "./actions";

type Props = {
  caseId: string | null;
  organizationId: string;
};

/**
 * Minimal client-side upload surface. Mobile-first — we use a native file
 * input styled as a tap target so iOS / Android serve their platform
 * document pickers.
 *
 * Impersonation mode: staff previewing the portal see the form but the
 * submit button is disabled with a "Read-only preview" tooltip.
 */
export function PortalUploadForm({ caseId, organizationId }: Props) {
  const { isImpersonating } = usePortalImpersonation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<
    "idle" | "success" | "error" | "pending"
  >("idle");
  const [isPending, startTransition] = useTransition();

  const disabled = isImpersonating || !caseId || !organizationId;

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0] ?? null;
    setFile(next);
    setStatus("idle");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || disabled || !caseId) return;

    const form = new FormData();
    form.set("file", file);
    form.set("caseId", caseId);
    form.set("organizationId", organizationId);

    setStatus("pending");
    startTransition(async () => {
      const result = await uploadPortalDocument(form);
      if ("success" in result && result.success) {
        setStatus("success");
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        toast.success("Sent to your team");
      } else {
        setStatus("error");
        toast.error(
          "error" in result ? result.error : "Upload failed",
        );
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label
        htmlFor="portal-upload-file"
        className={
          disabled
            ? "flex min-h-[88px] cursor-not-allowed items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#E8E2D8] bg-[#FAFAF7] px-4 text-center text-foreground/40"
            : "flex min-h-[88px] cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#104e60]/30 bg-[#F7FAFB] px-4 text-center text-foreground/80 hover:border-[#104e60]/60"
        }
      >
        <Upload className="size-5" />
        <span className="text-[14px] font-medium">
          {file ? file.name : "Tap to choose a file"}
        </span>
        <input
          ref={inputRef}
          id="portal-upload-file"
          type="file"
          className="sr-only"
          onChange={onPickFile}
          disabled={disabled}
        />
      </label>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-foreground/60">
          {disabled && isImpersonating
            ? "Read-only preview"
            : disabled
              ? "No case linked to your account yet."
              : "PDFs, photos, and Word docs are all fine."}
        </p>
        <button
          type="submit"
          disabled={disabled || !file || isPending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#104e60] px-5 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#0d3f4e]"
        >
          {status === "pending" || isPending ? "Sending…" : "Send"}
        </button>
      </div>

      {status === "success" ? (
        <p className="inline-flex items-center gap-1 text-[13px] text-emerald-700">
          <Check className="size-4" />
          Delivered to your team.
        </p>
      ) : null}
      {status === "error" ? (
        <p className="inline-flex items-center gap-1 text-[13px] text-red-700">
          <AlertCircle className="size-4" />
          Couldn&apos;t send. Please try again.
        </p>
      ) : null}
    </form>
  );
}
