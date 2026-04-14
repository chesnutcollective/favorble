"use server";

import { db } from "@/db/drizzle";
import {
  aiDrafts,
  appealsCouncilBriefs,
  cases,
  contacts,
  caseContacts,
  hearingOutcomes,
  leads,
  users,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, asc, desc, eq, isNull, isNotNull } from "drizzle-orm";
import { logger } from "@/lib/logger/server";
import { revalidatePath } from "next/cache";
import {
  logAiDraftEvent,
  logPhiModification,
} from "@/lib/services/hipaa-audit";

/**
 * Appeals Council workspace server actions.
 *
 * Feeds the `/appeals-council` page: a status-bucketed view of the AC
 * brief pipeline (pending → drafting → in_review → filed → decided).
 */

export type AcBriefStatus =
  | "pending"
  | "drafting"
  | "in_review"
  | "filed"
  | "granted"
  | "denied"
  | "remanded";

export type AcBriefRow = {
  id: string;
  status: AcBriefStatus;
  caseId: string;
  caseNumber: string;
  claimantName: string;
  unfavorableDecisionDate: string | null;
  deadlineDate: string | null;
  filedAt: string | null;
  outcome: string | null;
  daysRemaining: number | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  notes: string | null;
};

export type AcBriefWorkspace = {
  pending: AcBriefRow[];
  drafting: AcBriefRow[];
  inReview: AcBriefRow[];
  filed: AcBriefRow[];
  decided: AcBriefRow[];
  counts: {
    pending: number;
    drafting: number;
    inReview: number;
    filed: number;
    decided: number;
  };
};

/**
 * Load all AC briefs for the org bucketed by pipeline status, with
 * days-remaining derived from `deadlineDate`.
 */
