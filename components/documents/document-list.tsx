"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  File01Icon,
  Download01Icon,
  EyeIcon,
  Delete01Icon,
  MoreHorizontalIcon,
  Upload01Icon,
  GlobeIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { formatFileSize, getFileIconType } from "@/lib/storage/client";
import { cn } from "@/lib/utils";

export type DocumentItem = {
  id: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number | null;
  category: string | null;
  source:
    | "upload"
    | "template"
    | "chronicle"
    | "case_status"
    | "email"
    | "esignature"
    | "ere";
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

const SOURCE_LABELS: Record<string, { label: string; icon: IconSvgElement }> = {
  upload: { label: "Uploaded", icon: Upload01Icon },
  template: { label: "Template", icon: File01Icon },
  chronicle: { label: "SSA/Chronicle", icon: GlobeIcon },
  case_status: { label: "Client Upload", icon: UserIcon },
  email: { label: "Email", icon: File01Icon },
  esignature: { label: "eSignature", icon: File01Icon },
  ere: { label: "ERE", icon: GlobeIcon },
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
              "rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200",
              sourceFilter === null
                ? "bg-black text-white"
                : "border border-[#EAEAEA] text-[#666] hover:border-[#CCC]",
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
                "rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200",
                sourceFilter === source
                  ? "bg-black text-white"
                  : "border border-[#EAEAEA] text-[#666] hover:border-[#CCC]",
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
          <HugeiconsIcon
            icon={File01Icon}
            size={24}
            color="#999"
            className="mx-auto"
          />
          <p className="mt-2 text-[13px] text-[#666]">
            No documents found
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-[#EAEAEA]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#EAEAEA]">
              <tr>
                <th className="px-4 py-2.5 text-xs font-medium text-[#666] uppercase tracking-wider">
                  Name
                </th>
                <th className="hidden px-4 py-2.5 text-xs font-medium text-[#666] uppercase tracking-wider sm:table-cell">
                  Source
                </th>
                <th className="hidden px-4 py-2.5 text-xs font-medium text-[#666] uppercase tracking-wider md:table-cell">
                  Category
                </th>
                <th className="hidden px-4 py-2.5 text-xs font-medium text-[#666] uppercase tracking-wider lg:table-cell">
                  Size
                </th>
                <th className="hidden px-4 py-2.5 text-xs font-medium text-[#666] uppercase tracking-wider lg:table-cell">
                  Date
                </th>
                <th className="px-4 py-2.5 text-xs font-medium text-[#666] uppercase tracking-wider">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map((doc) => {
                const iconType = getFileIconType(doc.fileType);
                return (
                  <tr
                    key={doc.id}
                    className="border-b border-[#EAEAEA] last:border-b-0 hover:bg-[#F0F0F0] transition-colors duration-200"
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
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border border-[#EAEAEA] text-[#666]">
                        {SOURCE_LABELS[doc.source]?.label ?? doc.source}
                      </span>
                    </td>
                    <td className="hidden px-4 py-2.5 text-[#666] md:table-cell">
                      {doc.category ?? "\u2014"}
                    </td>
                    <td className="hidden px-4 py-2.5 font-mono text-[#666] lg:table-cell">
                      {doc.fileSizeBytes
                        ? formatFileSize(doc.fileSizeBytes)
                        : "\u2014"}
                    </td>
                    <td className="hidden px-4 py-2.5 font-mono text-[#666] lg:table-cell">
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
                          <HugeiconsIcon icon={EyeIcon} size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDownload(doc)}
                          title="Download"
                        >
                          <HugeiconsIcon icon={Download01Icon} size={16} />
                        </Button>
                        {onDelete && (
                          <div className="relative">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setMenuOpen(menuOpen === doc.id ? null : doc.id)
                              }
                            >
                              <HugeiconsIcon
                                icon={MoreHorizontalIcon}
                                size={16}
                              />
                            </Button>
                            {menuOpen === doc.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setMenuOpen(null)}
                                />
                                <div className="absolute right-0 z-20 mt-1 w-36 rounded-md border border-[#EAEAEA] bg-white py-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onDelete(doc);
                                      setMenuOpen(null);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-[#EE0000] hover:bg-[#F0F0F0] transition-colors duration-200"
                                  >
                                    <HugeiconsIcon
                                      icon={Delete01Icon}
                                      size={14}
                                    />
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
  return (
    <HugeiconsIcon
      icon={File01Icon}
      size={16}
      className="shrink-0 text-[#666]"
    />
  );
}
