"use server";

import { db } from "@/db/drizzle";
import { documents, documentTemplates } from "@/db/schema";
import {
  uploadDocument as uploadToStorage,
  getDocumentSignedUrl as getSignedUrl,
  deleteDocumentFile,
} from "@/lib/storage/server";
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

    return { success: true, document: doc };
  } catch (error) {
    logger.error("Document upload failed", { error, caseId });
    return { error: "Failed to upload document" };
  }
}

/**
 * Get a signed URL for downloading/previewing a document.
 */
export async function getDocumentUrl(documentId: string) {
  const [doc] = await db
    .select({ storagePath: documents.storagePath })
    .from(documents)
    .where(eq(documents.id, documentId));

  if (!doc) {
    return { error: "Document not found" };
  }

  const signedUrl = await getSignedUrl(doc.storagePath);
  return { url: signedUrl };
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
