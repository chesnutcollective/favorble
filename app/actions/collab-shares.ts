"use server";

import { randomBytes, createHash } from "node:crypto";
import { db } from "@/db/drizzle";
import {
  collabShares,
  collabShareRecipients,
  collabShareMessages,
  documents,
  documentShares,
  users,
  cases,
  caseStages,
  caseStageGroups,
  caseAssignments,
  caseContacts,
  contacts,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq, and, isNull, desc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger/server";
import { logPhiAccess, logPhiModification } from "@/lib/services/hipaa-audit";

/** Roles permitted to mint/revoke collaborator shares. */
const INVITE_ROLES = new Set([
  "admin",
  "attorney",
  "case_manager",
  "medical_records",
]);

/** Roles permitted for `collab_share_recipients.role`. */
const RECIPIENT_ROLES = new Set([
  "medical_provider",
  "family",
  "legal_counsel",
  "other",
]);

function requireInviteRole(role: string) {
  if (!INVITE_ROLES.has(role)) {
    throw new Error("Not authorized to manage collaborator shares");
  }
}

/** SHA-256 hash of a raw token; what we store at rest. */
function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Generate a 32-byte hex token for use in magic links. */
function mintToken(): string {
  return randomBytes(32).toString("hex");
}

type CreateShareInput = {
  caseId: string;
  subject: string;
  message?: string;
  expiryDays: number;
  recipients: Array<{
    email: string;
    name?: string;
    role?: string; // medical_provider | family | legal_counsel | other
  }>;
  documentIds: string[];
};

export type CreateShareResult = {
  shareId: string;
  token: string; // raw token — only returned here, never stored plaintext
  url: string;
};

/**
 * Create a collaborator share scoped to a single case. Caller must be admin,
 * attorney, case_manager, or medical_records.
 *
 * Returns the raw token once so the firm can copy/paste the magic link if
 * outbound email isn't wired up yet — identical to `sendPortalInvite`.
 */
export async function createCollaboratorShare(
  input: CreateShareInput,
): Promise<CreateShareResult> {
  const session = await requireSession();
  requireInviteRole(session.role);

  if (!input.caseId) throw new Error("caseId is required");
  if (!input.subject?.trim()) throw new Error("subject is required");
  if (!Array.isArray(input.recipients) || input.recipients.length === 0) {
    throw new Error("at least one recipient is required");
  }

  const expiryDays = Math.min(
    Math.max(Math.floor(input.expiryDays ?? 30), 1),
    180,
  );
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  const token = mintToken();
  const tokenHash = hashToken(token);

  const [share] = await db
    .insert(collabShares)
    .values({
      organizationId: session.organizationId,
      caseId: input.caseId,
      subject: input.subject.trim(),
      message: input.message?.trim() || null,
      tokenHash,
      expiresAt,
      createdBy: session.id,
    })
    .returning();

  if (!share) throw new Error("Failed to create collaborator share");

  // Recipients
  const recipientRows = input.recipients
    .map((r) => {
      const email = r.email?.trim().toLowerCase();
      if (!email) return null;
      const role =
        r.role && RECIPIENT_ROLES.has(r.role) ? r.role : "other";
      return {
        shareId: share.id,
        email,
        name: r.name?.trim() || null,
        role,
      };
    })
    .filter(
      (x): x is { shareId: string; email: string; name: string | null; role: string } =>
        x !== null,
    );

  if (recipientRows.length === 0) {
    throw new Error("at least one valid recipient email is required");
  }

  await db.insert(collabShareRecipients).values(recipientRows);

  // Document scoping — only docs that actually belong to this case + org
  if (input.documentIds.length > 0) {
    const validDocs = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          inArray(documents.id, input.documentIds),
          eq(documents.caseId, input.caseId),
          eq(documents.organizationId, session.organizationId),
          isNull(documents.deletedAt),
        ),
      );

    if (validDocs.length > 0) {
      await db.insert(documentShares).values(
        validDocs.map((d) => ({
          organizationId: session.organizationId,
          documentId: d.id,
          caseId: input.caseId,
          collabShareId: share.id,
          createdBy: session.id,
        })),
      );
    }
  }

  // HIPAA audit — creating a share grants outside access to PHI.
  await logPhiModification({
    organizationId: session.organizationId,
    userId: session.id,
    entityType: "collab_share",
    entityId: share.id,
    caseId: input.caseId,
    operation: "create",
    metadata: {
      recipientCount: recipientRows.length,
      documentCount: input.documentIds.length,
      expiresAt: expiresAt.toISOString(),
    },
    action: "collab_share.create",
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const url = `${baseUrl.replace(/\/$/, "")}/collab/${token}`;

  logger.info("Collaborator share created", {
    shareId: share.id,
    caseId: input.caseId,
    recipientCount: recipientRows.length,
  });

  revalidatePath(`/cases/${input.caseId}`);

  return {
    shareId: share.id,
    token,
    url,
  };
}

/** Revoke a share. Idempotent — already-revoked returns the existing row. */
export async function revokeCollaboratorShare(shareId: string) {
  const session = await requireSession();
  requireInviteRole(session.role);

  const [share] = await db
    .select({
      id: collabShares.id,
      caseId: collabShares.caseId,
      organizationId: collabShares.organizationId,
      revokedAt: collabShares.revokedAt,
    })
    .from(collabShares)
    .where(
      and(
        eq(collabShares.id, shareId),
        eq(collabShares.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!share) throw new Error("Share not found");

  if (share.revokedAt) {
    // Idempotent — nothing to do.
    return { shareId: share.id, alreadyRevoked: true };
  }

  const now = new Date();
  await db
    .update(collabShares)
    .set({ revokedAt: now, revokedBy: session.id })
    .where(eq(collabShares.id, shareId));

  await logPhiModification({
    organizationId: session.organizationId,
    userId: session.id,
    entityType: "collab_share",
    entityId: shareId,
    caseId: share.caseId,
    operation: "update",
    metadata: { revokedAt: now.toISOString() },
    action: "collab_share.revoke",
  });

  logger.info("Collaborator share revoked", { shareId });
  revalidatePath(`/cases/${share.caseId}`);

  return { shareId: share.id, alreadyRevoked: false };
}

/** Mark a single inbound collab message as read by the firm. */
export async function markCollabMessageRead(messageId: string) {
  const session = await requireSession();
  requireInviteRole(session.role);

  const [msg] = await db
    .select({
      id: collabShareMessages.id,
      shareId: collabShareMessages.shareId,
      readByFirmAt: collabShareMessages.readByFirmAt,
    })
    .from(collabShareMessages)
    .innerJoin(
      collabShares,
      eq(collabShareMessages.shareId, collabShares.id),
    )
    .where(
      and(
        eq(collabShareMessages.id, messageId),
        eq(collabShares.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!msg) throw new Error("Message not found");
  if (msg.readByFirmAt) return { messageId, alreadyRead: true };

  await db
    .update(collabShareMessages)
    .set({ readByFirmAt: new Date() })
    .where(eq(collabShareMessages.id, messageId));

  return { messageId, alreadyRead: false };
}

/**
 * Shape returned to the firm-side "Shares" list on the case detail page.
 */
export type CollabShareSummary = {
  id: string;
  subject: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  createdByName: string | null;
  recipients: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string | null;
    viewedAt: Date | null;
    respondedAt: Date | null;
  }>;
  viewCount: number;
  documentCount: number;
  unreadMessageCount: number;
};

/** List all collab shares attached to a case, active + revoked. */
export async function listCollaboratorShares(
  caseId: string,
): Promise<CollabShareSummary[]> {
  const session = await requireSession();

  const shares = await db
    .select({
      id: collabShares.id,
      subject: collabShares.subject,
      createdAt: collabShares.createdAt,
      expiresAt: collabShares.expiresAt,
      revokedAt: collabShares.revokedAt,
      createdById: collabShares.createdBy,
    })
    .from(collabShares)
    .where(
      and(
        eq(collabShares.caseId, caseId),
        eq(collabShares.organizationId, session.organizationId),
      ),
    )
    .orderBy(desc(collabShares.createdAt));

  if (shares.length === 0) return [];

  const shareIds = shares.map((s) => s.id);
  const creatorIds = Array.from(new Set(shares.map((s) => s.createdById)));

  const [recipients, docCounts, unreadCounts, creators] = await Promise.all([
    db
      .select({
        id: collabShareRecipients.id,
        shareId: collabShareRecipients.shareId,
        email: collabShareRecipients.email,
        name: collabShareRecipients.name,
        role: collabShareRecipients.role,
        viewedAt: collabShareRecipients.viewedAt,
        respondedAt: collabShareRecipients.respondedAt,
      })
      .from(collabShareRecipients)
      .where(inArray(collabShareRecipients.shareId, shareIds)),
    db
      .select({
        shareId: documentShares.collabShareId,
        id: documentShares.id,
      })
      .from(documentShares)
      .where(inArray(documentShares.collabShareId, shareIds)),
    db
      .select({
        shareId: collabShareMessages.shareId,
        id: collabShareMessages.id,
      })
      .from(collabShareMessages)
      .where(
        and(
          inArray(collabShareMessages.shareId, shareIds),
          isNull(collabShareMessages.readByFirmAt),
        ),
      ),
    db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(inArray(users.id, creatorIds)),
  ]);

  const recipientsByShare = new Map<string, CollabShareSummary["recipients"]>();
  for (const r of recipients) {
    if (!recipientsByShare.has(r.shareId)) recipientsByShare.set(r.shareId, []);
    recipientsByShare.get(r.shareId)!.push({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      viewedAt: r.viewedAt,
      respondedAt: r.respondedAt,
    });
  }

  const docCountByShare = new Map<string, number>();
  for (const d of docCounts) {
    if (!d.shareId) continue;
    docCountByShare.set(d.shareId, (docCountByShare.get(d.shareId) ?? 0) + 1);
  }
  const unreadByShare = new Map<string, number>();
  for (const m of unreadCounts) {
    unreadByShare.set(m.shareId, (unreadByShare.get(m.shareId) ?? 0) + 1);
  }
  const creatorById = new Map(
    creators.map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
  );

  return shares.map((s) => {
    const shareRecipients = recipientsByShare.get(s.id) ?? [];
    const viewCount = shareRecipients.filter((r) => r.viewedAt).length;
    return {
      id: s.id,
      subject: s.subject,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
      createdByName: creatorById.get(s.createdById) ?? null,
      recipients: shareRecipients,
      viewCount,
      documentCount: docCountByShare.get(s.id) ?? 0,
      unreadMessageCount: unreadByShare.get(s.id) ?? 0,
    };
  });
}

/**
 * Public-route helper: resolve a raw token → share + context. Returns null
 * on unknown token (404), `{ gone: true }` on revoked/expired share (410).
 * Never leaks anything beyond what's on the public collab page.
 */
export type CollabPublicView = {
  share: {
    id: string;
    subject: string;
    message: string | null;
    expiresAt: Date;
    organizationId: string;
  };
  case: {
    id: string;
    caseNumber: string;
    claimantFirstName: string | null;
    claimantLastInitial: string | null;
    stageName: string | null;
    stageClientVisibleName: string | null;
    referringAttorneyName: string | null;
    referringAttorneyEmail: string | null;
    referringAttorneyPhone: string | null;
  };
  recipients: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string | null;
    viewedAt: Date | null;
    respondedAt: Date | null;
  }>;
  documents: Array<{
    id: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: number | null;
    createdAt: Date;
  }>;
  messages: Array<{
    id: string;
    fromEmail: string;
    fromName: string | null;
    body: string;
    createdAt: Date;
    fromFirm: boolean;
  }>;
};

export type CollabResolveResult =
  | { ok: true; view: CollabPublicView }
  | { ok: false; reason: "not_found" | "gone" };

export async function resolveCollabTokenPublic(
  rawToken: string,
): Promise<CollabResolveResult> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 16) {
    return { ok: false, reason: "not_found" };
  }

  const tokenHash = hashToken(rawToken);

  const [share] = await db
    .select({
      id: collabShares.id,
      subject: collabShares.subject,
      message: collabShares.message,
      expiresAt: collabShares.expiresAt,
      revokedAt: collabShares.revokedAt,
      organizationId: collabShares.organizationId,
      caseId: collabShares.caseId,
    })
    .from(collabShares)
    .where(eq(collabShares.tokenHash, tokenHash))
    .limit(1);

  if (!share) return { ok: false, reason: "not_found" };
  if (share.revokedAt) return { ok: false, reason: "gone" };
  if (share.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "gone" };
  }

  // Case basics
  const [caseRow] = await db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
      stageName: caseStages.name,
      stageClientVisibleName: caseStageGroups.clientVisibleName,
    })
    .from(cases)
    .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
    .leftJoin(caseStageGroups, eq(caseStages.stageGroupId, caseStageGroups.id))
    .where(eq(cases.id, share.caseId))
    .limit(1);

  // Primary claimant contact (first name + last initial only)
  const [claimant] = await db
    .select({
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(caseContacts)
    .innerJoin(contacts, eq(caseContacts.contactId, contacts.id))
    .where(
      and(
        eq(caseContacts.caseId, share.caseId),
        eq(caseContacts.isPrimary, true),
        eq(caseContacts.relationship, "claimant"),
      ),
    )
    .limit(1);

  // Referring attorney — first primary-assigned user with role "attorney".
  const [referring] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(caseAssignments)
    .innerJoin(users, eq(caseAssignments.userId, users.id))
    .where(
      and(
        eq(caseAssignments.caseId, share.caseId),
        eq(users.role, "attorney"),
        isNull(caseAssignments.unassignedAt),
      ),
    )
    .limit(1);

  // Shared docs
  const sharedDocs = await db
    .select({
      id: documents.id,
      fileName: documents.fileName,
      fileType: documents.fileType,
      fileSizeBytes: documents.fileSizeBytes,
      createdAt: documents.createdAt,
    })
    .from(documentShares)
    .innerJoin(documents, eq(documentShares.documentId, documents.id))
    .where(
      and(
        eq(documentShares.collabShareId, share.id),
        isNull(documentShares.revokedAt),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(documents.createdAt));

  // Messages — firm-side senders are users at this org; their email matches
  // `users.email` for this organization. Anything else is considered external.
  const messages = await db
    .select({
      id: collabShareMessages.id,
      fromEmail: collabShareMessages.fromEmail,
      fromName: collabShareMessages.fromName,
      body: collabShareMessages.body,
      createdAt: collabShareMessages.createdAt,
    })
    .from(collabShareMessages)
    .where(eq(collabShareMessages.shareId, share.id))
    .orderBy(collabShareMessages.createdAt);

  const firmEmails = new Set(
    (
      await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.organizationId, share.organizationId))
    ).map((u) => u.email.toLowerCase()),
  );

  const recipients = await db
    .select({
      id: collabShareRecipients.id,
      email: collabShareRecipients.email,
      name: collabShareRecipients.name,
      role: collabShareRecipients.role,
      viewedAt: collabShareRecipients.viewedAt,
      respondedAt: collabShareRecipients.respondedAt,
    })
    .from(collabShareRecipients)
    .where(eq(collabShareRecipients.shareId, share.id));

  return {
    ok: true,
    view: {
      share: {
        id: share.id,
        subject: share.subject,
        message: share.message,
        expiresAt: share.expiresAt,
        organizationId: share.organizationId,
      },
      case: {
        id: share.caseId,
        caseNumber: caseRow?.caseNumber ?? "",
        claimantFirstName: claimant?.firstName ?? null,
        claimantLastInitial: claimant?.lastName
          ? claimant.lastName.charAt(0).toUpperCase()
          : null,
        stageName: caseRow?.stageName ?? null,
        stageClientVisibleName: caseRow?.stageClientVisibleName ?? null,
        referringAttorneyName: referring
          ? `${referring.firstName} ${referring.lastName}`
          : null,
        referringAttorneyEmail: referring?.email ?? null,
        referringAttorneyPhone: null,
      },
      recipients,
      documents: sharedDocs,
      messages: messages.map((m) => ({
        ...m,
        fromFirm: firmEmails.has(m.fromEmail.toLowerCase()),
      })),
    },
  };
}

