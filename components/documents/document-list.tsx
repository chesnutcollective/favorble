"use client";

import { useState } from "react";
import {
  FileText,
  Download,
  Eye,
  Trash2,
  MoreHorizontal,
  Upload as UploadIcon,
  Globe,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatFileSize, getFileIconType } from "@/lib/storage/client";
import { cn } from "@/lib/utils";

export type DocumentItem = {
  id: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number | null;
  category: string | null;
  source: "upload" | "template" | "chronicle" | "case_status" | "email" | "esignature";
  createdAt: string;
  createdByName?: string;
};

type DocumentListProps = {
  documents: DocumentItem[];
  onPreview: (doc: DocumentItem) => void;
  onDownload: (doc: DocumentItem) => void;
  onDelete?: (doc: DocumentItem) => void;
  sourceFilter?: string | null;
  onSourceFilterChange?: (source: string | null) => void;
};

const SOURCE_LABELS: Record<string, { label: string; icon: typeof FileText }> = {
  upload: { label: "Uploaded", icon: UploadIcon },
  template: { label: "Template", icon: FileText },
  chronicle: { label: "SSA/Chronicle", icon: Globe },
  case_status: { label: "Client Upload", icon: User },
  email: { label: "Email", icon: FileText },
  esignature: { label: "eSignature", icon: FileText },
};

const SOURCE_COLORS: Record<string, string> = {
  upload: "bg-muted text-foreground",
  template: "bg-blue-100 text-blue-700",
  chronicle: "bg-purple-100 text-purple-700",
  case_status: "bg-green-100 text-green-700",
  email: "bg-amber-100 text-amber-700",
  esignature: "bg-indigo-100 text-indigo-700",
};

export function DocumentList({
  documents,
  onPreview,
  onDownload,
  onDelete,
  sourceFilter,
  onSourceFilterChange,
}: DocumentListProps) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const filteredDocs = sourceFilter
    ? documents.filter((d) => d.source === sourceFilter)
    : documents;

  const sourceCounts = documents.reduce(
    (acc, doc) => {
      acc[doc.source] = (acc[doc.source] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-3">
      {/* Source filter pills */}
      {onSourceFilterChange && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSourceFilterChange(null)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              sourceFilter === null
                ? "bg-gray-900 text-white"
                : "bg-muted text-muted-foreground hover:bg-muted",
            )}
          >
            All ({documents.length})
          </button>
          {Object.entries(sourceCounts).map(([source, count]) => (
            <button
              key={source}
              type="button"
              onClick={() =>
                onSourceFilterChange(source === sourceFilter ? null : source)
              }
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                sourceFilter === source
                  ? "bg-gray-900 text-white"
                  : `${SOURCE_COLORS[source]} hover:opacity-80`,
              )}
            >
              {SOURCE_LABELS[source]?.label ?? source} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Document table */}
      {filteredDocs.length === 0 ? (
        <div className="py-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-muted-foreground">No documents found</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-accent">
              <tr>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                <th className="hidden px-4 py-2.5 font-medium text-muted-foreground sm:table-cell">
                  Source
                </th>
                <th className="hidden px-4 py-2.5 font-medium text-muted-foreground md:table-cell">
                  Category
                </th>
                <th className="hidden px-4 py-2.5 font-medium text-muted-foreground lg:table-cell">
                  Size
                </th>
                <th className="hidden px-4 py-2.5 font-medium text-muted-foreground lg:table-cell">
                  Date
                </th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredDocs.map((doc) => {
                const iconType = getFileIconType(doc.fileType);
                return (
                  <tr
                    key={doc.id}
                    className="hover:bg-accent transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <FileIcon type={iconType} />
                        <span className="truncate font-medium text-foreground max-w-[200px]">
                          {doc.fileName}
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-2.5 sm:table-cell">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          SOURCE_COLORS[doc.source],
                        )}
                      >
                        {SOURCE_LABELS[doc.source]?.label ?? doc.source}
                      </span>
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                      {doc.category ?? "—"}
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground lg:table-cell">
                      {doc.fileSizeBytes ? formatFileSize(doc.fileSizeBytes) : "—"}
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground lg:table-cell">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onPreview(doc)}
                          title="Preview"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDownload(doc)}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {onDelete && (
                          <div className="relative">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setMenuOpen(
                                  menuOpen === doc.id ? null : doc.id,
                                )
                              }
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                            {menuOpen === doc.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setMenuOpen(null)}
                                />
                                <div className="absolute right-0 z-20 mt-1 w-36 rounded-md border border-border bg-white py-1 shadow-lg">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onDelete(doc);
                                      setMenuOpen(null);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FileIcon({ type }: { type: ReturnType<typeof getFileIconType> }) {
  const colors: Record<string, string> = {
    pdf: "text-red-500",
    image: "text-green-500",
    doc: "text-primary",
    spreadsheet: "text-emerald-600",
    text: "text-muted-foreground",
    unknown: "text-muted-foreground",
  };

  return <FileText className={cn("h-4 w-4 shrink-0", colors[type])} />;
}
