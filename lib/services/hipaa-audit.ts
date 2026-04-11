import "server-only";

import { db } from "@/db/drizzle";
import { auditLog } from "@/db/schema";
import { logger } from "@/lib/logger/server";

/**
 * HIPAA-focused audit helpers.
 *
 * All PHI access, modification, and AI extraction review events should flow
 * through one of these helpers so the audit trail is consistent and searchable.
 *
 * These writes are best-effort: a failure to persist an audit row must NEVER
 * break a user-facing request. We log the failure and move on.
 */

export type AuditSeverity = "info" | "warning" | "error";

/** Shared parameter bag – every HIPAA audit call must know who/what/where. */
type BaseParams = {
  organizationId: string;
  /** User performing the action. Null for system/background jobs. */
  userId: string | null;
  /** The entity type being touched ("case", "document", "medical_chronology_entry", …). */
  entityType: string;
  /** The UUID of the entity being touched. */
  entityId: string;
  severity?: AuditSeverity;
  ipAddress?: string | null;
};

/**
 * Read-side PHI access events (viewing a case, decrypting an SSN, pulling a
 * medical chronology, etc.). We intentionally record the fields that were
 * touched so auditors can answer "what did X see?".
 */
export type LogPhiAccessParams = BaseParams & {
  /** What PHI fields were read (e.g. ["ssnEncrypted", "dateOfBirth"]). */
  fieldsAccessed?: string[];
  /** Optional: the claimant case the PHI belongs to. */
  caseId?: string | null;
  /** Free-form reason, e.g. "case detail view" or "chronology export". */
  reason?: string;
  /** Extra metadata to merge into the audit row. */
  metadata?: Record<string, unknown>;
  /** Override action string (defaults to `phi_access`). */
  action?: string;
};

/** Write-side PHI events (creating/updating/deleting rows that contain PHI). */
export type LogPhiModificationParams = BaseParams & {
  operation: "create" | "update" | "delete";
  caseId?: string | null;
  /** Optional before/after snapshot for the modified fields. */
  changes?: { before?: unknown; after?: unknown } | Record<string, unknown>;
  metadata?: Record<string, unknown>;
  action?: string;
};