/**
 * Mark a recipient's `viewedAt` stamp on the first page load and write an
 * audit row. Called from the public route.
 */
export async function stampCollabFirstView(rawToken: string, requestEmail?: string | null) {
  const tokenHash = hashToken(rawToken);
  const [share] = await db
    .select({
      id: collabShares.id,
      caseId: collabShares.caseId,
      organizationId: collabShares.organizationId,
    })
    .from(collabShares)
    .where(eq(collabShares.tokenHash, tokenHash))
    .limit(1);
  if (!share) return;

  // Stamp the first unseen recipient (or every recipient if we don't know
  // which link this is — we only get one token per share, shared by all).
  const email = requestEmail?.trim().toLowerCase();
  if (email) {
    await db
      .update(collabShareRecipients)
      .set({ viewedAt: new Date() })
      .where(
        and(
          eq(collabShareRecipients.shareId, share.id),
          eq(collabShareRecipients.email, email),
          isNull(collabShareRecipients.viewedAt),
        ),
      );
  } else {
    await db
      .update(collabShareRecipients)
      .set({ viewedAt: new Date() })
      .where(
        and(
          eq(collabShareRecipients.shareId, share.id),
          isNull(collabShareRecipients.viewedAt),
        ),
      );
  }

  await logPhiAccess({
    organizationId: share.organizationId,
    userId: null,
    entityType: "collab_share",
    entityId: share.id,
    caseId: share.caseId,
    reason: "external collaborator first-view",
    metadata: { email: email ?? null },
    action: "collab_share.view",
  });
}

