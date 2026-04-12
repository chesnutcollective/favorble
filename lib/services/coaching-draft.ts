import "server-only";
import { db } from "@/db/drizzle";
import {
  coachingFlags,
  coachingDrafts,
  aiDrafts,
  users,
  tasks,
  communications,
  caseStageTransitions,
  auditLog,
} from "@/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import { askClaude } from "@/lib/ai/client";
import { getRoleMetricPack } from "@/lib/services/role-metrics";
import {
  getRecipe,
  type CoachingRecipe,
} from "@/lib/services/coaching-library";

/**
 * Coaching conversation + call-script draft generators (CC-2, CC-4).
 *
 * These live on top of `coachingFlags`. Given a flag id, they:
 *
 *   1. Load the flag + subject user
 *   2. Bundle the subject user's last 14 days of activity
 *      (tasks, communications, stage transitions, audit log entries)
 *   3. Ask Claude to draft either a coaching conversation outline
 *      (CC-2, persisted to `coachingDrafts`) or a phone-call script
 *      (CC-4, persisted to `aiDrafts` with type `coaching_conversation`)
 *   4. Return the inserted draft id
 *
 * The two variants share a data-gathering pass and differ only in the
 * prompt and the destination table.
 */

const MODEL_ID = "claude-sonnet-4-20250514";
const LOOKBACK_DAYS = 14;

const SYSTEM_INTRO = `You are an experienced supervisor-coach at a boutique Social Security Disability law firm. You turn raw performance data into a concrete, empathetic coaching plan. You never fabricate facts — if you cannot see an example in the activity bundle, you write "[no specific example found — see supervisor]". You speak in plain English, keep it under 500 words, and you are always constructive.`;

type ActivityBundle = {
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: Date | null;
    completedAt: Date | null;
    caseId: string | null;
    updatedAt: Date;
  }>;
  communications: Array<{
    id: string;
    type: string;
    direction: string | null;
    subject: string | null;
    bodySnippet: string | null;
    caseId: string | null;
    createdAt: Date;
  }>;
  stageTransitions: Array<{
    caseId: string;
    transitionedAt: Date;
    notes: string | null;
  }>;
  auditEntries: Array<{
    entityType: string;
    entityId: string;
    action: string;
    createdAt: Date;
  }>;
};

type Example = {
  caseId: string | null;
  eventDate: string;
  observation: string;
};

async function loadActivityBundle(
  subjectUserId: string,
  organizationId: string,
  since: Date,
): Promise<ActivityBundle> {
  const [taskRows, commRows, transitionRows, auditRows] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        caseId: tasks.caseId,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(
        and(eq(tasks.assignedToId, subjectUserId), gte(tasks.updatedAt, since)),
      )
      .orderBy(desc(tasks.updatedAt))
      .limit(50),
    db
      .select({
        id: communications.id,
        type: communications.type,
        direction: communications.direction,
        subject: communications.subject,
        body: communications.body,
        caseId: communications.caseId,
        createdAt: communications.createdAt,
      })
      .from(communications)
      .where(
        and(
          eq(communications.userId, subjectUserId),
          gte(communications.createdAt, since),
        ),
      )
      .orderBy(desc(communications.createdAt))
      .limit(50),
    db
      .select({
        caseId: caseStageTransitions.caseId,
        transitionedAt: caseStageTransitions.transitionedAt,
        notes: caseStageTransitions.notes,
      })
      .from(caseStageTransitions)
      .where(
        and(
          eq(caseStageTransitions.transitionedBy, subjectUserId),
          gte(caseStageTransitions.transitionedAt, since),
        ),
      )
      .orderBy(desc(caseStageTransitions.transitionedAt))
      .limit(50),
    db
      .select({
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        action: auditLog.action,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, subjectUserId),
          eq(auditLog.organizationId, organizationId),
          gte(auditLog.createdAt, since),
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(100),
  ]);

  return {
    tasks: taskRows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      dueDate: r.dueDate,
      completedAt: r.completedAt,
      caseId: r.caseId,
      updatedAt: r.updatedAt,
    })),
    communications: commRows.map((r) => ({
      id: r.id,
      type: r.type,
      direction: r.direction,
      subject: r.subject,
      bodySnippet: r.body ? r.body.slice(0, 240) : null,
      caseId: r.caseId,
      createdAt: r.createdAt,
    })),
    stageTransitions: transitionRows,
    auditEntries: auditRows,
  };
}

