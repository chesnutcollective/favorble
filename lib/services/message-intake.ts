import "server-only";
import { db } from "@/db/drizzle";
import { communications, tasks, caseAssignments } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { askClaude } from "@/lib/ai/client";
import {
  buildCaseContext,
  formatCaseContextForPrompt,
} from "@/lib/services/case-context";
import { logger } from "@/lib/logger/server";

/**
 * Inbound message intake + action-item extraction (CM-3).
 *
 * Given a new inbound communication id, pull full case context, call
 * Claude to extract any action items the client needs to complete, and
 * either:
 *   - create a task in `pending_client_confirmation` status AND auto-send
 *     a CaseStatus reply asking the client to confirm, OR
 *   - create a normal pending task assigned to the case manager (for
 *     internal team action items the AI identifies).
 *
 * NOTE: `source_communication_id`, `client_confirmation_asked_at`,
 * `client_confirmation_answered_at`, `client_confirmation_answer`, and
 * the `pending_client_confirmation` status are present in the DB but
 * not all of them are reflected in the current Drizzle schema file.
 * We use raw SQL where the schema doesn't expose them so the rest of
 * the code stays type-safe.
 */

type ExtractedActionItem = {
  title: string;
  description: string;
  clientMustConfirm: boolean;
};

type ExtractionResult = {
  actionItems: ExtractedActionItem[];
};

async function resolveCaseManager(caseId: string): Promise<string | null> {
  try {
    const rows = await db
      .select({
        userId: caseAssignments.userId,
        role: caseAssignments.role,
        isPrimary: caseAssignments.isPrimary,
      })
      .from(caseAssignments)
      .where(
        and(
          eq(caseAssignments.caseId, caseId),
          isNull(caseAssignments.unassignedAt),
        ),
      );
    const cm = rows.find(
      (r) => r.role === "case_manager" || r.role === "primary_case_manager",
    );
    if (cm) return cm.userId;
    const primary = rows.find((r) => r.isPrimary);
    if (primary) return primary.userId;
    return rows[0]?.userId ?? null;
  } catch (err) {
    logger.warn("resolveCaseManager failed", {
      caseId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function parseExtraction(text: string): ExtractionResult {
  const cleaned = text
    .replace(/^```(?:json)?/gim, "")
    .replace(/```$/gm, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && Array.isArray(parsed.actionItems)) {
      return parsed as ExtractionResult;
    }
  } catch {
    // fall through
  }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && Array.isArray(parsed.actionItems)) {
        return parsed as ExtractionResult;
      }
    } catch {
      // give up
    }
  }
  return { actionItems: [] };
}

