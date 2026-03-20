"use client";

import { useState } from "react";
import { X, Download, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPreviewable, getFileIconType } from "@/lib/storage/client";
import { cn } from "@/lib/utils";

type DocumentPreviewProps = {
  fileName: string;
  fileType: string;
  signedUrl: string;
  onClose: () => void;
};

export function DocumentPreview({
  fileName,
  fileType,
  signedUrl,
  onClose,
}: DocumentPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const canPreview = isPreviewable(fileType);
  const iconType = getFileIconType(fileType);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h3 className="truncate text-sm font-medium text-foreground">
            {fileName}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <a href={signedUrl} download={fileName}>
              <Download className="h-4 w-4" />
            </a>
          </Button>
          {canPreview && (
            <Button variant="ghost" size="sm" asChild>
              <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Preview content */}
      <div className="flex-1 overflow-auto bg-muted p-4">
        {canPreview ? (
          <>
            {fileType === "application/pdf" && (
              <iframe
                src={signedUrl}
                className={cn(
                  "h-full w-full rounded border border-border bg-white",
                  isLoading && "hidden",
                )}
                title={fileName}
                onLoad={() => setIsLoading(false)}
              />
            )}
            {fileType.startsWith("image/") && (
              <img
                src={signedUrl}
                alt={fileName}
                className={cn(
                  "mx-auto max-h-full max-w-full rounded border border-border bg-white object-contain",
                  isLoading && "hidden",
                )}
                onLoad={() => setIsLoading(false)}
              />
            )}
            {fileType === "text/plain" && (
              <iframe
                src={signedUrl}
                className={cn(
                  "h-full w-full rounded border border-border bg-white font-mono text-sm",
                  isLoading && "hidden",
                )}
                title={fileName}
                onLoad={() => setIsLoading(false)}
              />
            )}
            {isLoading && (
              <div className="flex h-full items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-blue-600" />
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <FileIcon type={iconType} />
            <p className="mt-4 text-sm font-medium">{fileName}</p>
            <p className="mt-1 text-xs">Preview not available for this file type</p>
            <Button variant="outline" className="mt-4" asChild>
              <a href={signedUrl} download={fileName}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function FileIcon({ type }: { type: ReturnType<typeof getFileIconType> }) {
  const size = "h-12 w-12";
  const colors: Record<string, string> = {
    pdf: "text-red-500",
    image: "text-green-500",
    doc: "text-primary",
    spreadsheet: "text-emerald-600",
    text: "text-muted-foreground",
    unknown: "text-muted-foreground",
  };

  return <FileText className={cn(size, colors[type])} />;
}