function formatActivityForPrompt(bundle: ActivityBundle): string {
  const parts: string[] = [];

  parts.push(`## Tasks (last ${LOOKBACK_DAYS} days)`);
  if (bundle.tasks.length === 0) {
    parts.push("- (none)");
  } else {
    for (const t of bundle.tasks.slice(0, 20)) {
      parts.push(
        `- [${t.status}] ${t.title}${t.dueDate ? ` (due ${t.dueDate.toISOString().split("T")[0]})` : ""}${t.completedAt ? ` (completed ${t.completedAt.toISOString().split("T")[0]})` : ""}`,
      );
    }
  }

  parts.push(`\n## Communications (last ${LOOKBACK_DAYS} days)`);
  if (bundle.communications.length === 0) {
    parts.push("- (none)");
  } else {
    for (const c of bundle.communications.slice(0, 20)) {
      const dir = c.direction === "inbound" ? "←" : "→";
      parts.push(
        `- ${c.createdAt.toISOString().split("T")[0]} ${c.type} ${dir} ${c.subject ?? "(no subject)"}`,
      );
      if (c.bodySnippet) parts.push(`    ${c.bodySnippet.replace(/\n/g, " ")}`);
    }
  }

  parts.push(`\n## Stage transitions`);
  if (bundle.stageTransitions.length === 0) {
    parts.push("- (none)");
  } else {
    for (const s of bundle.stageTransitions.slice(0, 15)) {
      parts.push(
        `- ${s.transitionedAt.toISOString().split("T")[0]} case ${s.caseId}${s.notes ? ` — ${s.notes}` : ""}`,
      );
    }
  }

  parts.push(`\n## Audit activity`);
  if (bundle.auditEntries.length === 0) {
    parts.push("- (none)");
  } else {
    const byDay = new Map<string, number>();
    for (const a of bundle.auditEntries) {
      const day = a.createdAt.toISOString().split("T")[0];
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    for (const [day, count] of byDay) {
      parts.push(`- ${day}: ${count} action${count === 1 ? "" : "s"}`);
    }
  }

  return parts.join("\n");
}

/**
 * Format a coaching recipe as structured context for the Claude prompt.
 * The recipe library (`coaching-library.ts`) holds role- and
 * metric-specific diagnosis + talking points + root causes + training
 * resources. Surfacing these to Claude is the difference between
 * "generic sympathetic outline" and "specific, actionable coaching".
 */
function formatRecipeForPrompt(recipe: CoachingRecipe | null): string {
  if (!recipe) {
    return "## Coaching recipe\n- (no recipe catalogued for this metric — draft from first principles)";
  }
  const lines: string[] = [];
  lines.push("## Coaching recipe (authoritative guidance)");
  lines.push(`\n### Diagnosis\n${recipe.diagnosis}`);

  lines.push("\n### Coaching talking points");
  for (const pt of recipe.coachingTalkingPoints) {
    lines.push(`- ${pt}`);
  }

  lines.push("\n### Common root causes");
  for (const cause of recipe.commonRootCauses) {
    lines.push(`- ${cause}`);
  }

  lines.push("\n### Recommended action steps");
  for (const step of recipe.actionSteps) {
    lines.push(
      `- ${step.label} — ${step.description} (expected: ${step.expectedOutcome}; timeframe: ${step.timeframe})`,
    );
  }

  lines.push("\n### Training resources to mention by name");
  for (const res of recipe.trainingResources) {
    lines.push(`- ${res}`);
  }

  return lines.join("\n");
}

function pickExamples(bundle: ActivityBundle): Example[] {
  const examples: Example[] = [];

  // A stalled task
  const stalled = bundle.tasks.find(
    (t) =>
      t.status !== "completed" && t.dueDate && t.dueDate.getTime() < Date.now(),
  );
  if (stalled) {
    examples.push({
      caseId: stalled.caseId,
      eventDate: (stalled.dueDate ?? stalled.updatedAt)
        .toISOString()
        .split("T")[0],
      observation: `Task "${stalled.title}" is past due and not completed.`,
    });
  }

  // An outbound touchpoint worth naming (positive or neutral signal)
  const outbound = bundle.communications.find(
    (c) => c.direction === "outbound",
  );
  if (outbound) {
    examples.push({
      caseId: outbound.caseId,
      eventDate: outbound.createdAt.toISOString().split("T")[0],
      observation: `Outbound ${outbound.type}: ${outbound.subject ?? "(no subject)"}.`,
    });
  }

  // A recent stage transition (positive signal worth naming)
  if (bundle.stageTransitions.length > 0) {
    const s = bundle.stageTransitions[0];
    examples.push({
      caseId: s.caseId,
      eventDate: s.transitionedAt.toISOString().split("T")[0],
      observation: "Stage transition executed — acknowledge the positive.",
    });
  }

  return examples;
}

type LoadFlagResult = {
  flag: typeof coachingFlags.$inferSelect;
  subject: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
    organizationId: string;
  };
};

async function loadFlagAndSubject(
  flagId: string,
): Promise<LoadFlagResult | null> {
  const [flag] = await db
    .select()
    .from(coachingFlags)
    .where(eq(coachingFlags.id, flagId))
    .limit(1);
  if (!flag) return null;

  const [subject] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      organizationId: users.organizationId,
    })
    .from(users)
    .where(eq(users.id, flag.subjectUserId))
    .limit(1);
  if (!subject) return null;

  return { flag, subject };
}

export type DraftCoachingInput = {
  flagId: string;
};

export type DraftCoachingOutput = {
  draftId: string | null;
  error?: string;
};

/**
 * CC-2. Draft a coaching conversation outline for the supervisor.
 */
