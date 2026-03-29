"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { generateFromTemplate } from "@/app/actions/documents";

/** Client-side merge field rendering for preview */
function renderMergeFields(
  template: string,
  data: Record<string, string | null>,
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => data[key] ?? `{{${key}}}`,
  );
}
import type { DocumentItem } from "@/components/documents/document-list";
import { toast } from "sonner";

type Template = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  mergeFields: string[] | null;
  templateContent: string | null;
};

type CaseData = {
  claimantName: string;
  caseNumber: string;
  dateOfBirth: string | null;
  ssaClaimNumber: string | null;
  ssaOffice: string | null;
  allegedOnsetDate: string | null;
  hearingOffice: string | null;
  adminLawJudge: string | null;
};

type GenerateFromTemplateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: Template[];
  caseData: CaseData;
  caseId: string;
  organizationId: string;
  userId: string;
  onGenerated: (doc: DocumentItem) => void;
};

export function GenerateFromTemplateDialog({
  open,
  onOpenChange,
  templates,
  caseData,
  caseId,
  organizationId,
  userId,
  onGenerated,
}: GenerateFromTemplateDialogProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  // Compute preview of merged content
  const previewContent = selectedTemplate?.templateContent
    ? renderMergeFields(selectedTemplate.templateContent, caseData)
    : null;

  function handleGenerate() {
    if (!selectedTemplateId) {
      toast.error("Please select a template.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await generateFromTemplate({
          templateId: selectedTemplateId,
          caseId,
          organizationId,
          userId,
          caseData,
        });

        if (result.error) {
          toast.error(result.error);
          return;
        }

        if (result.success && result.document) {
          toast.success("Document generated from template.");
          onGenerated({
            id: result.document.id,
            fileName: result.document.fileName,
            fileType: result.document.fileType,
            fileSizeBytes: result.document.fileSizeBytes,
            category: result.document.category,
            source: result.document.source,
            createdAt: result.document.createdAt.toISOString(),
          });
          setSelectedTemplateId("");
        }
      } catch {
        toast.error("Failed to generate document.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setSelectedTemplateId("");
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate from Template</DialogTitle>
          <DialogDescription>
            Select a template and preview the merged document before generating.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Template</Label>
            <Select
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <div className="flex items-center gap-2">
                      <span>{t.name}</span>
                      {t.category && (
                        <span className="text-xs text-muted-foreground">
                          ({t.category})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplate?.description && (
              <p className="text-xs text-muted-foreground">
                {selectedTemplate.description}
              </p>
            )}
          </div>

          {selectedTemplate?.mergeFields &&
            selectedTemplate.mergeFields.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Merge Fields
                </Label>
                <div className="flex flex-wrap gap-1">
                  {selectedTemplate.mergeFields.map((field) => (
                    <span
                      key={field}
                      className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground"
                    >
                      {`{{${field}}}`}
                    </span>
                  ))}
                </div>
              </div>
            )}

          {previewContent && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-muted p-4">
                <pre className="whitespace-pre-wrap text-sm text-foreground font-mono">
                  {previewContent}
                </pre>
              </div>
            </div>
          )}

          {selectedTemplate && !selectedTemplate.templateContent && (
            <p className="text-sm text-amber-600">
              This template has no content to merge. It may be a file-based
              template.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={
              !selectedTemplateId ||
              !selectedTemplate?.templateContent ||
              isPending
            }
          >
            {isPending ? "Generating..." : "Generate Document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
