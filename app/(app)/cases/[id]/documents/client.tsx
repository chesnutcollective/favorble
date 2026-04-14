"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useTransition } from "react";
import { toast } from "sonner";
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
import { triggerLangExtract } from "@/app/actions/extract";
import { ShareWithClientButton } from "@/components/documents/share-with-client-button";

type Template = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  mergeFields: string[] | null;
  templateContent: string | null;
};

// Extended row shape — the page passes pre-computed `shareCount` per row so
// the share-with-client control can render its badge.
type DocumentItemWithShare = DocumentItem & { shareCount?: number };

type CaseDocumentsClientProps = {
  caseId: string;
  organizationId: string;
  userId: string;
  claimantName: string;
  initialDocuments: DocumentItemWithShare[];
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
  claimantName,
  initialDocuments,
  templates,
  caseData,
}: CaseDocumentsClientProps) {
  const router = useRouter();
  const [documents, setDocuments] =
    useState<DocumentItemWithShare[]>(initialDocuments);
  const [showUpload, setShowUpload] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{
    fileName: string;
    fileType: string;
    signedUrl: string;
    initialPage?: number;
  } | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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

  const handlePreview = useCallback(
    async (doc: DocumentItem, page?: number) => {
      const result = await getDocumentUrl(doc.id);
      if (result.url) {
        setPreviewDoc({
          fileName: doc.fileName,
          fileType: doc.fileType,
          signedUrl: result.url,
          initialPage: page,
        });
        return;
      }
      toast.error(result.error ?? "Could not open document");
    },
    [],
  );

  // Auto-open a document when the URL has ?doc=<id>&page=<N>. This is
  // the deep-link target for passage-level search hits — the palette
  // navigates here, the effect opens the preview at the right page.
  const searchParams = useSearchParams();
  useEffect(() => {
    const docId = searchParams.get("doc");
    const pageRaw = searchParams.get("page");
    if (!docId) return;
    const page = pageRaw ? Number(pageRaw) : undefined;
    const doc = documents.find((d) => d.id === docId);
    if (doc) {
      handlePreview(doc, page);
    }
    // Intentionally one-shot on mount / param change — we do NOT want
    // to keep re-firing this when previewDoc state updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, documents]);

  const handleDownload = useCallback(async (doc: DocumentItem) => {
    const result = await getDocumentUrl(doc.id);
    if (result.url) {
      window.open(result.url, "_blank");
      return;
    }
    toast.error(result.error ?? "Could not download document");
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

  const handleReprocess = useCallback(
    async (doc: DocumentItem) => {
      setReprocessingId(doc.id);
      const extractionType = pickExtractionType(doc);
      const loadingToast = toast.loading(
        `Reprocessing "${doc.fileName}" with AI...`,
      );
      try {
        const result = await triggerLangExtract(doc.id, extractionType);
        toast.dismiss(loadingToast);
        if (result.success) {
          toast.success(`"${doc.fileName}" reprocessed successfully`);
          startTransition(() => {
            router.refresh();
          });
        } else {
          toast.error(result.error || "Reprocessing failed");
        }
      } catch (error) {
        toast.dismiss(loadingToast);
        toast.error(
          error instanceof Error ? error.message : "Reprocessing failed",
        );
      } finally {
        setReprocessingId(null);
      }
    },
    [router],
  );

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

      {/* Client visibility — share firm-owned docs to /portal/documents. */}
      <ClientVisibilitySection
        documents={documents.filter(
          // Don't offer "share" on documents the client uploaded themselves
          // or on Chronicle metadata stubs with no backing PDF.
          (d) => d.source !== "case_status" && !d.isMetadataOnly,
        )}
        claimantName={claimantName}
      />

      <DocumentList
        documents={documents}
        onPreview={handlePreview}
        onDownload={handleDownload}
        onDelete={handleDelete}
        onReprocess={handleReprocess}
        reprocessingId={reprocessingId}
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
              initialPage={previewDoc.initialPage}
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

/**
 * Firm-side "who can see what" surface. Lists every firm-owned document on
 * this case and lets staff flip it into /portal/documents with a single
 * click. Kept visually compact so it doesn't dwarf the main DocumentList —
 * most cases will only have a handful of documents worth sharing.
 */
function ClientVisibilitySection({
  documents,
  claimantName,
}: {
  documents: DocumentItemWithShare[];
  claimantName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (documents.length === 0) return null;

  const sharedCount = documents.reduce(
    (acc, d) => acc + (d.shareCount ?? 0),
    0,
  );

  return (
    <details
      open={expanded}
      onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
      className="rounded-md border border-[#EAEAEA] bg-white"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-foreground">
        <span>
          Client portal visibility
          {sharedCount > 0 ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
              {sharedCount} shared
            </span>
          ) : null}
        </span>
        <span className="text-[12px] text-muted-foreground">
          {expanded ? "Hide" : "Manage"}
        </span>
      </summary>
      <ul className="divide-y divide-[#EAEAEA] border-t border-[#EAEAEA]">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center justify-between gap-3 px-4 py-2.5"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {doc.fileName}
            </span>
            <ShareWithClientButton
              documentId={doc.id}
              fileName={doc.fileName}
              claimantName={claimantName}
              initialShareCount={doc.shareCount ?? 0}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}

type ExtractionType =
  | "medical_record"
  | "status_report"
  | "decision_letter"
  | "efolder_classification";

/**
 * Guess the best LangExtract extraction type from a document's filename,
 * category, and source. Mirrors the ERE webhook's filename heuristics so
 * manual reprocess matches the automatic path.
 */
function pickExtractionType(doc: DocumentItem): ExtractionType {
  const name = doc.fileName.toLowerCase();
  const category = (doc.category ?? "").toLowerCase();

  if (
    name.includes("decision") ||
    name.includes("favorable") ||
    name.includes("denial") ||
    category.includes("decision")
  ) {
    return "decision_letter";
  }
  if (
    name.includes("status") ||
    name.includes("report") ||
    category.includes("status")
  ) {
    return "status_report";
  }
  return "medical_record";
}
