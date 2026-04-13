"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { getEffectivePersona } from "@/lib/personas/effective-persona";
import { logger } from "@/lib/logger/server";
import {
  createFeedback,
  updateFeedbackStatus,
  bulkUpdateFeedbackStatus,
  deleteFeedback,
  getFeedbackList,
} from "./service";
import { generateExportToken } from "./export-token";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  type FeedbackCategory,
  type FeedbackStatus,
} from "./constants";

const submitSchema = z.object({
  message: z.string().trim().min(1).max(10000),
  category: z.enum(FEEDBACK_CATEGORIES),
  pageUrl: z.string().max(2000).optional(),
  pageTitle: z.string().max(500).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export type SubmitFeedbackInput = z.infer<typeof submitSchema>;

export async function submitFeedbackAction(
  input: SubmitFeedbackInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const session = await requireSession();
  if (session.role !== "admin") {
    return { success: false, error: "Only super admins can submit feedback" };
  }

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid feedback payload" };
  }

  // Stamp persona / viewing-as context server-side so it can't be spoofed.
  const persona = await getEffectivePersona();
  const mergedContext: Record<string, unknown> = { ...(parsed.data.context ?? {}) };
  if (persona) {
    mergedContext.persona = {
      actorPersonaId: persona.actorPersonaId,
      effectivePersonaId: persona.personaId,
      isViewingAs: persona.isViewingAs,
      personaLabel: persona.config.label,
    };
  }

  try {
    const row = await createFeedback({
      organizationId: session.organizationId,
      userId: session.id,
      userEmail: session.email,
      userName:
        `${session.firstName ?? ""} ${session.lastName ?? ""}`.trim() || null,
      message: parsed.data.message,
      category: parsed.data.category as FeedbackCategory,
      pageUrl: parsed.data.pageUrl ?? null,
      pageTitle: parsed.data.pageTitle ?? null,
      context: mergedContext,
    });
    logger.info("Feedback submitted", {
      id: row.id,
      category: row.category,
      userId: session.id,
    });
    revalidatePath("/admin/feedback");
    return { success: true, id: row.id };
  } catch (err) {
    logger.error("Feedback submit failed", { error: err });
    return { success: false, error: "Could not save feedback" };
  }
}

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(FEEDBACK_STATUSES).optional(),
  adminNotes: z.string().max(10000).nullable().optional(),
  resolvedLink: z.string().max(2000).nullable().optional(),
});

export async function updateFeedbackAction(
  input: z.infer<typeof updateSchema>,
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  if (session.role !== "admin") {
    return { success: false, error: "Only super admins can update feedback" };
  }

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid update payload" };
  }

  const row = await updateFeedbackStatus({
    organizationId: session.organizationId,
    id: parsed.data.id,
    status: parsed.data.status as FeedbackStatus | undefined,
    adminNotes: parsed.data.adminNotes,
    resolvedLink: parsed.data.resolvedLink,
    source: "admin",
  });

  if (!row) return { success: false, error: "Feedback not found" };

  revalidatePath("/admin/feedback");
  return { success: true };
}

export type { FeedbackStats } from "./service";

const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  status: z.enum(FEEDBACK_STATUSES),
});

export async function bulkUpdateFeedbackAction(
  input: z.infer<typeof bulkSchema>,
): Promise<{ success: boolean; updated?: number; error?: string }> {
  const session = await requireSession();
  if (session.role !== "admin") {
    return { success: false, error: "Only super admins can update feedback" };
  }

  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid bulk update payload" };
  }

  const updated = await bulkUpdateFeedbackStatus({
    organizationId: session.organizationId,
    ids: parsed.data.ids,
    status: parsed.data.status as FeedbackStatus,
    source: "admin",
  });

  revalidatePath("/admin/feedback");
  return { success: true, updated };
}

const deleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export async function deleteFeedbackAction(
  input: z.infer<typeof deleteSchema>,
): Promise<{ success: boolean; deleted?: number; error?: string }> {
  const session = await requireSession();
  if (session.role !== "admin") {
    return { success: false, error: "Only super admins can delete feedback" };
  }

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid delete payload" };
  }

  const deleted = await deleteFeedback({
    organizationId: session.organizationId,
    ids: parsed.data.ids,
  });

  revalidatePath("/admin/feedback");
  return { success: true, deleted };
}

