"use server";

import { db } from "@/db/drizzle";
import { communications, users } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, desc, and, ilike } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";

export type NoteType = "general" | "phone_call" | "internal_memo";

export type NoteMetadata = {
  noteType?: NoteType;
  tags?: string[];
  mentionedUserIds?: string[];
  isPinned?: boolean;
};

/**
 * Create a note on a case.
 */
export async function createCaseNote(data: {
  caseId: string;
  body: string;
  noteType?: NoteType;
  tags?: string[];
  mentionedUserIds?: string[];
}) {
  const session = await requireSession();

  const metadata: NoteMetadata = {
    noteType: data.noteType ?? "general",
    tags: data.tags ?? [],
    mentionedUserIds: data.mentionedUserIds ?? [],
    isPinned: false,
  };

  const [note] = await db
    .insert(communications)
    .values({
      organizationId: session.organizationId,
      caseId: data.caseId,
      type: "note",
      body: data.body,
      userId: session.id,
      metadata,
    })
    .returning();

  logger.info("Case note created", {
    noteId: note.id,
    caseId: data.caseId,
    noteType: data.noteType,
  });

  revalidatePath(`/cases/${data.caseId}/activity`);
  return note;
}

/**
 * Toggle pin status on a note.
 */
export async function toggleNotePin(data: {
  noteId: string;
  caseId: string;
  isPinned: boolean;
}) {
  await requireSession();

  const [existing] = await db
    .select({ id: communications.id, metadata: communications.metadata })
    .from(communications)
    .where(eq(communications.id, data.noteId))
    .limit(1);

  if (!existing) throw new Error("Note not found");

  const currentMeta = (existing.metadata ?? {}) as NoteMetadata;
  const updatedMeta: NoteMetadata = {
    ...currentMeta,
    isPinned: data.isPinned,
  };

  await db
    .update(communications)
    .set({ metadata: updatedMeta })
    .where(eq(communications.id, data.noteId));

  logger.info("Note pin toggled", {
    noteId: data.noteId,
    isPinned: data.isPinned,
  });

  revalidatePath(`/cases/${data.caseId}/activity`);
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
      metadata: communications.metadata,
    })
    .from(communications)
    .where(eq(communications.caseId, caseId))
    .orderBy(desc(communications.createdAt));

  return notes;
}

/**
 * Search users in the same organization (for @mention autocomplete).
 */
export async function searchOrganizationUsers(query: string) {
  const session = await requireSession();

  const results = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(
      and(
        eq(users.organizationId, session.organizationId),
        eq(users.isActive, true),
        ilike(users.firstName, `%${query}%`),
      ),
    )
    .limit(10);

  // Also search by last name
  const lastNameResults = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(
      and(
        eq(users.organizationId, session.organizationId),
        eq(users.isActive, true),
        ilike(users.lastName, `%${query}%`),
      ),
    )
    .limit(10);

  // Merge and deduplicate
  const seen = new Set<string>();
  const merged = [];
  for (const u of [...results, ...lastNameResults]) {
    if (!seen.has(u.id)) {
      seen.add(u.id);
      merged.push(u);
    }
  }

  return merged.slice(0, 10);
}