export async function draftCoachingConversation(
  input: DraftCoachingInput,
): Promise<DraftCoachingOutput> {
  try {
    const loaded = await loadFlagAndSubject(input.flagId);
    if (!loaded) return { draftId: null, error: "Flag not found" };
    const { flag, subject } = loaded;

    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const bundle = await loadActivityBundle(
      subject.id,
      subject.organizationId,
      since,
    );

    const pack = getRoleMetricPack(subject.role);
    const metric = pack.metrics.find((m) => m.metricKey === flag.metricKey);
    const recipe = getRecipe(subject.role, flag.metricKey);

    const prompt = `${SYSTEM_INTRO}

Context:
- Subject: ${subject.firstName} ${subject.lastName} (${pack.label})
- Flagged metric: ${metric?.label ?? flag.metricKey}
- Flag summary: ${flag.summary}
- Classification: ${flag.classification ?? "unclear"}

${formatRecipeForPrompt(recipe)}

Activity bundle:
${formatActivityForPrompt(bundle)}

Task: Draft a coaching conversation outline that includes:
1. An opening that acknowledges the person and the data
2. 2-3 specific examples pulled from the activity bundle (with dates)
3. A proposed improvement plan that weaves in the recipe's action steps and training resources by name (not generic advice)
4. Two open questions for the coachee to answer — ideally pulled from the recipe's talking points or root causes

Lean heavily on the coaching recipe above — it contains the authoritative diagnosis, talking points, and root causes for this specific metric. Reference specific resources from the recipe by name. Do NOT invent generic advice when the recipe has specific guidance.

Write it as a conversation outline a supervisor can follow live. Plain English, under 500 words.`;

    const body = await askClaude(prompt);
    const examples = pickExamples(bundle);

    const [row] = await db
      .insert(coachingDrafts)
      .values({
        organizationId: subject.organizationId,
        coachingFlagId: flag.id,
        subjectUserId: subject.id,
        supervisorUserId: flag.supervisorUserId ?? subject.id, // fall back to subject if nothing else
        title: `Coaching conversation: ${subject.firstName} ${subject.lastName} — ${metric?.label ?? flag.metricKey}`,
        body,
        examples,
        model: MODEL_ID,
      })
      .returning({ id: coachingDrafts.id });

    return { draftId: row.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("coaching: draftCoachingConversation failed", {
      flagId: input.flagId,
      error: message,
    });
    return { draftId: null, error: message };
  }
}

/**
 * CC-4. Draft a phone-call-ready script for the supervisor to read from.
 * Persisted to `aiDrafts` with type `coaching_conversation` since it's
 * a script rather than a conversation outline.
 */
export async function draftCoachingCallScript(
  input: DraftCoachingInput,
): Promise<DraftCoachingOutput> {
  try {
    const loaded = await loadFlagAndSubject(input.flagId);
    if (!loaded) return { draftId: null, error: "Flag not found" };
    const { flag, subject } = loaded;

    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const bundle = await loadActivityBundle(
      subject.id,
      subject.organizationId,
      since,
    );

    const pack = getRoleMetricPack(subject.role);
    const metric = pack.metrics.find((m) => m.metricKey === flag.metricKey);
    const recipe = getRecipe(subject.role, flag.metricKey);

    const prompt = `${SYSTEM_INTRO}

Context:
- Subject: ${subject.firstName} ${subject.lastName} (${pack.label})
- Flagged metric: ${metric?.label ?? flag.metricKey}
- Flag summary: ${flag.summary}

${formatRecipeForPrompt(recipe)}

Activity bundle:
${formatActivityForPrompt(bundle)}

Task: Draft a phone call script the supervisor can read aloud. Include:
- A warm opener (by name)
- Exact words to use for the hard part — lift language directly from the recipe's coaching talking points
- 2 specific examples with dates and case references from the activity bundle
- A scripted improvement-plan offer that names specific action steps from the recipe by label
- A closing that commits to a follow-up in 1 week and points at a specific training resource from the recipe

Lean heavily on the coaching recipe above. The whole point of this script is to deliver the recipe's guidance in natural phone-call language. Reference specific resources by name. Do NOT write generic coaching phrases when the recipe has specific language.

Write it as a literal script with speaker labels ("Supervisor:") and no stage directions other than [pause]. Under 500 words.`;

    const body = await askClaude(prompt);

    const [row] = await db
      .insert(aiDrafts)
      .values({
        organizationId: subject.organizationId,
        caseId: null,
        type: "coaching_conversation",
        status: "draft_ready",
        assignedReviewerId: flag.supervisorUserId ?? null,
        title: `Coaching call script: ${subject.firstName} ${subject.lastName}`,
        body,
        structuredFields: {
          flagId: flag.id,
          subjectUserId: subject.id,
          metricKey: flag.metricKey,
        },
        promptVersion: "cc4-2026-04-10",
        model: MODEL_ID,
      })
      .returning({ id: aiDrafts.id });

    return { draftId: row.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("coaching: draftCoachingCallScript failed", {
      flagId: input.flagId,
      error: message,
    });
    return { draftId: null, error: message };
  }
}
