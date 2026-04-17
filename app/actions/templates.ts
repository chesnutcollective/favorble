"use server";

import { db } from "@/db/drizzle";
import { documentTemplates } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

/**
 * Get all document templates for the current organization.
 */
export async function getDocumentTemplates() {
  const session = await requireSession();

  return db
    .select()
    .from(documentTemplates)
    .where(
      and(
        eq(documentTemplates.organizationId, session.organizationId),
        eq(documentTemplates.isActive, true),
      ),
    )
    .orderBy(documentTemplates.name);
}

/**
 * Create a new document template.
 */
export async function createDocumentTemplate(data: {
  name: string;
  description?: string;
  category?: string;
  mergeFields?: string[];
  requiresSignature?: boolean;
}) {
  const session = await requireSession();

  const [template] = await db
    .insert(documentTemplates)
    .values({
      organizationId: session.organizationId,
      name: data.name,
      description: data.description ?? null,
      category: data.category ?? null,
      mergeFields: data.mergeFields ?? [],
      requiresSignature: data.requiresSignature ?? false,
    })
    .returning();

  logger.info("Document template created", {
    templateId: template.id,
    name: data.name,
  });

  revalidatePath("/admin/templates");
  return template;
}

/**
 * Update an existing document template.
 */
export async function updateDocumentTemplate(
  id: string,
  data: {
    name?: string;
    description?: string;
    category?: string;
    requiresSignature?: boolean;
  },
) {
  await requireSession();

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.requiresSignature !== undefined)
    updateData.requiresSignature = data.requiresSignature;

  await db
    .update(documentTemplates)
    .set(updateData)
    .where(eq(documentTemplates.id, id));

  revalidatePath("/admin/templates");
}

/**
 * Soft-delete a document template by marking it inactive.
 */
export async function deleteDocumentTemplate(id: string) {
  await requireSession();

  await db
    .update(documentTemplates)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(documentTemplates.id, id));

  logger.info("Document template deleted", { templateId: id });
  revalidatePath("/admin/templates");
}

/**
 * Bulk archive (soft-delete) templates. Templates don't have a separate
 * archive flag — being `isActive: false` already hides them from lists and
 * keeps generated documents intact, which matches the desired "archive"
 * semantics.
 */
export async function bulkArchiveTemplates(templateIds: string[]) {
  const session = await requireSession();
  if (templateIds.length === 0) return { updated: 0 };

  const updated = await db
    .update(documentTemplates)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        inArray(documentTemplates.id, templateIds),
        eq(documentTemplates.organizationId, session.organizationId),
      ),
    )
    .returning({ id: documentTemplates.id });

  logger.info("Document templates bulk archived", {
    count: updated.length,
    requested: templateIds.length,
  });

  revalidatePath("/admin/templates");
  return { updated: updated.length };
}
