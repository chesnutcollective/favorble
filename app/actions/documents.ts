"use server";

import { db } from "@/db/drizzle";
import { documents, documentTemplates } from "@/db/schema";
import {
  uploadDocument as uploadToStorage,
  getDocumentSignedUrl as getSignedUrl,
  deleteDocumentFile,
} from "@/lib/storage/server";
import { enqueueDocumentProcessing } from "@/lib/services/enqueue-processing";
import { eq, and, isNull, desc } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

export type DocumentFilters = {
  source?: string;
  category?: string;
};

/**
 * Get documents for a case.
 */
export async function getCaseDocuments(
  caseId: string,
  filters?: DocumentFilters,
) {
  const conditions = [
    eq(documents.caseId, caseId),
    isNull(documents.deletedAt),
  ];

  if (filters?.source) {
    conditions.push(
      eq(
        documents.source,
        filters.source as
          | "upload"
          | "template"
          | "chronicle"
          | "case_status"
          | "email"
          | "esignature",
      ),
    );
  }

  if (filters?.category) {
    conditions.push(eq(documents.category, filters.category));
  }

  const result = await db
    .select()
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.createdAt));

  return result;
}

/**
 * Upload a document to a case.
 */
export async function uploadDocumentAction(formData: FormData) {
  const file = formData.get("file") as File | null;
  const caseId = formData.get("caseId") as string | null;
  const organizationId = formData.get("organizationId") as string | null;
  const category = formData.get("category") as string | null;
  const userId = formData.get("userId") as string | null;

  if (!file || !caseId || !organizationId) {
    return { error: "File, caseId, and organizationId are required" };
  }

  try {
    // Upload to Supabase Storage
    const uploadResult = await uploadToStorage(organizationId, caseId, file);

    // Create database record
    const [doc] = await db
      .insert(documents)
      .values({
        organizationId,
        caseId,
        fileName: file.name,
        fileType: file.type,
        fileSizeBytes: file.size,
        storagePath: uploadResult.path,
        category,
        source: "upload",
        createdBy: userId,
      })
      .returning();

    logger.info("Document uploaded", {
      documentId: doc.id,
      caseId,
      fileName: file.name,
    });

    // Schedule AI extraction to run after the action completes.
    // Non-extractable file types (images, audio, etc.) are skipped by
    // the helper.
    enqueueDocumentProcessing({
      documentId: doc.id,
      organizationId,
      fileName: file.name,
      fileType: file.type,
      source: "manual_upload",
    });

    return { success: true, document: doc };
  } catch (error) {
    logger.error("Document upload failed", { error, caseId });
    return { error: "Failed to upload document" };
  }
}

/**
 * Get a signed URL for downloading/previewing a document.
 *
 * Returns a structured error when the document is a metadata-only stub
 * (e.g. `chronicle://...`) or when signing fails, so the client can render
 * a user-visible message instead of silently swallowing the failure.
 */
export async function getDocumentUrl(documentId: string) {
  const [doc] = await db
    .select({ storagePath: documents.storagePath })
    .from(documents)
    .where(eq(documents.id, documentId));

  if (!doc) {
    return { error: "Document not found" };
  }

  // Chronicle-imported stubs have a `chronicle://` storage path and no real
  // file attached. Surface a clear message so the UI can show a stub state.
  if (doc.storagePath.startsWith("chronicle://")) {
    return {
      error:
        "This document is a metadata stub from the Chronicle import. The underlying PDF wasn't downloaded.",
    };
  }

  try {
    const signedUrl = await getSignedUrl(doc.storagePath);
    return { url: signedUrl };
  } catch (err) {
    logger.error("getDocumentUrl signing failed", {
      documentId,
      storagePath: doc.storagePath,
      error: err,
    });
    return {
      error:
        err instanceof Error
          ? `Could not open document: ${err.message}`
          : "Could not open document",
    };
  }
}

/**
 * Soft-delete a document.
 */