/** AI extraction review events (approve/reject/edit from the review queue). */
export type LogExtractionReviewParams = BaseParams & {
  /** What the reviewer did. */
  decision: "approve" | "reject" | "edit" | "bulk_approve" | "bulk_reject";
  caseId?: string | null;
  confidence?: number | null;
  reason?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Communication lifecycle events (message sent/received/read/draft approved).
 * Threaded into the case activity timeline so every touchpoint on a case is
 * recorded in one place. Feeds CM-5.
 */
export type LogCommunicationEventParams = {
  organizationId: string;
  /** Who caused the event. Null for inbound webhook events we didn't initiate. */
  actorUserId?: string | null;
  caseId: string;
  communicationId: string;
  direction: "inbound" | "outbound";
  /** e.g. "case_status", "email", "sms", "message", "phone". */
  method: string;
  /**
   * Override the action verb. Defaults to
   * `communication_received` / `communication_sent` based on direction.
   */
  action?:
    | "communication_received"
    | "communication_sent"
    | "communication_read"
    | "communication_draft_approved"
    | "communication_draft_rejected";
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
};

/** AI draft lifecycle events (create/approve/reject/send). */
export type LogAiDraftEventParams = {
  organizationId: string;
  actorUserId?: string | null;
  caseId?: string | null;
  draftId: string;
  draftType: string;
  action:
    | "ai_draft_created"
    | "ai_draft_updated"
    | "ai_draft_approved"
    | "ai_draft_rejected"
    | "ai_draft_sent"
    | "ai_draft_error";
  metadata?: Record<string, unknown>;
};

function serialize(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

async function insertAuditRow(row: {
  organizationId: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}) {
  try {
    await db.insert(auditLog).values({
      organizationId: row.organizationId,
      userId: row.userId ?? null,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      changes: row.changes ?? {},
      metadata: row.metadata ?? {},
      ipAddress: row.ipAddress ?? null,
    });
  } catch (error) {
    // Never throw from an audit helper – log and move on so the caller keeps
    // working. An unreachable audit table must not take down a user request.
    logger.error("HIPAA audit write failed", {
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      error,
    });
  }
}

/**
 * Log a read/view of PHI. Use the `action` override for specific events
 * (e.g. "phi_access.ssn_reveal"); otherwise defaults to "phi_access".
 */
export async function logPhiAccess(params: LogPhiAccessParams): Promise<void> {
  const severity = params.severity ?? "info";
  const metadata: Record<string, unknown> = {
    category: "phi_access",
    severity,
    fieldsAccessed: params.fieldsAccessed ?? [],
    caseId: params.caseId ?? null,
    reason: params.reason ?? null,
    ...(params.metadata ?? {}),
  };

  await insertAuditRow({
    organizationId: params.organizationId,
    userId: params.userId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action ?? "phi_access",
    metadata,
    ipAddress: params.ipAddress,
  });
}

/** Log a create/update/delete of PHI. */
export async function logPhiModification(
  params: LogPhiModificationParams,
): Promise<void> {
  const severity =
    params.severity ?? (params.operation === "delete" ? "warning" : "info");

  const metadata: Record<string, unknown> = {
    category: "phi_modification",
    severity,
    operation: params.operation,
    caseId: params.caseId ?? null,
    ...(params.metadata ?? {}),
  };

  const changes = params.changes ? serialize(params.changes) : {};

  await insertAuditRow({
    organizationId: params.organizationId,
    userId: params.userId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action ?? `phi_${params.operation}`,
    changes,
    metadata,
    ipAddress: params.ipAddress,
  });
}

/**
 * Log an AI extraction review decision. Called from the `ai-review` server
 * actions so we can reconstruct which human approved which AI output and why.
 */
export async function logExtractionReview(
  params: LogExtractionReviewParams,
): Promise<void> {
  const severity =
    params.severity ?? (params.decision === "reject" ? "warning" : "info");

  const metadata: Record<string, unknown> = {
    category: "ai_extraction_review",
    severity,
    decision: params.decision,
    caseId: params.caseId ?? null,
    confidence: params.confidence ?? null,
    reason: params.reason ?? null,
    ...(params.metadata ?? {}),
  };

  await insertAuditRow({
    organizationId: params.organizationId,
    userId: params.userId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: `ai_review_${params.decision}`,
    metadata,
    ipAddress: params.ipAddress,
  });
}

/**
 * Log a communication lifecycle event (inbound/outbound message, read, draft
 * approval, etc.). Writes to the audit log with the communication row as the
 * entity so the case activity timeline can thread it next to stage
 * transitions, notes, and tasks.
 *
 * Best-effort — the audit helper swallows errors so communication flows
 * never get blocked.
 */
export async function logCommunicationEvent(
  params: LogCommunicationEventParams,
): Promise<void> {
  const action =
    params.action ??
    (params.direction === "inbound"
      ? "communication_received"
      : "communication_sent");

  const metadata: Record<string, unknown> = {
    category: "communication",
    direction: params.direction,
    method: params.method,
    caseId: params.caseId,
    ...(params.metadata ?? {}),
  };

  await insertAuditRow({
    organizationId: params.organizationId,
    userId: params.actorUserId ?? null,
    entityType: "communication",
    entityId: params.communicationId,
    action,
    metadata,
    ipAddress: params.ipAddress,
  });
}

/**
 * Log an AI draft lifecycle event. Writes with the draft row as the entity
 * so reviewers can reconstruct who generated / edited / approved each draft.
 */
export async function logAiDraftEvent(
  params: LogAiDraftEventParams,
): Promise<void> {
  const metadata: Record<string, unknown> = {
    category: "ai_draft",
    draftType: params.draftType,
    caseId: params.caseId ?? null,
    ...(params.metadata ?? {}),
  };

  await insertAuditRow({
    organizationId: params.organizationId,
    userId: params.actorUserId ?? null,
    entityType: "ai_draft",
    entityId: params.draftId,
    action: params.action,
    metadata,
  });
}

/**
 * Simple in-memory debounce for noisy read-side audit events. Callers pass a
 * stable key (e.g. `${userId}:${entityId}:${reason}`) and we suppress repeats
 * within the window. This keeps routine list views from flooding the audit
 * table while still capturing meaningful access.
 */
const DEBOUNCE_WINDOW_MS = 60_000;
const debounceCache = new Map<string, number>();

export function shouldAudit(key: string, windowMs = DEBOUNCE_WINDOW_MS): boolean {
  const now = Date.now();
  const last = debounceCache.get(key);
  if (last && now - last < windowMs) {
    return false;
  }
  debounceCache.set(key, now);
  // Periodic cleanup so the map doesn't grow unbounded.
  if (debounceCache.size > 5000) {
    for (const [k, t] of debounceCache.entries()) {
      if (now - t > windowMs * 2) debounceCache.delete(k);
    }
  }
  return true;
}