export async function getAppealsCouncilBriefs(): Promise<AcBriefWorkspace> {
  const session = await requireSession();

  try {
    const rows = await db
      .select({
        id: appealsCouncilBriefs.id,
        status: appealsCouncilBriefs.status,
        caseId: appealsCouncilBriefs.caseId,
        caseNumber: cases.caseNumber,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
        unfavorableDecisionDate: appealsCouncilBriefs.unfavorableDecisionDate,
        deadlineDate: appealsCouncilBriefs.deadlineDate,
        filedAt: appealsCouncilBriefs.filedAt,
        outcome: appealsCouncilBriefs.outcome,
        assignedUserId: appealsCouncilBriefs.assignedToId,
        assignedFirstName: users.firstName,
        assignedLastName: users.lastName,
        notes: appealsCouncilBriefs.notes,
      })
      .from(appealsCouncilBriefs)
      .leftJoin(cases, eq(appealsCouncilBriefs.caseId, cases.id))
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .leftJoin(users, eq(appealsCouncilBriefs.assignedToId, users.id))
      .where(eq(appealsCouncilBriefs.organizationId, session.organizationId))
      .orderBy(asc(appealsCouncilBriefs.deadlineDate))
      .limit(500);

    const now = Date.now();

    const pending: AcBriefRow[] = [];
    const drafting: AcBriefRow[] = [];
    const inReview: AcBriefRow[] = [];
    const filed: AcBriefRow[] = [];
    const decided: AcBriefRow[] = [];

    for (const r of rows) {
      const claimantName =
        r.leadFirstName || r.leadLastName
          ? `${r.leadFirstName ?? ""} ${r.leadLastName ?? ""}`.trim()
          : "Unknown Claimant";
      const assignedUserName =
        r.assignedFirstName || r.assignedLastName
          ? `${r.assignedFirstName ?? ""} ${r.assignedLastName ?? ""}`.trim()
          : null;

      const daysRemaining = r.deadlineDate
        ? Math.ceil((new Date(r.deadlineDate).getTime() - now) / 86_400_000)
        : null;

      const row: AcBriefRow = {
        id: r.id,
        status: (r.status ?? "pending") as AcBriefStatus,
        caseId: r.caseId,
        caseNumber: r.caseNumber ?? "—",
        claimantName,
        unfavorableDecisionDate: r.unfavorableDecisionDate
          ? new Date(r.unfavorableDecisionDate).toISOString()
          : null,
        deadlineDate: r.deadlineDate
          ? new Date(r.deadlineDate).toISOString()
          : null,
        filedAt: r.filedAt ? new Date(r.filedAt).toISOString() : null,
        outcome: r.outcome,
        daysRemaining,
        assignedUserId: r.assignedUserId,
        assignedUserName,
        notes: r.notes,
      };

      switch (row.status) {
        case "pending":
          pending.push(row);
          break;
        case "drafting":
          drafting.push(row);
          break;
        case "in_review":
          inReview.push(row);
          break;
        case "filed":
          filed.push(row);
          break;
        case "granted":
        case "denied":
        case "remanded":
          decided.push(row);
          break;
        default:
          pending.push(row);
      }
    }

    return {
      pending,
      drafting,
      inReview,
      filed,
      decided,
      counts: {
        pending: pending.length,
        drafting: drafting.length,
        inReview: inReview.length,
        filed: filed.length,
        decided: decided.length,
      },
    };
  } catch (err) {
    logger.error("getAppealsCouncilBriefs failed", { error: err });
    return {
      pending: [],
      drafting: [],
      inReview: [],
      filed: [],
      decided: [],
      counts: {
        pending: 0,
        drafting: 0,
        inReview: 0,
        filed: 0,
        decided: 0,
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────
// AI draft / approve-file / mark-outcome actions
// ─────────────────────────────────────────────────────────────

export type ActionResult<T = undefined> = {
  success: boolean;
  message?: string;
  data?: T;
};

/**
 * Access gate — only admins, attorneys, and appeals_council users can
 * run AC filing/outcome mutations.
 */
function canAppealsAct(role: string | null | undefined): boolean {
  if (!role) return false;
  return ["admin", "attorney", "appeals_council"].includes(role);
}

/**
 * Recent unfavorable ALJ decisions that are candidate cases for an
 * Appeals Council brief. We look at cases with a recent hearing outcome
 * of `unfavorable` (or `partially_favorable`) and no AC brief on file
 * yet, ordered by most recent decision first.
 */
export type UnfavorableCandidate = {
  caseId: string;
  caseNumber: string;
  claimantName: string;
  aljName: string | null;
  unfavorableDate: string | null;
  outcome: string;
  daysSinceDecision: number | null;
};

export async function getUnfavorableCandidateCases(): Promise<
  UnfavorableCandidate[]
> {
  const session = await requireSession();
  try {
    const rows = await db
      .select({
        outcomeId: hearingOutcomes.id,
        caseId: hearingOutcomes.caseId,
        caseNumber: cases.caseNumber,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
        aljName: cases.adminLawJudge,
        hearingDate: hearingOutcomes.hearingDate,
        outcomeReceivedAt: hearingOutcomes.outcomeReceivedAt,
        outcome: hearingOutcomes.outcome,
      })
      .from(hearingOutcomes)
      .innerJoin(cases, eq(hearingOutcomes.caseId, cases.id))
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .where(
        and(
          eq(hearingOutcomes.organizationId, session.organizationId),
          isNull(cases.deletedAt),
        ),
      )
      .orderBy(desc(hearingOutcomes.hearingDate))
      .limit(50);

    const now = Date.now();
    const candidates: UnfavorableCandidate[] = [];
    for (const r of rows) {
      const outcome = (r.outcome ?? "").toLowerCase();
      if (outcome !== "unfavorable" && outcome !== "partially_favorable") {
        continue;
      }
      const decisionDate = r.outcomeReceivedAt ?? r.hearingDate;
      const daysSince = decisionDate
        ? Math.floor((now - new Date(decisionDate).getTime()) / 86_400_000)
        : null;
      const claimantName =
        r.leadFirstName || r.leadLastName
          ? `${r.leadFirstName ?? ""} ${r.leadLastName ?? ""}`.trim()
          : "Unknown Claimant";
      candidates.push({
        caseId: r.caseId,
        caseNumber: r.caseNumber ?? "—",
        claimantName,
        aljName: r.aljName,
        unfavorableDate: decisionDate
          ? new Date(decisionDate).toISOString()
          : null,
        outcome: r.outcome ?? "unfavorable",
        daysSinceDecision: daysSince,
      });
    }
    return candidates.slice(0, 20);
  } catch (err) {
    logger.error("getUnfavorableCandidateCases failed", { error: err });
    return [];
  }
}

/**
 * Generate an AI appeals-council brief draft for the chosen case.
 *
 * This is intentionally a lightweight stub: it creates an `ai_drafts`
 * row with type `appeals_council_brief` and a skeleton body so the
 * reviewer has something to open immediately. The full prompt/Claude
 * generation will be wired through the shared `lib/services/ai-drafts`
 * layer in a follow-up; the contract (draftId returned, audit logged,
 * revalidation triggered) is already in place for that plug-in.
 */
export async function generateAppealsCouncilDraft(
  caseId: string,
): Promise<ActionResult<{ draftId: string }>> {
  const session = await requireSession();
  if (!canAppealsAct(session.role)) {
    return { success: false, message: "Not authorized" };
  }

  try {
    const [caseRow] = await db
      .select({
        id: cases.id,
        organizationId: cases.organizationId,
        caseNumber: cases.caseNumber,
        aljName: cases.adminLawJudge,
        hearingOffice: cases.hearingOffice,
      })
      .from(cases)
      .where(
        and(
          eq(cases.id, caseId),
          eq(cases.organizationId, session.organizationId),
          isNull(cases.deletedAt),
        ),
      )
      .limit(1);
    if (!caseRow) return { success: false, message: "Case not found" };

    // Claimant label for the skeleton body.
    const [claimant] = await db
      .select({
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(caseContacts)
      .innerJoin(contacts, eq(caseContacts.contactId, contacts.id))
      .where(
        and(
          eq(caseContacts.caseId, caseId),
          eq(caseContacts.isPrimary, true),
          eq(caseContacts.relationship, "claimant"),
        ),
      )
      .limit(1);

    const claimantName = claimant
      ? `${claimant.firstName} ${claimant.lastName}`.trim()
      : "the claimant";

    const title = `AC Brief — ${caseRow.caseNumber ?? caseId.slice(0, 8)}`;
    const body = `Appeals Council Brief (DRAFT)

Case: ${caseRow.caseNumber ?? "—"}
Claimant: ${claimantName}
ALJ: ${caseRow.aljName ?? "[TO BE CONFIRMED]"}
Hearing Office: ${caseRow.hearingOffice ?? "[TO BE CONFIRMED]"}

## Grounds for Appeal
1. [TO BE CONFIRMED — substantial-evidence analysis]
2. [TO BE CONFIRMED — RFC findings]
3. [TO BE CONFIRMED — credibility analysis under SSR 16-3p]

## Requested Relief
Remand for further proceedings consistent with the Appeals Council's findings.

[This skeleton was generated by the "AI draft from latest" quick action. A full AI-authored draft will replace it once the Claude prompt for AC briefs is wired in.]`;

    const [draft] = await db
      .insert(aiDrafts)
      .values({
        organizationId: caseRow.organizationId,
        caseId: caseRow.id,
        type: "appeals_council_brief",
        status: "draft_ready",
        assignedReviewerId: session.id,
        title,
        body,
        promptVersion: "ac-brief-skeleton-v1",
        model: "skeleton",
      })
      .returning({ id: aiDrafts.id });

    await logAiDraftEvent({
      organizationId: caseRow.organizationId,
      actorUserId: session.id,
      caseId: caseRow.id,
      draftId: draft.id,
      draftType: "appeals_council_brief",
      action: "ai_draft_created",
      metadata: { source: "appeals_council_subnav" },
    });

    revalidatePath("/appeals-council");
    revalidatePath("/drafts");
    revalidatePath(`/drafts/${draft.id}`);

    return {
      success: true,
      message: `AC brief draft created`,
      data: { draftId: draft.id },
    };
  } catch (err) {
    logger.error("generateAppealsCouncilDraft failed", {
      caseId,
      error: err,
    });
    return { success: false, message: "Could not generate draft" };
  }
}

/**
 * Approve an appeals-council draft and enqueue it for filing. The
 * actual SSA submission is mocked — we flip the draft to `approved`
 * and stamp `filing_queued_at` on the associated AC brief row (creating
 * the brief row if none exists for the draft's case).
 */
export async function approveAndFileAppealsBrief(
  draftId: string,
): Promise<ActionResult<{ caseId: string | null }>> {
  const session = await requireSession();
  if (!canAppealsAct(session.role)) {
    return { success: false, message: "Not authorized" };
  }

  try {
    const [draft] = await db
      .select()
      .from(aiDrafts)
      .where(eq(aiDrafts.id, draftId))
      .limit(1);
    if (!draft) return { success: false, message: "Draft not found" };
    if (draft.organizationId !== session.organizationId) {
      return { success: false, message: "Not authorized" };
    }
    if (draft.type !== "appeals_council_brief") {
      return {
        success: false,
        message: "Only appeals-council drafts can be filed here",
      };
    }

    const now = new Date();
    const caseId = draft.caseId;

    await db
      .update(aiDrafts)
      .set({
        status: "approved",
        approvedAt: now,
        approvedBy: session.id,
        updatedAt: now,
      })
      .where(eq(aiDrafts.id, draft.id));

    await logAiDraftEvent({
      organizationId: draft.organizationId,
      actorUserId: session.id,
      caseId: draft.caseId,
      draftId: draft.id,
      draftType: draft.type,
      action: "ai_draft_approved",
      metadata: { source: "approve_and_file" },
    });

    if (caseId) {
      // Find the open AC brief row for this case, or create one.
      const [existing] = await db
        .select({ id: appealsCouncilBriefs.id })
        .from(appealsCouncilBriefs)
        .where(
          and(
            eq(appealsCouncilBriefs.caseId, caseId),
            eq(appealsCouncilBriefs.organizationId, draft.organizationId),
            isNull(appealsCouncilBriefs.filedAt),
          ),
        )
        .orderBy(desc(appealsCouncilBriefs.createdAt))
        .limit(1);

      if (existing) {
        await db
          .update(appealsCouncilBriefs)
          .set({
            status: "filed",
            filingQueuedAt: now,
            draftId: draft.id,
            updatedAt: now,
          })
          .where(eq(appealsCouncilBriefs.id, existing.id));
      } else {
        await db.insert(appealsCouncilBriefs).values({
          organizationId: draft.organizationId,
          caseId,
          assignedToId: session.id,
          status: "filed",
          filingQueuedAt: now,
          draftId: draft.id,
        });
      }

      await logPhiModification({
        organizationId: draft.organizationId,
        userId: session.id,
        entityType: "appeals_council_brief",
        entityId: caseId,
        caseId,
        operation: "update",
        action: "ac_brief_filing_queued",
        metadata: { draftId: draft.id },
      });
    }

    revalidatePath("/appeals-council");
    revalidatePath("/drafts");
    if (caseId) revalidatePath(`/cases/${caseId}`);

    return {
      success: true,
      message: "Brief approved and queued for filing",
      data: { caseId },
    };
  } catch (err) {
    logger.error("approveAndFileAppealsBrief failed", { draftId, error: err });
    return { success: false, message: "Could not approve and file brief" };
  }
}

export type AppealsOutcome = "granted" | "denied" | "remanded" | "dismissed";
const VALID_APPEALS_OUTCOMES: AppealsOutcome[] = [
  "granted",
  "denied",
  "remanded",
  "dismissed",
];

/**
 * Record the Appeals Council's decision on a brief. Updates the most
 * recent open AC brief row for the case (creating one if absent) and
 * advances the case stage when the outcome is terminal.
 */
export async function recordAppealsOutcome(
  caseId: string,
  outcome: AppealsOutcome,
  notes?: string,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!canAppealsAct(session.role)) {
    return { success: false, message: "Not authorized" };
  }
  if (!VALID_APPEALS_OUTCOMES.includes(outcome)) {
    return { success: false, message: "Invalid outcome" };
  }

  try {
    const [caseRow] = await db
      .select({
        id: cases.id,
        organizationId: cases.organizationId,
      })
      .from(cases)
      .where(
        and(
          eq(cases.id, caseId),
          eq(cases.organizationId, session.organizationId),
          isNull(cases.deletedAt),
        ),
      )
      .limit(1);
    if (!caseRow) return { success: false, message: "Case not found" };

    const now = new Date();

    // Most recent AC brief row for this case (prefer the one that's
    // already filed but not yet decided).
    const [brief] = await db
      .select({ id: appealsCouncilBriefs.id })
      .from(appealsCouncilBriefs)
      .where(
        and(
          eq(appealsCouncilBriefs.caseId, caseId),
          eq(appealsCouncilBriefs.organizationId, caseRow.organizationId),
        ),
      )
      .orderBy(desc(appealsCouncilBriefs.createdAt))
      .limit(1);

    if (brief) {
      await db
        .update(appealsCouncilBriefs)
        .set({
          status: outcome === "dismissed" ? "denied" : outcome,
          outcome,
          outcomeAt: now,
          notes: notes ?? null,
          updatedAt: now,
        })
        .where(eq(appealsCouncilBriefs.id, brief.id));
    } else {
      await db.insert(appealsCouncilBriefs).values({
        organizationId: caseRow.organizationId,
        caseId,
        assignedToId: session.id,
        status: outcome === "dismissed" ? "denied" : outcome,
        outcome,
        outcomeAt: now,
        notes: notes ?? null,
      });
    }

    // Advance the case status on terminal outcomes. Granted → closed_won,
    // Denied/Dismissed → closed_lost. Remanded keeps the case active.
    if (outcome === "granted") {
      await db
        .update(cases)
        .set({
          status: "closed_won",
          closedAt: now,
          closedReason: "appeals_council_granted",
          updatedAt: now,
          updatedBy: session.id,
        })
        .where(eq(cases.id, caseId));
    } else if (outcome === "denied" || outcome === "dismissed") {
      await db
        .update(cases)
        .set({
          status: "closed_lost",
          closedAt: now,
          closedReason: `appeals_council_${outcome}`,
          updatedAt: now,
          updatedBy: session.id,
        })
        .where(eq(cases.id, caseId));
    }

    await logPhiModification({
      organizationId: caseRow.organizationId,
      userId: session.id,
      entityType: "appeals_council_brief",
      entityId: caseId,
      caseId,
      operation: "update",
      action: "ac_outcome_recorded",
      metadata: { outcome, hasNotes: !!notes },
    });

    revalidatePath("/appeals-council");
    revalidatePath(`/cases/${caseId}`);

    return { success: true, message: `Outcome recorded: ${outcome}` };
  } catch (err) {
    logger.error("recordAppealsOutcome failed", { caseId, outcome, error: err });
    return { success: false, message: "Could not record outcome" };
  }
}

/**
 * Compact dropdown payload — recent open AC brief cases for the
 * "Mark outcome" picker. Filters to briefs that have been filed but
 * not yet decided.
 */
export type OpenAppealsBrief = {
  briefId: string;
  caseId: string;
  caseNumber: string;
  claimantName: string;
  filedAt: string | null;
};

export async function getOpenAppealsBriefs(): Promise<OpenAppealsBrief[]> {
  const session = await requireSession();
  try {
    const rows = await db
      .select({
        briefId: appealsCouncilBriefs.id,
        caseId: appealsCouncilBriefs.caseId,
        caseNumber: cases.caseNumber,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
        filedAt: appealsCouncilBriefs.filedAt,
        filingQueuedAt: appealsCouncilBriefs.filingQueuedAt,
        outcome: appealsCouncilBriefs.outcome,
      })
      .from(appealsCouncilBriefs)
      .leftJoin(cases, eq(appealsCouncilBriefs.caseId, cases.id))
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .where(
        and(
          eq(appealsCouncilBriefs.organizationId, session.organizationId),
          isNull(appealsCouncilBriefs.outcomeAt),
        ),
      )
      .orderBy(desc(appealsCouncilBriefs.createdAt))
      .limit(25);

    return rows.map((r) => ({
      briefId: r.briefId,
      caseId: r.caseId,
      caseNumber: r.caseNumber ?? "—",
      claimantName:
        r.leadFirstName || r.leadLastName
          ? `${r.leadFirstName ?? ""} ${r.leadLastName ?? ""}`.trim()
          : "Unknown Claimant",
      filedAt: r.filedAt
        ? new Date(r.filedAt).toISOString()
        : r.filingQueuedAt
          ? new Date(r.filingQueuedAt).toISOString()
          : null,
    }));
  } catch (err) {
    logger.error("getOpenAppealsBriefs failed", { error: err });
    return [];
  }
}

/**
 * Compact dropdown payload — drafts in "draft_ready" / "in_review"
 * status for the "Approve & file" picker. Limited to appeals-council
 * briefs the current org can see.
 */
export type ReviewableAppealsDraft = {
  draftId: string;
  caseId: string | null;
  caseNumber: string | null;
  title: string;
  createdAt: string;
};

export async function getReviewableAppealsDrafts(): Promise<
  ReviewableAppealsDraft[]
> {
  const session = await requireSession();
  try {
    const rows = await db
      .select({
        draftId: aiDrafts.id,
        caseId: aiDrafts.caseId,
        caseNumber: cases.caseNumber,
        title: aiDrafts.title,
        createdAt: aiDrafts.createdAt,
        status: aiDrafts.status,
      })
      .from(aiDrafts)
      .leftJoin(cases, eq(aiDrafts.caseId, cases.id))
      .where(
        and(
          eq(aiDrafts.organizationId, session.organizationId),
          eq(aiDrafts.type, "appeals_council_brief"),
          isNotNull(aiDrafts.caseId),
        ),
      )
      .orderBy(desc(aiDrafts.createdAt))
      .limit(25);

    return rows
      .filter((r) => r.status === "draft_ready" || r.status === "in_review")
      .map((r) => ({
        draftId: r.draftId,
        caseId: r.caseId,
        caseNumber: r.caseNumber ?? null,
        title: r.title,
        createdAt: new Date(r.createdAt).toISOString(),
      }));
  } catch (err) {
    logger.error("getReviewableAppealsDrafts failed", { error: err });
    return [];
  }
}