export async function deleteDocument(documentId: string) {
  try {
    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));

    if (!doc) {
      return { error: "Document not found" };
    }

    // Soft delete in database
    await db
      .update(documents)
      .set({ deletedAt: new Date() })
      .where(eq(documents.id, documentId));

    // Delete from storage
    try {
      await deleteDocumentFile(doc.storagePath);
    } catch (storageError) {
      logger.warn("Failed to delete file from storage", {
        documentId,
        storagePath: doc.storagePath,
        error: storageError,
      });
    }

    logger.info("Document deleted", { documentId, fileName: doc.fileName });
    return { success: true };
  } catch (error) {
    logger.error("Document deletion failed", { error, documentId });
    return { error: "Failed to delete document" };
  }
}

/**
 * Get document templates for an organization.
 */
export async function getDocumentTemplates(organizationId: string) {
  return db
    .select()
    .from(documentTemplates)
    .where(
      and(
        eq(documentTemplates.organizationId, organizationId),
        eq(documentTemplates.isActive, true),
      ),
    )
    .orderBy(documentTemplates.name);
}

// ─── Merge Field Engine ──────────────────────────────────────

/**
 * Supported merge fields and their descriptions.
 */
const MERGE_FIELD_MAP: Record<string, string> = {
  claimant_name: "Full name of the claimant",
  case_number: "Case number (e.g. CF-1001)",
  dob: "Date of birth",
  ssa_claim_number: "SSA claim number",
  ssa_office: "SSA office name",
  alleged_onset_date: "Alleged onset date",
  hearing_office: "Hearing office",
  admin_law_judge: "Administrative law judge",
  current_date: "Today's date",
};

type MergeData = {
  claimantName: string;
  caseNumber: string;
  dateOfBirth: string | null;
  ssaClaimNumber: string | null;
  ssaOffice: string | null;
  allegedOnsetDate: string | null;
  hearingOffice: string | null;
  adminLawJudge: string | null;
};

/**
 * Replace merge fields in template content with actual case data.
 * Merge fields use the format {{field_name}}.
 */
export async function renderMergeFields(
  templateContent: string,
  data: MergeData,
): Promise<string> {
  const replacements: Record<string, string> = {
    claimant_name: data.claimantName,
    case_number: data.caseNumber,
    dob: data.dateOfBirth ?? "",
    ssa_claim_number: data.ssaClaimNumber ?? "",
    ssa_office: data.ssaOffice ?? "",
    alleged_onset_date: data.allegedOnsetDate ?? "",
    hearing_office: data.hearingOffice ?? "",
    admin_law_judge: data.adminLawJudge ?? "",
    current_date: new Date().toLocaleDateString(),
  };

  return templateContent.replace(/\{\{(\w+)\}\}/g, (match, field: string) => {
    return field in replacements ? replacements[field] : match;
  });
}

/**
 * Generate a document from a template, merging case data.
 * Creates a text document in storage and a DB record.
 */
export async function generateFromTemplate(data: {
  templateId: string;
  caseId: string;
  organizationId: string;
  userId: string;
  caseData: MergeData;
}) {
  const [template] = await db
    .select()
    .from(documentTemplates)
    .where(eq(documentTemplates.id, data.templateId));

  if (!template) {
    return { error: "Template not found" };
  }

  if (!template.templateContent) {
    return { error: "Template has no content to merge" };
  }

  try {
    const mergedContent = await renderMergeFields(
      template.templateContent,
      data.caseData,
    );

    // Create a text file from the merged content
    const fileName = `${template.name} - ${data.caseData.caseNumber}.txt`;
    const blob = new Blob([mergedContent], { type: "text/plain" });
    const file = new File([blob], fileName, { type: "text/plain" });

    // Upload to storage
    const uploadResult = await uploadToStorage(
      data.organizationId,
      data.caseId,
      file,
    );

    // Create document record
    const [doc] = await db
      .insert(documents)
      .values({
        organizationId: data.organizationId,
        caseId: data.caseId,
        fileName,
        fileType: "text/plain",
        fileSizeBytes: blob.size,
        storagePath: uploadResult.path,
        category: template.category,
        source: "template",
        description: `Generated from template: ${template.name}`,
        createdBy: data.userId,
      })
      .returning();

    logger.info("Document generated from template", {
      documentId: doc.id,
      templateId: data.templateId,
      caseId: data.caseId,
    });

    return { success: true, document: doc };
  } catch (error) {
    logger.error("Template generation failed", {
      error,
      templateId: data.templateId,
      caseId: data.caseId,
    });
    return { error: "Failed to generate document from template" };
  }
}
