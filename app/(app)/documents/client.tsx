"use client";

import { useState, useCallback, useEffect } from "react";
import {
  DocumentList,
  type DocumentItem,
} from "@/components/documents/document-list";
import { DocumentPreview } from "@/components/documents/document-preview";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { getDocumentUrl } from "@/app/actions/documents";

type GlobalDocument = DocumentItem & {
  caseNumber: string | null;
  caseId: string | null;
};

type GlobalDocumentsClientProps = {
  documents: GlobalDocument[];
  initialSource?: string | null;
};

export function GlobalDocumentsClient({
  documents,
  initialSource,
}: GlobalDocumentsClientProps) {
  const [sourceFilter, setSourceFilter] = useState<string | null>(
    initialSource ?? null,
  );

  // Sync filter when URL searchParams change (e.g., panel navigation)
  useEffect(() => {
    setSourceFilter(initialSource ?? null);
  }, [initialSource]);
  const [previewDoc, setPreviewDoc] = useState<{
    fileName: string;
    fileType: string;
    signedUrl: string;
  } | null>(null);

  const handlePreview = useCallback(async (doc: DocumentItem) => {
    const result = await getDocumentUrl(doc.id);
    if (result.url) {
      setPreviewDoc({
        fileName: doc.fileName,
        fileType: doc.fileType,
        signedUrl: result.url,
      });
    }
  }, []);

  const handleDownload = useCallback(async (doc: DocumentItem) => {
    const result = await getDocumentUrl(doc.id);
    if (result.url) {
      window.open(result.url, "_blank");
    }
  }, []);

  return (
    <>
      <DocumentList
        documents={documents}
        onPreview={handlePreview}
        onDownload={handleDownload}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
      />

      <Sheet
        open={!!previewDoc}
        onOpenChange={(open) => {
          if (!open) setPreviewDoc(null);
        }}
      >
        <SheetContent side="right" className="w-[600px] p-0 sm:max-w-[600px]">
          {previewDoc && (
            <DocumentPreview
              fileName={previewDoc.fileName}
              fileType={previewDoc.fileType}
              signedUrl={previewDoc.signedUrl}
              onClose={() => setPreviewDoc(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
