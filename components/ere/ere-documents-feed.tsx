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
    className: "border-yellow-300 text-yellow-700",
  },
  extracting: {
    label: "Extracting",
    className: "border-blue-300 text-blue-700",
  },
  classifying: {
    label: "Classifying",
    className: "border-blue-300 text-blue-700",
  },
  completed: {
    label: "Processed",
    className: "border-green-300 text-green-700",
  },
  failed: {
    label: "Failed",
    className: "border-red-300 text-red-700",
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
          <div className="py-8 text-center">
            <HugeiconsIcon
              icon={File01Icon}
              size={32}
              color="rgb(209 213 219)"
              className="mx-auto"
            />
            <p className="mt-2 text-sm text-muted-foreground">
              No documents downloaded from ERE yet.
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
            <thead className="border-b border-border bg-accent">
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
            <tbody className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <tr
                  key={doc.id}
                  className="hover:bg-accent transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon
                        icon={File01Icon}
                        size={16}
                        className="shrink-0 text-red-500"
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
                            ?.className ??
                          "border-border text-muted-foreground"
                        }
                      >
                        {PROCESSING_STATUS_BADGE[doc.processingStatus]
                          ?.label ?? doc.processingStatus}
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
