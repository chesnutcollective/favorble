import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import { cases, users } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import { createNotification } from "@/lib/services/notify";

/**
 * Cron endpoint for the 3-tier escalation ladder (SA-7).
 *
 * Walks overdue tasks and, based on their current `escalation_state`,
 * promotes them through the ladder:
 *
 *   none                 → reminder_sent        (notify assignee immediately)
 *   reminder_sent        → supervisor_notified  (after ≥1 day, notify team manager)
 *   supervisor_notified  → management_flagged   (after ≥2 days, notify all admins)
 *
 * Caps at 200 tasks per run. Returns a summary of what was touched.
 * Scheduled every 30 minutes from vercel.json.
 *
 * NOTE: `escalation_state` and `last_escalated_at` live in the `tasks`
 * table but the Drizzle schema file currently doesn't type them — we
 * touch them via raw SQL here so the rest of the code stays type-safe.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>, same as other cron routes.
 */

const MAX_TASKS_PER_RUN = 200;

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${secret}`;
}

function diffDays(from: Date, to: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

type OverdueRow = {
  id: string;
  organization_id: string;
  case_id: string;
  title: string;
  description: string | null;
  assigned_to_id: string | null;
  due_date: Date | string | null;
  escalation_state:
    | "none"
    | "reminder_sent"
    | "supervisor_notified"
    | "management_flagged"
    | null;
  last_escalated_at: Date | string | null;
};

function asDate(value: Date | string | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    logger.error("Cron escalate-overdue unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  let reminders = 0;
  let supervisorNotices = 0;
  let managementFlags = 0;
  let skipped = 0;
  let swept = 0;

  try {
    const raw = await db.execute(sql`
      SELECT id,
             organization_id,
             case_id,
             title,
             description,
             assigned_to_id,
             due_date,
             COALESCE(escalation_state::text, 'none') AS escalation_state,
             last_escalated_at
      FROM tasks
      WHERE status IN ('pending','in_progress')
        AND due_date < ${now}
        AND deleted_at IS NULL
      ORDER BY due_date ASC
      LIMIT ${MAX_TASKS_PER_RUN}
    `);
    const overdueTasks =
      (raw as unknown as { rows?: OverdueRow[] }).rows ??
      (raw as unknown as OverdueRow[]);

    logger.info("Cron escalate-overdue sweep started", {
      candidateCount: overdueTasks.length,
    });

    for (const task of overdueTasks) {
      swept++;
      const dueDate = asDate(task.due_date);
      const lastEscalatedAt = asDate(task.last_escalated_at);
      if (!task.assigned_to_id || !dueDate) {
        skipped++;
        continue;
      }

      const state = task.escalation_state ?? "none";
      const sinceLast = lastEscalatedAt
        ? diffDays(lastEscalatedAt, now)
        : Number.POSITIVE_INFINITY;

      if (state === "none") {
        // Tier 1: simple reminder to assignee
        await createNotification({
          organizationId: task.organization_id,
          userId: task.assigned_to_id,
          caseId: task.case_id,
          title: "Task overdue",
          body: `Your task "${task.title}" is overdue.`,
          priority: "high",
          actionLabel: "Open task",
          actionHref: `/queue?task=${task.id}`,
          dedupeKey: `escalate:${task.id}:tier1`,
        });

        await db.execute(sql`
          UPDATE tasks
          SET escalation_state = 'reminder_sent',
              last_escalated_at = ${now},
              updated_at = ${now}
          WHERE id = ${task.id}
        `);

        reminders++;
        continue;
      }

      if (state === "reminder_sent" && sinceLast >= 1) {
        // Tier 2: notify team manager (supervisor on the assignee's team)
        const [assignee] = await db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            team: users.team,
            organizationId: users.organizationId,
          })
          .from(users)
          .where(eq(users.id, task.assigned_to_id))
          .limit(1);

        let supervisorId: string | null = null;
        if (assignee?.team) {
          const [supervisor] = await db
            .select({ id: users.id })
            .from(users)
            .where(
              and(
                eq(users.organizationId, assignee.organizationId),
                eq(users.team, assignee.team),
                sql`${users.role} IN ('admin','case_manager','attorney')`,
                eq(users.isActive, true),
                sql`${users.id} <> ${task.assigned_to_id}`,
              ),
            )
            .limit(1);
          supervisorId = supervisor?.id ?? null;
        }

        if (!supervisorId) {
          const [fallback] = await db
            .select({ id: users.id })
            .from(users)
            .where(
              and(
                eq(users.organizationId, task.organization_id),
                eq(users.role, "admin"),
                eq(users.isActive, true),
              ),
            )
            .limit(1);
          supervisorId = fallback?.id ?? null;
        }

        if (supervisorId) {
          // SA-7: Rich context for supervisor tier-2 escalation
          const daysOverdue = dueDate ? diffDays(dueDate, now) : 0;
          const assigneeName = assignee
            ? `${assignee.firstName ?? ""} ${assignee.lastName ?? ""}`.trim() ||
              "Unknown"
            : "Unknown";

          let caseLabel = "";
          try {
            const [caseRow] = await db
              .select({ caseNumber: cases.caseNumber })
              .from(cases)
              .where(eq(cases.id, task.case_id))
              .limit(1);
            if (caseRow) {
              caseLabel = `Case ${caseRow.caseNumber}`;
            }
          } catch {
            /* best effort */
          }

          const tier2Lines = [
            `Task: "${task.title}"${task.description ? ` — ${task.description.slice(0, 80)}` : ""}`,
            `Assignee: ${assigneeName} · ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`,
            caseLabel ? caseLabel : null,
          ]
            .filter(Boolean)
            .join("\n");

          await createNotification({
            organizationId: task.organization_id,
            userId: supervisorId,
            caseId: task.case_id,
            title: "Team task still overdue",
            body: tier2Lines.slice(0, 300),
            priority: "high",
            actionLabel: "View case tasks",
            actionHref: `/cases/${task.case_id}/tasks`,
            dedupeKey: `escalate:${task.id}:tier2`,
          });

          await db.execute(sql`
            UPDATE tasks
            SET escalation_state = 'supervisor_notified',
                last_escalated_at = ${now},
                updated_at = ${now}
            WHERE id = ${task.id}
          `);

          supervisorNotices++;
        } else {
          skipped++;
        }
        continue;
      }

      if (state === "supervisor_notified" && sinceLast >= 2) {
        // Tier 3: notify all org admins with full context
        const daysOverdue = dueDate ? diffDays(dueDate, now) : 0;

        // Look up assignee name for tier-3 context
        let tier3AssigneeName = "Unknown";
        try {
          const [a] = await db
            .select({ firstName: users.firstName, lastName: users.lastName })
            .from(users)
            .where(eq(users.id, task.assigned_to_id!))
            .limit(1);
          if (a)
            tier3AssigneeName =
              `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() || "Unknown";
        } catch {
          /* best effort */
        }

        let tier3CaseLabel = "";
        try {
          const [caseRow] = await db
            .select({ caseNumber: cases.caseNumber })
            .from(cases)
            .where(eq(cases.id, task.case_id))
            .limit(1);
          if (caseRow) {
            tier3CaseLabel = `Case ${caseRow.caseNumber}`;
          }
        } catch {
          /* best effort */
        }

        const tier3Body = [
          `Task: "${task.title}"${task.description ? ` — ${task.description.slice(0, 80)}` : ""}`,
          `Assignee: ${tier3AssigneeName} · ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`,
          tier3CaseLabel ? tier3CaseLabel : null,
          "Escalated through 2 tiers without resolution.",
        ]
          .filter(Boolean)
          .join("\n");

        const admins = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.organizationId, task.organization_id),
              eq(users.role, "admin"),
              eq(users.isActive, true),
            ),
          );

        for (const admin of admins) {
          await createNotification({
            organizationId: task.organization_id,
            userId: admin.id,
            caseId: task.case_id,
            title: "Task escalated to management",
            body: tier3Body.slice(0, 300),
            priority: "urgent",
            actionLabel: "View case tasks",
            actionHref: `/cases/${task.case_id}/tasks`,
            dedupeKey: `escalate:${task.id}:tier3:${admin.id}`,
          });
        }

        await db.execute(sql`
          UPDATE tasks
          SET escalation_state = 'management_flagged',
              last_escalated_at = ${now},
              updated_at = ${now}
          WHERE id = ${task.id}
        `);

        managementFlags++;
        continue;
      }

      // Already at management_flagged or not enough time passed
      skipped++;
    }
  } catch (err) {
    logger.error("Cron escalate-overdue failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }

  const summary = {
    swept,
    reminders,
    supervisorNotices,
    managementFlags,
    skipped,
  };

  logger.info("Cron escalate-overdue sweep complete", summary);

  return NextResponse.json({ success: true, ...summary });
}