/**
 * Public-route endpoint for posting a message from an external collaborator.
 */
export async function postCollabMessagePublic(params: {
  token: string;
  fromEmail: string;
  fromName?: string | null;
  body: string;
}) {
  const { token, fromEmail, fromName, body } = params;
  if (!body?.trim()) throw new Error("Message body required");
  if (!fromEmail?.trim()) throw new Error("Email required");

  const tokenHash = hashToken(token);
  const [share] = await db
    .select({
      id: collabShares.id,
      caseId: collabShares.caseId,
      organizationId: collabShares.organizationId,
      revokedAt: collabShares.revokedAt,
      expiresAt: collabShares.expiresAt,
    })
    .from(collabShares)
    .where(eq(collabShares.tokenHash, tokenHash))
    .limit(1);

  if (!share) throw new Error("Invalid share");
  if (share.revokedAt || share.expiresAt.getTime() < Date.now()) {
    throw new Error("Share is no longer active");
  }

  const [msg] = await db
    .insert(collabShareMessages)
    .values({
      shareId: share.id,
      fromEmail: fromEmail.trim().toLowerCase(),
      fromName: fromName?.trim() || null,
      body: body.trim(),
    })
    .returning();

  await logPhiModification({
    organizationId: share.organizationId,
    userId: null,
    entityType: "collab_share_message",
    entityId: msg.id,
    caseId: share.caseId,
    operation: "create",
    metadata: { direction: "inbound", fromEmail: fromEmail.toLowerCase() },
    action: "collab_share.message_inbound",
  });

  return { messageId: msg.id };
}

