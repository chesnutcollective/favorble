"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { EyeIcon, File01Icon } from "@hugeicons/core-free-icons";

type EreDocument = {
  id: string;
  fileName: string;
  category: string | null;
  processingStatus: string | null;
  createdAt: string;
};

type EreDocumentsFeedProps = {
  documents: EreDocument[];
  onView?: (doc: EreDocument) => void;
  onProcess?: (doc: EreDocument) => void;
};

const PROCESSING_STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "border-[#eaeaea] text-[#666]",
  },
  extracting: {
    label: "Extracting",
    className: "border-[#eaeaea] text-[#171717]",
  },
  classifying: {
    label: "Classifying",
    className: "border-[#eaeaea] text-[#171717]",
  },
  completed: {
    label: "Processed",
    className: "border-[#eaeaea] text-[#171717]",
  },
  failed: {
    label: "Failed",
    className: "border-[#eaeaea] text-[#666]",
  },
};

export function EreDocumentsFeed({
  documents,
  onView,
  onProcess,
}: EreDocumentsFeedProps) {
  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-foreground mb-3">ERE Documents</h3>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <HugeiconsIcon
              icon={File01Icon}
              size={24}
              className="text-[#999]"
            />
            <p className="mt-3 text-sm font-medium text-[#171717]">
              No documents downloaded yet
            </p>
            <p className="mt-0.5 text-xs text-[#666]">
              Documents from ERE will appear here once synced
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="font-medium text-foreground mb-4">ERE Documents</h3>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#eaeaea] bg-[#fafafa]">
              <tr>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">
                  Name
                </th>
                <th className="hidden px-4 py-2.5 font-medium text-muted-foreground sm:table-cell">
                  Category
                </th>
                <th className="hidden px-4 py-2.5 font-medium text-muted-foreground md:table-cell">
                  Processing
                </th>
                <th className="hidden px-4 py-2.5 font-medium text-muted-foreground lg:table-cell">
                  Downloaded
                </th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eaeaea]">
              {documents.map((doc) => (
                <tr
                  key={doc.id}
                  className="hover:bg-[#fafafa] transition-colors duration-200"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon
                        icon={File01Icon}
                        size={16}
                        className="shrink-0 text-[#666]"
                      />
                      <span className="truncate font-medium text-foreground max-w-[200px]">
                        {doc.fileName}
                      </span>
                    </div>
                  </td>
                  <td className="hidden px-4 py-2.5 sm:table-cell">
                    {doc.category ? (
                      <Badge
                        variant="outline"
                        className="border-border text-muted-foreground"
                      >
                        {doc.category}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    {doc.processingStatus ? (
                      <Badge
                        variant="outline"
                        className={
                          PROCESSING_STATUS_BADGE[doc.processingStatus]
                            ?.className ?? "border-border text-muted-foreground"
                        }
                      >
                        {PROCESSING_STATUS_BADGE[doc.processingStatus]?.label ??
                          doc.processingStatus}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground lg:table-cell">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {onView && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onView(doc)}
                          title="View"
                        >
                          <HugeiconsIcon icon={EyeIcon} size={16} />
                        </Button>
                      )}
                      {onProcess && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onProcess(doc)}
                          title="Process"
                        >
                          Process
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
