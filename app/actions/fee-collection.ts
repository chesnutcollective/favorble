"use server";

import { db } from "@/db/drizzle";
import { feePetitions, cases, leads, users } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { asc, eq } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

/**
 * Fee Collection workspace server actions.
 *
 * Backs the `/fee-collection` page with a unified list of fee petitions
 * grouped by lifecycle: pending (not filed), filed (awaiting approval),
 * approved (awaiting collection), and delinquent (approved but >30 days
 * unpaid).
 */

export type FeePetitionStatus =
  | "pending"
  | "filed"
  | "approved"
  | "delinquent"
  | "denied"
  | "withdrawn";

export type FeePetitionRow = {
  id: string;
  status: FeePetitionStatus;
  caseId: string;
  caseNumber: string;
  claimantName: string;
  favorableDecisionDate: string | null;
  filedAt: string | null;
  approvedAt: string | null;
  ageInDays: number;
  assignedUserId: string | null;
  assignedUserName: string | null;
  requestedAmountCents: number | null;
  approvedAmountCents: number | null;
  collectedAmountCents: number;
  outstandingCents: number;
  notes: string | null;
};

export type FeePetitionWorkspace = {
  pending: FeePetitionRow[];
  filed: FeePetitionRow[];
  approved: FeePetitionRow[];
  delinquent: FeePetitionRow[];
  counts: {
    pending: number;
    filed: number;
    approved: number;
    delinquent: number;
  };
};

/**
 * Load every fee petition for the org and bucket by lifecycle stage.
 * Delinquent = approved + outstanding balance + older than 30 days
 * since approval.
 */
export async function getFeePetitionsForWorkspace(): Promise<FeePetitionWorkspace> {
  const session = await requireSession();

  try {
    const rows = await db
      .select({
        id: feePetitions.id,
        status: feePetitions.status,
        caseId: feePetitions.caseId,
        caseNumber: cases.caseNumber,
        leadFirstName: leads.firstName,
        leadLastName: leads.lastName,
        favorableDecisionDate: feePetitions.favorableDecisionDate,
        filedAt: feePetitions.filedAt,
        approvedAt: feePetitions.approvedAt,
        createdAt: feePetitions.createdAt,
        assignedUserId: feePetitions.assignedToId,
        assignedFirstName: users.firstName,
        assignedLastName: users.lastName,
        requestedAmountCents: feePetitions.requestedAmountCents,
        approvedAmountCents: feePetitions.approvedAmountCents,
        collectedAmountCents: feePetitions.collectedAmountCents,
        notes: feePetitions.notes,
      })
      .from(feePetitions)
      .leftJoin(cases, eq(feePetitions.caseId, cases.id))
      .leftJoin(leads, eq(cases.leadId, leads.id))
      .leftJoin(users, eq(feePetitions.assignedToId, users.id))
      .where(eq(feePetitions.organizationId, session.organizationId))
      .orderBy(asc(feePetitions.createdAt))
      .limit(500);

    const now = Date.now();
    const delinquentThresholdMs = 30 * 86_400_000;

    const pending: FeePetitionRow[] = [];
    const filed: FeePetitionRow[] = [];
    const approved: FeePetitionRow[] = [];
    const delinquent: FeePetitionRow[] = [];

    for (const r of rows) {
      const claimantName =
        r.leadFirstName || r.leadLastName
          ? `${r.leadFirstName ?? ""} ${r.leadLastName ?? ""}`.trim()
          : "Unknown Claimant";
      const assignedUserName =
        r.assignedFirstName || r.assignedLastName
          ? `${r.assignedFirstName ?? ""} ${r.assignedLastName ?? ""}`.trim()
          : null;

      const anchor = r.filedAt ?? r.favorableDecisionDate ?? r.createdAt;
      const ageInDays = anchor
        ? Math.max(
            0,
            Math.floor((now - new Date(anchor).getTime()) / 86_400_000),
          )
        : 0;

      const approvedCents = r.approvedAmountCents ?? 0;
      const collectedCents = r.collectedAmountCents ?? 0;
      const outstanding = Math.max(0, approvedCents - collectedCents);

      const base: Omit<FeePetitionRow, "status"> = {
        id: r.id,
        caseId: r.caseId,
        caseNumber: r.caseNumber ?? "—",
        claimantName,
        favorableDecisionDate: r.favorableDecisionDate
          ? new Date(r.favorableDecisionDate).toISOString()
          : null,
        filedAt: r.filedAt ? new Date(r.filedAt).toISOString() : null,
        approvedAt: r.approvedAt ? new Date(r.approvedAt).toISOString() : null,
        ageInDays,
        assignedUserId: r.assignedUserId,
        assignedUserName,
        requestedAmountCents: r.requestedAmountCents,
        approvedAmountCents: r.approvedAmountCents,
        collectedAmountCents: collectedCents,
        outstandingCents: outstanding,
        notes: r.notes,
      };

      const rawStatus = (r.status ?? "pending").toLowerCase();

      // Delinquent = approved + outstanding + >30 days since approvedAt
      const isDelinquent =
        rawStatus === "approved" &&
        outstanding > 0 &&
        r.approvedAt !== null &&
        now - new Date(r.approvedAt).getTime() > delinquentThresholdMs;

      if (isDelinquent) {
        delinquent.push({ ...base, status: "delinquent" });
        continue;
      }

      switch (rawStatus) {
        case "pending":
          pending.push({ ...base, status: "pending" });
          break;
        case "filed":
          filed.push({ ...base, status: "filed" });
          break;
        case "approved":
          approved.push({ ...base, status: "approved" });
          break;
        case "denied":
          // Not shown in tabs; fold into filed so users can still see history.
          filed.push({ ...base, status: "denied" });
          break;
        case "withdrawn":
          filed.push({ ...base, status: "withdrawn" });
          break;
        default:
          pending.push({ ...base, status: "pending" });
      }
    }

    return {
      pending,
      filed,
      approved,
      delinquent,
      counts: {
        pending: pending.length,
        filed: filed.length,
        approved: approved.length,
        delinquent: delinquent.length,
      },
    };
  } catch (err) {
    logger.error("getFeePetitionsForWorkspace failed", { error: err });
    return {
      pending: [],
      filed: [],
      approved: [],
      delinquent: [],
      counts: { pending: 0, filed: 0, approved: 0, delinquent: 0 },
    };
  }
}