/**
 * Firm-side post: sends a message on a collab share thread from a logged-in
 * user. Enforces invite-roles so only folks who could manage the share can
 * reply.
 */
export async function postCollabMessageFromFirm(params: {
  shareId: string;
  body: string;
}) {
  const session = await requireSession();
  requireInviteRole(session.role);

  if (!params.body?.trim()) throw new Error("Message body required");

  const [share] = await db
    .select({
      id: collabShares.id,
      caseId: collabShares.caseId,
      organizationId: collabShares.organizationId,
      revokedAt: collabShares.revokedAt,
    })
    .from(collabShares)
    .where(
      and(
        eq(collabShares.id, params.shareId),
        eq(collabShares.organizationId, session.organizationId),
      ),
    )
    .limit(1);

  if (!share) throw new Error("Share not found");
  if (share.revokedAt) throw new Error("Share is revoked");

  const [msg] = await db
    .insert(collabShareMessages)
    .values({
      shareId: share.id,
      fromEmail: session.email,
      fromName: `${session.firstName} ${session.lastName}`,
      body: params.body.trim(),
      readByFirmAt: new Date(), // outbound; no "read by firm" state
    })
    .returning();

  await logPhiModification({
    organizationId: session.organizationId,
    userId: session.id,
    entityType: "collab_share_message",
    entityId: msg.id,
    caseId: share.caseId,
    operation: "create",
    metadata: { direction: "outbound" },
    action: "collab_share.message_outbound",
  });

  revalidatePath(`/cases/${share.caseId}`);
  return { messageId: msg.id };
}

