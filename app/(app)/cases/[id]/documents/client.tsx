"use client";

import { useState, useCallback } from "react";
import { DocumentList, type DocumentItem } from "@/components/documents/document-list";
import { DocumentUpload } from "@/components/documents/document-upload";
import { DocumentPreview } from "@/components/documents/document-preview";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import {
  uploadDocumentAction,
  getDocumentUrl,
  deleteDocument,
} from "@/app/actions/documents";

type CaseDocumentsClientProps = {
  caseId: string;
  organizationId: string;
  userId: string;
  initialDocuments: DocumentItem[];
};

export function CaseDocumentsClient({
  caseId,
  organizationId,
  userId,
  initialDocuments,
}: CaseDocumentsClientProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>(initialDocuments);
  const [showUpload, setShowUpload] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{
    fileName: string;
    fileType: string;
    signedUrl: string;
  } | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("caseId", caseId);
        formData.set("organizationId", organizationId);
        formData.set("userId", userId);

        const result = await uploadDocumentAction(formData);
        if (result.success && result.document) {
          setDocuments((prev) => [
            {
              id: result.document.id,
              fileName: result.document.fileName,
              fileType: result.document.fileType,
              fileSizeBytes: result.document.fileSizeBytes,
              category: result.document.category,
              source: result.document.source,
              createdAt: result.document.createdAt.toISOString(),
            },
            ...prev,
          ]);
        }
      }
      setShowUpload(false);
    },
    [caseId, organizationId, userId],
  );

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

  const handleDelete = useCallback(async (doc: DocumentItem) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${doc.fileName}"?`,
    );
    if (!confirmed) return;

    const result = await deleteDocument(doc.id);
    if (result.success) {
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    }
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Documents"
        description="Case documents from all sources."
        actions={
          <Button onClick={() => setShowUpload(!showUpload)} size="sm">
            <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-1" />
            Upload
          </Button>
        }
      />

      {showUpload && (
        <DocumentUpload onUpload={handleUpload} className="mb-4" />
      )}

      <DocumentList
        documents={documents}
        onPreview={handlePreview}
        onDownload={handleDownload}
        onDelete={handleDelete}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
      />

      {/* Document Preview Sheet */}
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
    </div>
  );
}
