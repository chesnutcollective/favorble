"use server";

import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/drizzle";
import {
  cases,
  feePetitions,
  outboundMail,
  tasks,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger/server";

export type ActionResult = { success: boolean; message?: string };

/**
 * Wrapper actions for sub-nav Quick Action buttons. Each one picks "the top
 * item" for the persona's relevant queue and invokes the underlying mutation,
 * so a single button click does what a power user would do daily.
 */

// ── case_manager ──────────────────────────────────────────────────────────

export async function completeTopOpenTaskAction(): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const [top] = await db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(
        and(
          eq(tasks.assignedToId, session.id),
          inArray(tasks.status, ["pending", "in_progress"]),
          isNull(tasks.deletedAt),
        ),
      )
      .orderBy(asc(tasks.dueDate))
      .limit(1);
    if (!top) return { success: false, message: "No open tasks to complete" };
    await db
      .update(tasks)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, top.id));
    revalidatePath("/dashboard");
    revalidatePath("/queue");
    return { success: true, message: `Completed: ${top.title}` };
  } catch (e) {
    logger.error("completeTopOpenTask failed", { error: e });
    return { success: false, message: "Could not complete top task" };
  }
}

export async function snoozeTopTaskAction(): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const [top] = await db
      .select({ id: tasks.id, dueDate: tasks.dueDate, title: tasks.title })
      .from(tasks)
      .where(
        and(
          eq(tasks.assignedToId, session.id),
          inArray(tasks.status, ["pending", "in_progress"]),
          isNull(tasks.deletedAt),
        ),
      )
      .orderBy(asc(tasks.dueDate))
      .limit(1);
    if (!top) return { success: false, message: "No open tasks to snooze" };
    const newDue = new Date((top.dueDate ?? new Date()).getTime() + 24 * 3600 * 1000);
    await db
      .update(tasks)
      .set({ dueDate: newDue, updatedAt: new Date() })
      .where(eq(tasks.id, top.id));
    revalidatePath("/dashboard");
    revalidatePath("/queue");
    return { success: true, message: `Snoozed "${top.title}" for 24h` };
  } catch (e) {
    logger.error("snoozeTopTask failed", { error: e });
    return { success: false, message: "Could not snooze top task" };
  }
}

// ── mail_clerk ────────────────────────────────────────────────────────────

export async function markOldestOutboundDeliveredAction(): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const [top] = await db
      .select({ id: outboundMail.id, recipient: outboundMail.recipientName })
      .from(outboundMail)
      .where(
        and(
          eq(outboundMail.organizationId, session.organizationId),
          isNull(outboundMail.deliveredAt),
        ),
      )
      .orderBy(asc(outboundMail.sentAt))
      .limit(1);
    if (!top)
      return { success: false, message: "No outbound mail awaiting delivery" };
    await db
      .update(outboundMail)
      .set({ deliveredAt: new Date() })
      .where(eq(outboundMail.id, top.id));
    revalidatePath("/dashboard");
    revalidatePath("/mail");
    return { success: true, message: `Marked ${top.recipient} as delivered` };
  } catch (e) {
    logger.error("markOldestOutbound failed", { error: e });
    return { success: false, message: "Could not mark delivered" };
  }
}

// ── fee_collection ────────────────────────────────────────────────────────

export async function markOldestApprovedFeeCollectedAction(): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const [top] = await db
      .select({
        id: feePetitions.id,
        approvedAmountCents: feePetitions.approvedAmountCents,
      })
      .from(feePetitions)
      .where(
        and(
          eq(feePetitions.organizationId, session.organizationId),
          eq(feePetitions.status, "approved"),
        ),
      )
      .orderBy(asc(feePetitions.approvedAt))
      .limit(1);
    if (!top)
      return { success: false, message: "No approved petitions awaiting collection" };
    const amount = top.approvedAmountCents ?? 0;
    await db
      .update(feePetitions)
      .set({
        collectedAmountCents: amount,
        updatedAt: new Date(),
      })
      .where(eq(feePetitions.id, top.id));
    revalidatePath("/dashboard");
    revalidatePath("/fee-collection");
    const dollars = Math.round((top.approvedAmountCents ?? 0) / 100);
    return { success: true, message: `Marked $${dollars.toLocaleString()} collected` };
  } catch (e) {
    logger.error("markOldestApprovedFee failed", { error: e });
    return { success: false, message: "Could not mark fee collected" };
  }
}

// ── medical_records ───────────────────────────────────────────────────────

export async function markOldestMrCompleteAction(): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const [top] = await db
      .select({ id: cases.id, caseNumber: cases.caseNumber })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, session.organizationId),
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
          inArray(cases.mrStatus, ["in_progress", "not_started"]),
          lte(
            cases.hearingDate,
            new Date(Date.now() + 30 * 86400000),
          ),
        ),
      )
      .orderBy(asc(cases.hearingDate))
      .limit(1);
    if (!top)
      return { success: false, message: "No MR cases awaiting completion" };
    await db
      .update(cases)
      .set({ mrStatus: "complete", updatedAt: new Date() })
      .where(eq(cases.id, top.id));
    revalidatePath("/dashboard");
    revalidatePath("/medical-records");
    return {
      success: true,
      message: `Marked Case ${top.caseNumber ?? "—"} MR complete`,
    };
  } catch (e) {
    logger.error("markOldestMrComplete failed", { error: e });
    return { success: false, message: "Could not mark MR complete" };
  }
}

// ── phi_sheet_writer / pre_hearing_prep ───────────────────────────────────

export async function markOldestPhiSheetCompleteAction(): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const [top] = await db
      .select({ id: cases.id, caseNumber: cases.caseNumber })
      .from(cases)
      .where(
        and(
          eq(cases.organizationId, session.organizationId),
          isNull(cases.deletedAt),
          inArray(cases.phiSheetStatus, ["in_progress", "in_review"]),
        ),
      )
      .orderBy(asc(cases.hearingDate))
      .limit(1);
    if (!top)
      return { success: false, message: "No PHI sheets awaiting completion" };
    await db
      .update(cases)
      .set({
        phiSheetStatus: "complete",
        phiSheetCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(cases.id, top.id));
    revalidatePath("/dashboard");
    revalidatePath("/phi-writer");
    return {
      success: true,
      message: `Marked PHI sheet for Case ${top.caseNumber ?? "—"} complete`,
    };
  } catch (e) {
    logger.error("markOldestPhiSheet failed", { error: e });
    return { success: false, message: "Could not mark sheet complete" };
  }
}