/**
 * Public-route "Decline further contact": stamps the recipient and revokes
 * the share so no future views are possible.
 */
export async function declineCollabSharePublic(params: {
  token: string;
  email?: string | null;
}) {
  const tokenHash = hashToken(params.token);
  const [share] = await db
    .select({
      id: collabShares.id,
      caseId: collabShares.caseId,
      organizationId: collabShares.organizationId,
      revokedAt: collabShares.revokedAt,
    })
    .from(collabShares)
    .where(eq(collabShares.tokenHash, tokenHash))
    .limit(1);

  if (!share) throw new Error("Invalid share");
  if (share.revokedAt) return { alreadyRevoked: true };

  const now = new Date();
  const email = params.email?.trim().toLowerCase();
  if (email) {
    await db
      .update(collabShareRecipients)
      .set({ respondedAt: now })
      .where(
        and(
          eq(collabShareRecipients.shareId, share.id),
          eq(collabShareRecipients.email, email),
        ),
      );
  } else {
    await db
      .update(collabShareRecipients)
      .set({ respondedAt: now })
      .where(eq(collabShareRecipients.shareId, share.id));
  }

  await db
    .update(collabShares)
    .set({ revokedAt: now })
    .where(eq(collabShares.id, share.id));

  await logPhiModification({
    organizationId: share.organizationId,
    userId: null,
    entityType: "collab_share",
    entityId: share.id,
    caseId: share.caseId,
    operation: "update",
    metadata: { declinedBy: email ?? null },
    action: "collab_share.decline",
  });

  return { alreadyRevoked: false };
}
