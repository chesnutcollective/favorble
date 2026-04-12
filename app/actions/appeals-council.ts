"use server";

import { db } from "@/db/drizzle";
import {
  appealsCouncilBriefs,
  cases,
  leads,
  users,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { asc, eq } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

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
        ? Math.ceil(
            (new Date(r.deadlineDate).getTime() - now) / 86_400_000,
          )
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