/**
 * Generate a fresh 48-hour export token for this org. The admin UI calls
 * this when "Export for Claude" is clicked — the token is embedded in the
 * generated prompt so Claude Code can call back to update statuses without
 * needing a Clerk session.
 */
export async function generateFeedbackExportTokenAction(): Promise<{
  success: boolean;
  token?: string;
  expiresAt?: number;
  error?: string;
}> {
  const session = await requireSession();
  if (session.role !== "admin") {
    return { success: false, error: "Forbidden" };
  }
  const token = generateExportToken(session.organizationId);
  return {
    success: true,
    token,
    expiresAt: Date.now() + 48 * 60 * 60 * 1000,
  };
}

/**
 * Build the "Export for Claude" markdown payload. Returns the prompt string
 * with embedded `[[feedback-export]]` blocks for every open item plus the
 * API token + endpoints for callbacks.
 */
export async function buildClaudeExportAction(input?: {
  includeStatuses?: FeedbackStatus[];
}): Promise<{
  success: boolean;
  prompt?: string;
  itemCount?: number;
  error?: string;
}> {
  const session = await requireSession();
  if (session.role !== "admin") {
    return { success: false, error: "Forbidden" };
  }

  const statuses = input?.includeStatuses ?? ["open"];
  const all = await getFeedbackList({
    organizationId: session.organizationId,
  });
  const items = all.filter((i) =>
    statuses.includes(i.status as FeedbackStatus),
  );

  const token = generateExportToken(session.organizationId);
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://staging-favorble.vercel.app";

  const blocks = items
    .map((item) => {
      const ctx = (item.context as Record<string, unknown> | null) ?? {};
      const trimmedCtx: Record<string, unknown> = { ...ctx };
      // Strip the screenshot base64 from the export — it bloats the prompt.
      // Triagers can open the admin UI for the visual.
      if (
        trimmedCtx.screenshot &&
        typeof trimmedCtx.screenshot === "object"
      ) {
        const s = trimmedCtx.screenshot as Record<string, unknown>;
        trimmedCtx.screenshot = {
          omitted: true,
          width: s.width,
          height: s.height,
        };
      }
      return [
        "[[feedback-export]]",
        `id: ${item.id}`,
        `category: ${item.category}`,
        `status: ${item.status}`,
        `submitted: ${item.createdAt.toISOString()}`,
        `from: ${item.userName ?? item.userEmail}`,
        item.pageUrl ? `page: ${item.pageUrl}` : null,
        "",
        "message:",
        item.message,
        "",
        "context:",
        JSON.stringify(trimmedCtx, null, 2),
        "[[/feedback-export]]",
      ]
        .filter((l) => l !== null)
        .join("\n");
    })
    .join("\n\n");

  const prompt = [
    "# Feedback triage",
    "",
    `${items.length} item(s) need triage. For each, investigate the issue, propose a fix, and update its status via the API.`,
    "",
    "## API",
    `- Base: ${baseUrl}`,
    `- Token (expires in 48h): ${token}`,
    "- Headers: `Authorization: Bearer <token>`",
    "",
    "### Update one item",
    "```",
    `POST ${baseUrl}/api/feedback/status`,
    'Body: { "itemId": "<uuid>", "status": "building", "link": "<PR url>", "notes": "<optional>" }',
    "```",
    "",
    "### Bulk update",
    "```",
    `POST ${baseUrl}/api/feedback/status`,
    'Body: { "items": [{ "itemId": "...", "status": "..." }, ...] }',
    "```",
    "",
    "### Promote a status (e.g. all staging → production)",
    "```",
    `POST ${baseUrl}/api/feedback/promote`,
    'Body: { "from": "staging", "to": "production" }',
    "```",
    "",
    "## Statuses",
    "`open | building | testing | staging | production | wont_fix`",
    "",
    "## Items",
    "",
    blocks,
  ].join("\n");

  return { success: true, prompt, itemCount: items.length };
}
