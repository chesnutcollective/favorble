"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { usePortalImpersonation } from "@/components/portal/portal-impersonation-context";
import { usePortalT } from "@/components/portal/use-portal-t";
import { uploadPortalDocument } from "./actions";

type Props = {
  caseId: string | null;
  organizationId: string;
};

const DOCUMENT_CATEGORIES: ReadonlyArray<{
  value: string;
  tKey: string;
  fallback: string;
}> = [
  {
    value: "medical_record",
    tKey: "portal.documents.category.medicalRecord",
    fallback: "Medical record",
  },
  {
    value: "identification",
    tKey: "portal.documents.category.identification",
    fallback: "Identification / ID",
  },
  {
    value: "work_history",
    tKey: "portal.documents.category.workHistory",
    fallback: "Work history / employment",
  },
  {
    value: "ssa_letter",
    tKey: "portal.documents.category.ssaLetter",
    fallback: "Letter from SSA",
  },
  {
    value: "symptoms_photo",
    tKey: "portal.documents.category.symptomsPhoto",
    fallback: "Photo of symptoms/injury",
  },
  {
    value: "other",
    tKey: "portal.documents.category.other",
    fallback: "Other",
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
 * Minimal client-side upload surface. Mobile-first — we use a native file
 * input styled as a tap target so iOS / Android serve their platform
 * document pickers.
 *
 * Impersonation mode: staff previewing the portal see the form but the
 * submit button is disabled with a "Read-only preview" tooltip.
 *
 * Category taxonomy: the claimant classifies the doc before sending so the
 * firm-side triage queue can filter on `documents.category`. We keep
 * "client_upload" in the `tags` array so existing firm-side filters that
 * look for portal uploads still match.
 */
export function PortalUploadForm({ caseId, organizationId }: Props) {
  const { isImpersonating } = usePortalImpersonation();
  const { t } = usePortalT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>("");
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
    if (!file || disabled || !caseId || !category) return;

    const form = new FormData();
    form.set("file", file);
    form.set("caseId", caseId);
    form.set("organizationId", organizationId);
    form.set("category", category);

    setStatus("pending");
    startTransition(async () => {
      const result = await uploadPortalDocument(form);
      if ("success" in result && result.success) {
        setStatus("success");
        setFile(null);
        setCategory("");
        if (inputRef.current) inputRef.current.value = "";
        toast.success(
          tOrFallback(t, "portal.documents.upload.success", "Sent to your team"),
        );
      } else {
        setStatus("error");
        toast.error(
          "error" in result
            ? result.error
            : tOrFallback(t, "portal.documents.upload.error", "Upload failed"),
        );
      }
    });
  }

  const sendDisabled = disabled || !file || !category || isPending;

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
        <Upload className="size-5" aria-hidden="true" />
        <span className="text-[14px] font-medium">
          {file
            ? file.name
            : tOrFallback(
                t,
                "portal.documents.upload.chooseFile",
                "Tap to choose a file",
              )}
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

      <div className="space-y-1.5">
        <label
          htmlFor="portal-upload-category"
          className="block text-[13px] font-medium text-foreground/80"
        >
          {tOrFallback(
            t,
            "portal.documents.category.label",
            "What kind of document is this?",
          )}
          <span className="ml-1 text-red-600" aria-hidden="true">
            *
          </span>
        </label>
        <select
          id="portal-upload-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={disabled || isPending}
          required
          aria-required="true"
          className="w-full rounded-xl border border-[#E8E2D8] bg-white px-3 py-2.5 text-[14px] text-foreground focus:border-[#104e60]/40 focus:outline-none focus:ring-2 focus:ring-[#104e60]/15 disabled:opacity-50"
        >
          <option value="" disabled>
            {tOrFallback(
              t,
              "portal.documents.category.placeholder",
              "Choose a category…",
            )}
          </option>
          {DOCUMENT_CATEGORIES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {tOrFallback(t, opt.tKey, opt.fallback)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-foreground/60">
          {disabled && isImpersonating
            ? tOrFallback(
                t,
                "portal.documents.upload.readOnly",
                "Read-only preview",
              )
            : disabled
              ? tOrFallback(
                  t,
                  "portal.documents.upload.noCase",
                  "No case linked to your account yet.",
                )
              : tOrFallback(
                  t,
                  "portal.documents.upload.fileTypeHint",
                  "PDFs, photos, and Word docs are accepted.",
                )}
        </p>
        <button
          type="submit"
          disabled={sendDisabled}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#104e60] px-5 text-[14px] font-semibold text-white hover:bg-[#0d3f4e] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === "pending" || isPending
            ? tOrFallback(t, "portal.common.sending", "Sending…")
            : tOrFallback(t, "portal.documents.upload.send", "Send")}
        </button>
      </div>

      {status === "success" ? (
        <p className="inline-flex items-center gap-1 text-[13px] text-emerald-700">
          <Check className="size-4" aria-hidden="true" />
          {tOrFallback(
            t,
            "portal.documents.upload.delivered",
            "Delivered to your team.",
          )}
        </p>
      ) : null}
      {status === "error" ? (
        <p className="inline-flex items-center gap-1 text-[13px] text-red-700">
          <AlertCircle className="size-4" aria-hidden="true" />
          {tOrFallback(
            t,
            "portal.documents.upload.retry",
            "Couldn't send. Please try again.",
          )}
        </p>
      ) : null}
    </form>
  );
}
