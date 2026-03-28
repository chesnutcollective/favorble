"use server";

import { db } from "@/db/drizzle";
import { documentTemplates } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";
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