export async function extractActionItemsFromMessage(
  communicationId: string,
): Promise<{
  tasksCreated: number;
  clientRepliesSent: number;
} | null> {
  const [comm] = await db
    .select({
      id: communications.id,
      caseId: communications.caseId,
      organizationId: communications.organizationId,
      body: communications.body,
      fromAddress: communications.fromAddress,
      direction: communications.direction,
    })
    .from(communications)
    .where(eq(communications.id, communicationId))
    .limit(1);

  if (!comm || !comm.caseId) {
    logger.info("extractActionItemsFromMessage: no comm/case", {
      communicationId,
    });
    return null;
  }

  const caseId = comm.caseId;
  const messageBody = comm.body ?? "";
  if (!messageBody.trim()) {
    return { tasksCreated: 0, clientRepliesSent: 0 };
  }

  const ctx = await buildCaseContext(caseId);
  if (!ctx) {
    logger.warn("extractActionItemsFromMessage: no ctx", {
      communicationId,
      caseId,
    });
    return null;
  }
  const contextText = formatCaseContextForPrompt(ctx);

  const prompt = `You are a paralegal's assistant at a Social Security Disability law firm. A client just sent the message below. Extract any action items the client needs to complete based on what's in the message. Do NOT hallucinate new tasks — only extract items the message or case context actually implies.

For each action item:
- title: a short imperative (e.g. "Attach denial notice PDF")
- description: 1-2 sentence detail
- clientMustConfirm: true if we should ask the client to confirm whether they've already done this (e.g. "Have you uploaded the denial notice yet?"), false if this is something internal the team should do instead

Return ONLY a JSON object of shape { "actionItems": [...] }. If no action items, return { "actionItems": [] }.

## Inbound message
${messageBody}

## Case context
${contextText}
`;

  let extraction: ExtractionResult;
  try {
    const raw = await askClaude(prompt);
    extraction = parseExtraction(raw);
  } catch (err) {
    logger.error("extractActionItemsFromMessage: Claude call failed", {
      communicationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { tasksCreated: 0, clientRepliesSent: 0 };
  }

  if (extraction.actionItems.length === 0) {
    return { tasksCreated: 0, clientRepliesSent: 0 };
  }

  const caseManagerId = await resolveCaseManager(caseId);

  let tasksCreated = 0;
  let clientRepliesSent = 0;
  const now = new Date();

  for (const item of extraction.actionItems) {
    try {
      if (item.clientMustConfirm) {
        // Use raw SQL so we can target `pending_client_confirmation`
        // status, `source_communication_id`, and
        // `client_confirmation_asked_at` columns even though the
        // schema file doesn't currently expose them.
        await db.execute(sql`
          INSERT INTO tasks (
            organization_id, case_id, title, description, status,
            priority, assigned_to_id, source_communication_id,
            client_confirmation_asked_at, is_auto_generated
          ) VALUES (
            ${comm.organizationId}, ${caseId}, ${item.title},
            ${item.description}, 'pending_client_confirmation'::task_status,
            'medium', ${caseManagerId}, ${comm.id}, ${now}, true
          )
        `);
        tasksCreated++;

        // Auto-send a confirmation reply back to the client via Case
        // Status. We just enqueue a message_outbound row — the actual
        // delivery is handled by the CaseStatus sender on the next poll.
        await db.insert(communications).values({
          organizationId: comm.organizationId,
          caseId,
          type: "message_outbound",
          direction: "outbound",
          body: `Quick check-in: have you already completed this — "${item.title}"? Reply "yes" if it's done, or "no" and we'll take care of it from our side.`,
          toAddress: comm.fromAddress,
          sourceSystem: "case_status",
          metadata: {
            autoGenerated: true,
            purpose: "client_task_confirmation",
            sourceCommunicationId: comm.id,
          },
        });
        clientRepliesSent++;
      } else {
        // Internal team task — use the standard Drizzle insert for the
        // columns the schema DOES expose, and a raw UPDATE for the
        // source communication link.
        const [inserted] = await db
          .insert(tasks)
          .values({
            organizationId: comm.organizationId,
            caseId,
            title: item.title,
            description: item.description,
            status: "pending",
            priority: "medium",
            assignedToId: caseManagerId,
            isAutoGenerated: true,
          })
          .returning({ id: tasks.id });
        if (inserted) {
          await db.execute(sql`
            UPDATE tasks SET source_communication_id = ${comm.id}
            WHERE id = ${inserted.id}
          `);
        }
        tasksCreated++;
      }
    } catch (err) {
      logger.error("extractActionItemsFromMessage: insert failed", {
        communicationId,
        item,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("extractActionItemsFromMessage complete", {
    communicationId,
    tasksCreated,
    clientRepliesSent,
  });

  return { tasksCreated, clientRepliesSent };
}

// ---------------------------------------------------------------------------
// Inbound confirmation reply classification
// ---------------------------------------------------------------------------

/**
 * When a client sends a reply on a case that has outstanding
 * `pending_client_confirmation` tasks, try to classify it as a yes/no/
 * unclear answer and update the task accordingly.
 *
 * - yes  → mark task `completed`
 * - no   → move task to `pending`, assigned to the case manager
 * - unclear → leave task in `pending_client_confirmation`, no-op
 *
 * We only look at the single most recent pending_client_confirmation
 * task on the case. Handling multi-item confirmations is left to a
 * follow-up — the typical CM-3 flow is one ask at a time.
 */
export async function classifyClientConfirmationReply(
  communicationId: string,
): Promise<"yes" | "no" | "unclear" | null> {
  const [comm] = await db
    .select({
      id: communications.id,
      caseId: communications.caseId,
      organizationId: communications.organizationId,
      body: communications.body,
      direction: communications.direction,
    })
    .from(communications)
    .where(eq(communications.id, communicationId))
    .limit(1);

  if (!comm || !comm.caseId || !comm.body) return null;
  if (comm.direction !== "inbound") return null;

  // Raw SQL because `pending_client_confirmation` isn't in the current
  // schema file's task_status enum, and we also want the task title.
  const pending = (await db.execute(sql`
    SELECT id, title
    FROM tasks
    WHERE case_id = ${comm.caseId}
      AND status = 'pending_client_confirmation'::task_status
      AND deleted_at IS NULL
    ORDER BY client_confirmation_asked_at DESC NULLS LAST
    LIMIT 1
  `)) as unknown;
  const pendingRows =
    (pending as { rows?: Array<{ id: string; title: string }> }).rows ??
    (pending as Array<{ id: string; title: string }>);
  const task = pendingRows[0];
  if (!task) return null;

  const classifyPrompt = `A law firm sent a client this task-confirmation question: "${task.title}".
The client replied: "${comm.body}".

Classify the reply into exactly one of: yes, no, unclear.
- yes = the client is confirming they already did it
- no = the client is saying they haven't done it or they need help
- unclear = anything else

Return ONLY one of the three words: yes, no, unclear.`;

  let raw: string;
  try {
    raw = (await askClaude(classifyPrompt)).trim().toLowerCase();
  } catch (err) {
    logger.error("classifyClientConfirmationReply Claude call failed", {
      communicationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  let answer: "yes" | "no" | "unclear" = "unclear";
  if (raw.startsWith("yes")) answer = "yes";
  else if (raw.startsWith("no")) answer = "no";

  const now = new Date();

  if (answer === "yes") {
    await db.execute(sql`
      UPDATE tasks
      SET status = 'completed'::task_status,
          completed_at = ${now},
          client_confirmation_answer = 'yes',
          client_confirmation_answered_at = ${now},
          updated_at = ${now}
      WHERE id = ${task.id}
    `);
  } else if (answer === "no") {
    const caseManagerId = await resolveCaseManager(comm.caseId);
    await db.execute(sql`
      UPDATE tasks
      SET status = 'pending'::task_status,
          assigned_to_id = ${caseManagerId},
          client_confirmation_answer = 'no',
          client_confirmation_answered_at = ${now},
          updated_at = ${now}
      WHERE id = ${task.id}
    `);
  } else {
    await db.execute(sql`
      UPDATE tasks
      SET client_confirmation_answer = 'unclear',
          client_confirmation_answered_at = ${now},
          updated_at = ${now}
      WHERE id = ${task.id}
    `);
  }

  return answer;
}
