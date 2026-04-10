"use client";

import { useState, useCallback } from "react";
import {
  DocumentList,
  type DocumentItem,
} from "@/components/documents/document-list";
import { DocumentUpload } from "@/components/documents/document-upload";
import { DocumentPreview } from "@/components/documents/document-preview";
import { GenerateFromTemplateDialog } from "@/components/documents/generate-template-dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon, File01Icon } from "@hugeicons/core-free-icons";
import {
  uploadDocumentAction,
  getDocumentUrl,
  deleteDocument,
} from "@/app/actions/documents";

type Template = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  mergeFields: string[] | null;
  templateContent: string | null;
};

type CaseDocumentsClientProps = {
  caseId: string;
  organizationId: string;
  userId: string;
  initialDocuments: DocumentItem[];
  templates: Template[];
  caseData: {
    claimantName: string;
    caseNumber: string;
    dateOfBirth: string | null;
    ssaClaimNumber: string | null;
    ssaOffice: string | null;
    allegedOnsetDate: string | null;
    hearingOffice: string | null;
    adminLawJudge: string | null;
  };
};

export function CaseDocumentsClient({
  caseId,
  organizationId,
  userId,
  initialDocuments,
  templates,
  caseData,
}: CaseDocumentsClientProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>(initialDocuments);
  const [showUpload, setShowUpload] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{
    fileName: string;
    fileType: string;
    signedUrl: string;
  } | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);

  const handleUpload = useCallback(
    async (files: File[], category?: string) => {
      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("caseId", caseId);
        formData.set("organizationId", organizationId);
        formData.set("userId", userId);
        if (category) {
          formData.set("category", category);
        }

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

  const handleTemplateGenerated = useCallback((doc: DocumentItem) => {
    setDocuments((prev) => [doc, ...prev]);
    setShowTemplateDialog(false);
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Documents"
        description="Case documents from all sources."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {templates.length > 0 && (
              <Button
                onClick={() => setShowTemplateDialog(true)}
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-none"
              >
                <HugeiconsIcon icon={File01Icon} size={16} className="mr-1" />
                <span className="hidden sm:inline">Generate from Template</span>
                <span className="sm:hidden">Template</span>
              </Button>
            )}
            <Button
              onClick={() => setShowUpload(!showUpload)}
              size="sm"
              className="flex-1 sm:flex-none"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={16} className="mr-1" />
              Upload
            </Button>
          </div>
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
        <SheetContent
          side="right"
          className="w-full p-0 sm:w-[600px] sm:max-w-[600px]"
        >
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

      {/* Generate from Template Dialog */}
      <GenerateFromTemplateDialog
        open={showTemplateDialog}
        onOpenChange={setShowTemplateDialog}
        templates={templates}
        caseData={caseData}
        caseId={caseId}
        organizationId={organizationId}
        userId={userId}
        onGenerated={handleTemplateGenerated}
      />
    </div>
  );
}
