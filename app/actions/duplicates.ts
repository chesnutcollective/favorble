"use server";

import { db } from "@/db/drizzle";
import { leads } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger/server";
import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  findDuplicateLeads,
  findDuplicateContacts,
  type DuplicateInput,
  type DuplicateLeadMatch,
  type DuplicateContactMatch,
} from "@/lib/services/lead-dedup";

/**
 * Debounced duplicate check called from the lead creation form.
 * Returns sorted potential matches (highest confidence first).
 */
export async function checkLeadDuplicates(
  input: DuplicateInput,
): Promise<DuplicateLeadMatch[]> {
  // Require at least a name + one of (email OR phone) to avoid running
  // on every keystroke.
  if (!input.firstName || !input.lastName) return [];
  if (!input.email && !input.phone) return [];

  try {
    return await findDuplicateLeads(input);
  } catch (error) {
    logger.error("checkLeadDuplicates failed", { error });
    return [];
  }
}

/**
 * Same contract for contacts. Useful when creating a claimant directly.
 */
export async function checkContactDuplicates(
  input: DuplicateInput,
): Promise<DuplicateContactMatch[]> {
  if (!input.firstName || !input.lastName) return [];
  if (!input.email && !input.phone) return [];

  try {
    return await findDuplicateContacts(input);
  } catch (error) {
    logger.error("checkContactDuplicates failed", { error });
    return [];
  }
}

/**
 * Merge one or more duplicate leads into a primary lead. Each duplicate is
 * marked with `mergedIntoId` and `mergedAt` in its `metadata`, and soft-deleted
 * so it no longer shows up in the pipeline. Redirects to the primary lead.
 */
export async function mergeLeads(
  primaryId: string,
  duplicateIds: string[],
): Promise<void> {
  const session = await requireSession();

  if (!duplicateIds.length) return;
  if (duplicateIds.includes(primaryId)) {
    throw new Error("Primary lead cannot also be in the duplicates list");
  }

  // Verify primary exists in this org
  const [primary] = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.id, primaryId),
        eq(leads.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!primary) throw new Error("Primary lead not found");

  // Fetch duplicates to merge
  const dupes = await db
    .select()
    .from(leads)
    .where(
      and(
        inArray(leads.id, duplicateIds),
        eq(leads.organizationId, session.organizationId),
      ),
    );

  const now = new Date();

  for (const dupe of dupes) {
    const existingMetadata = (dupe.metadata as Record<string, unknown>) ?? {};
    await db
      .update(leads)
      .set({
        deletedAt: now,
        updatedAt: now,
        metadata: {
          ...existingMetadata,
          mergedIntoId: primaryId,
          mergedAt: now.toISOString(),
          mergedBy: session.id,
          mergeNote: `Merged into ${primary.firstName} ${primary.lastName} as a duplicate.`,
        },
      })
      .where(eq(leads.id, dupe.id));
  }

  logger.info("Leads merged", {
    primaryId,
    duplicateIds,
    mergedCount: dupes.length,
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${primaryId}`);
  redirect(`/leads/${primaryId}`);
}
