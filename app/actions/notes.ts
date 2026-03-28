"use server";

import { db } from "@/db/drizzle";
import { communications } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

/**
 * Create a note on a case.
 */
export async function createCaseNote(data: {
	caseId: string;
	body: string;
}) {
	const session = await requireSession();

	const [note] = await db
		.insert(communications)
		.values({
			organizationId: session.organizationId,
			caseId: data.caseId,
			type: "note",
			body: data.body,
			userId: session.id,
		})
		.returning();

	logger.info("Case note created", {
		noteId: note.id,
		caseId: data.caseId,
	});

	revalidatePath(`/cases/${data.caseId}/activity`);
	return note;
}

/**
 * Get notes for a case.
 */
export async function getCaseNotes(caseId: string) {
	const notes = await db
		.select({
			id: communications.id,
			body: communications.body,
			userId: communications.userId,
			createdAt: communications.createdAt,
		})
		.from(communications)
		.where(eq(communications.caseId, caseId))
		.orderBy(desc(communications.createdAt));

	return notes;
}
