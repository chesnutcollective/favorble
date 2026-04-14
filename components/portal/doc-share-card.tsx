"use client";

import { FileText, Download } from "lucide-react";
import { usePortalImpersonation } from "./portal-impersonation-context";

export type DocShareCardItem = {
  shareId: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number | null;
  sharedByName: string | null;
  sharedAt: string;
  expiresAt: string | null;
  canDownload: boolean;
  isMetadataOnly: boolean;
};

/**
 * Mobile-first card for a single shared document. Tap-friendly download row —
 * the whole action surface is a real anchor so mobile Safari / Chrome handle
 * the file download with the browser's native save sheet.
 *
 * Impersonation mode: staff previewing the portal see the card but the
 * Download anchor becomes a disabled button with a "Read-only preview"
 * tooltip so we never accidentally stream PHI to a staff user via the
 * portal download route.
 */
export function DocShareCard({ item }: { item: DocShareCardItem }) {
  const { isImpersonating } = usePortalImpersonation();
  const href = `/api/portal/documents/${encodeURIComponent(item.shareId)}/download`;
  const sizeLabel = item.fileSizeBytes
    ? formatFileSize(item.fileSizeBytes)
    : null;
  const sharedByLabel = item.sharedByName
    ? `Shared by ${item.sharedByName}`
    : "Shared by your team";
  const relative = formatRelative(item.sharedAt);

  const disabled = isImpersonating || !item.canDownload || item.isMetadataOnly;

  return (
    <article className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[#E8E2D8] sm:p-5">
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#104e60]/10 text-[#104e60] sm:size-11">
          <FileText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold text-foreground sm:text-[16px]">
            {item.fileName}
          </h3>
          <p className="mt-1 text-[13px] text-foreground/70 sm:text-[14px]">
            {sharedByLabel}
            <span className="text-foreground/40"> · </span>
            <span title={new Date(item.sharedAt).toLocaleString()}>
              {relative}
            </span>
            {sizeLabel ? (
              <>
                <span className="text-foreground/40"> · </span>
                <span>{sizeLabel}</span>
              </>
            ) : null}
          </p>
          {item.expiresAt ? (
            <p className="mt-1 text-[12px] text-foreground/60">
              Available until{" "}
              {new Date(item.expiresAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          ) : null}
          {item.isMetadataOnly ? (
            <p className="mt-1 text-[12px] text-foreground/60">
              Ask your team for a copy of this file.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        {disabled ? (
          <button
            type="button"
            disabled
            title={
              isImpersonating
                ? "Read-only preview"
                : item.isMetadataOnly
                  ? "This file isn't downloadable"
                  : "Download not permitted"
            }
            className="inline-flex h-11 min-w-[120px] items-center justify-center gap-2 rounded-full border border-[#E8E2D8] bg-white px-4 text-[14px] font-medium text-foreground/40"
          >
            <Download className="size-4" />
            Download
          </button>
        ) : (
          <a
            href={href}
            // Let the browser drive the download via the native save sheet.
            // The route handler streams the file with a Content-Disposition
            // attachment header and writes the document_share_views row.
            className="inline-flex h-11 min-w-[120px] items-center justify-center gap-2 rounded-full bg-[#104e60] px-4 text-[14px] font-semibold text-white hover:bg-[#0d3f4e]"
          >
            <Download className="size-4" />
            Download
          </a>
        )}
      </div>
    </article>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatRelative(isoString: string): string {
  const then = new Date(isoString).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diff < minute) return "just now";
  if (diff < hour) {
    const m = Math.floor(diff / minute);
    return `${m} min${m === 1 ? "" : "s"} ago`;
  }
  if (diff < day) {
    const h = Math.floor(diff / hour);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (diff < week) {
    const d = Math.floor(diff / day);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }
  return new Date(isoString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
