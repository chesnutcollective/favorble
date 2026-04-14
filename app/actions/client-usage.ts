"use server";

import { db } from "@/db/drizzle";
import {
  cases,
  communications,
  contacts,
  caseContacts,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

// C5 — Client Usage dashboard
// ---------------------------------------------------------------------------
// Most metrics here are stubs that "light up with the client portal" — the
// portal (invited / activated / engaged / last-client-message) does not yet
// exist, so we return 0s and empty arrays for those while still shaping the
// response so the UI renders the full layout. The metrics we CAN compute
// today (contact counts, closed-case counts, most-recent firm activity per
// case, stale-client detection via `communications.createdAt`) are wired up
// for real. Every branch is wrapped in try/catch + safe defaults so this is
// safe to render even when the DB is unreachable.
//
// Period semantics mirror /reports/messaging: "day" = today, "week" = last
// 7 days, "month" = last 30 days. Windows are [start, now).

export type ClientUsagePeriod = "day" | "week" | "month";

export type ClientUsageTiles = {
  totalClients: number;
  activatedClients: number; // stub — 0 until portal
  engagementRate: number; // stub — 0 until portal (0–100)
  adoption: {
    mobile: number; // stub
    web: number; // stub
    sms: number; // stub
  };
};

export type ClientFunnelStage = {
  key:
    | "new_contacts"
    | "invited"
    | "activated"
    | "engaged"
    | "closed";
  label: string;
  count: number;
  stub: boolean;
};

export type PerCaseEngagementRow = {
  caseId: string;
  caseNumber: string;
  claimantName: string;
  lastFirmMessageAt: string | null;
  lastClientMessageAt: string | null; // stub — always null
  daysSinceLastInteraction: number | null;
};

export type StaleClientRow = {
  caseId: string | null;
  caseNumber: string | null;
  claimantName: string;
  lastInteractionAt: string | null;
  daysStale: number;
};

export type ClientUsageData = {
  period: ClientUsagePeriod;
  periodStart: string;
  periodEnd: string;
  tiles: ClientUsageTiles;
  funnel: ClientFunnelStage[];
  perCase: PerCaseEngagementRow[];
  staleClients: StaleClientRow[];
};

function periodStart(period: ClientUsagePeriod): Date {
  const now = new Date();
  const start = new Date(now);
  if (period === "day") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
  }
  return start;
}

function emptyData(period: ClientUsagePeriod): ClientUsageData {
  const start = periodStart(period);
  return {
    period,
    periodStart: start.toISOString(),
    periodEnd: new Date().toISOString(),
    tiles: {
      totalClients: 0,
      activatedClients: 0,
      engagementRate: 0,
      adoption: { mobile: 0, web: 0, sms: 0 },
    },
    funnel: [
      {
        key: "new_contacts",
        label: "New contacts",
        count: 0,
        stub: false,
      },
      { key: "invited", label: "Invited", count: 0, stub: true },
      { key: "activated", label: "Activated", count: 0, stub: true },
      { key: "engaged", label: "Engaged", count: 0, stub: true },
      { key: "closed", label: "Closed", count: 0, stub: false },
    ],
    perCase: [],
    staleClients: [],
  };
}

const CLOSED_CASE_STATUSES = [
  "closed_won",
  "closed_lost",
  "closed_withdrawn",
] as const;

const STALE_THRESHOLD_DAYS = 14;

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(b.getTime() - a.getTime());
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Client Usage analytics. Safe defaults on any failure — the UI always
 * renders a full layout, stub fields are labeled in the page component.
 */
export async function getClientUsage(
  period: ClientUsagePeriod = "week",
): Promise<ClientUsageData> {
  const session = await requireSession();
  const orgId = session.organizationId;
  const since = periodStart(period);
  const now = new Date();

  try {
    // Total claimant-type contacts in org (not period-bounded — this is a
    // running total; "new contacts" in the funnel covers the period count).
    let totalClients = 0;
    try {
      const [row] = await db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(contacts)
        .where(
          and(
            eq(contacts.organizationId, orgId),
            eq(contacts.contactType, "claimant"),
            isNull(contacts.deletedAt),
          ),
        );
      totalClients = Number(row?.n ?? 0);
    } catch {
      totalClients = 0;
    }

    // New contacts in the selected period — this is the only funnel stage
    // with real data today.
    let newContactsCount = 0;
    try {
      const [row] = await db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(contacts)
        .where(
          and(
            eq(contacts.organizationId, orgId),
            eq(contacts.contactType, "claimant"),
            isNull(contacts.deletedAt),
            gte(contacts.createdAt, since),
          ),
        );
      newContactsCount = Number(row?.n ?? 0);
    } catch {
      newContactsCount = 0;
    }

    // Closed cases in the selected period (stageEnteredAt is a reasonable
    // proxy for "when did it close?" — when `closedAt` isn't set by the
    // status-change flow we fall back to cases updated in the window).
    let closedCount = 0;
    try {
      const [row] = await db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(cases)
        .where(
          and(
            eq(cases.organizationId, orgId),
            isNull(cases.deletedAt),
            inArray(cases.status, [...CLOSED_CASE_STATUSES]),
            gte(cases.updatedAt, since),
          ),
        );
      closedCount = Number(row?.n ?? 0);
    } catch {
      closedCount = 0;
    }

    // Top 10 cases by most recent firm outbound communication in the
    // window. "Firm activity" = any row in communications with direction
    // 'outbound' or a *_outbound type. We also surface the claimant name
    // via case_contacts → contacts (is_primary preferred, else any).
    type CaseActivityRow = {
      caseId: string;
      caseNumber: string;
      lastFirmMessageAt: Date | null;
      claimantFirstName: string | null;
      claimantLastName: string | null;
    };

    let perCase: PerCaseEngagementRow[] = [];
    try {
      const activityRows = await db.execute<{
        case_id: string;
        case_number: string;
        last_firm_message_at: string | null;
        claimant_first_name: string | null;
        claimant_last_name: string | null;
      }>(sql`
        WITH recent AS (
          SELECT
            c.id AS case_id,
            c.case_number,
            MAX(m.created_at) AS last_firm_message_at
          FROM cases c
          LEFT JOIN communications m
            ON m.case_id = c.id
           AND m.organization_id = ${orgId}
           AND (
             m.direction = 'outbound'
             OR m.type IN ('email_outbound','message_outbound','phone_outbound')
           )
          WHERE c.organization_id = ${orgId}
            AND c.deleted_at IS NULL
          GROUP BY c.id, c.case_number
        )
        SELECT
          r.case_id,
          r.case_number,
          r.last_firm_message_at::text AS last_firm_message_at,
          ct.first_name AS claimant_first_name,
          ct.last_name  AS claimant_last_name
        FROM recent r
        LEFT JOIN LATERAL (
          SELECT cc.contact_id
          FROM case_contacts cc
          WHERE cc.case_id = r.case_id
            AND cc.relationship = 'claimant'
          ORDER BY cc.is_primary DESC, cc.created_at ASC
          LIMIT 1
        ) picked ON TRUE
        LEFT JOIN contacts ct ON ct.id = picked.contact_id
        WHERE r.last_firm_message_at IS NOT NULL
        ORDER BY r.last_firm_message_at DESC NULLS LAST
        LIMIT 10
      `);

      const resolved = activityRows as unknown as CaseActivityRow[] &
        Array<{
          case_id: string;
          case_number: string;
          last_firm_message_at: string | null;
          claimant_first_name: string | null;
          claimant_last_name: string | null;
        }>;

      perCase = (resolved as Array<{
        case_id: string;
        case_number: string;
        last_firm_message_at: string | null;
        claimant_first_name: string | null;
        claimant_last_name: string | null;
      }>).map((r) => {
        const lastFirm = r.last_firm_message_at
          ? new Date(r.last_firm_message_at)
          : null;
        const name =
          `${r.claimant_first_name ?? ""} ${
            r.claimant_last_name ?? ""
          }`.trim() || "—";
        return {
          caseId: r.case_id,
          caseNumber: r.case_number,
          claimantName: name,
          lastFirmMessageAt: lastFirm ? lastFirm.toISOString() : null,
          // stub — the client portal doesn't exist yet, so we can't
          // identify "client messages" vs generic inbound.
          lastClientMessageAt: null,
          daysSinceLastInteraction: lastFirm ? daysBetween(lastFirm, now) : null,
        };
      });
    } catch {
      perCase = [];
    }

    // Stale clients — contacts whose latest communication is 14+ days ago
    // (or who have no communications at all but were created 14+ days ago).
    // Limited to 20 so the page stays readable.
    let staleClients: StaleClientRow[] = [];
    try {
      const staleCutoff = new Date(now);
      staleCutoff.setDate(staleCutoff.getDate() - STALE_THRESHOLD_DAYS);

      const staleRows = await db.execute<{
        contact_id: string;
        first_name: string;
        last_name: string;
        case_id: string | null;
        case_number: string | null;
        last_interaction_at: string | null;
      }>(sql`
        WITH contact_last_touch AS (
          SELECT
            ct.id AS contact_id,
            ct.first_name,
            ct.last_name,
            ct.created_at AS contact_created_at,
            MAX(m.created_at) AS last_interaction_at
          FROM contacts ct
          LEFT JOIN case_contacts cc ON cc.contact_id = ct.id
          LEFT JOIN communications m
            ON m.case_id = cc.case_id
           AND m.organization_id = ${orgId}
          WHERE ct.organization_id = ${orgId}
            AND ct.contact_type = 'claimant'
            AND ct.deleted_at IS NULL
          GROUP BY ct.id, ct.first_name, ct.last_name, ct.created_at
        )
        SELECT
          clt.contact_id,
          clt.first_name,
          clt.last_name,
          picked.case_id,
          c.case_number,
          COALESCE(clt.last_interaction_at, clt.contact_created_at)::text
            AS last_interaction_at
        FROM contact_last_touch clt
        LEFT JOIN LATERAL (
          SELECT cc.case_id
          FROM case_contacts cc
          WHERE cc.contact_id = clt.contact_id
            AND cc.relationship = 'claimant'
          ORDER BY cc.is_primary DESC, cc.created_at ASC
          LIMIT 1
        ) picked ON TRUE
        LEFT JOIN cases c ON c.id = picked.case_id
        WHERE COALESCE(clt.last_interaction_at, clt.contact_created_at) < ${staleCutoff}
        ORDER BY COALESCE(clt.last_interaction_at, clt.contact_created_at) ASC
        LIMIT 20
      `);

      const resolvedStale = staleRows as unknown as Array<{
        contact_id: string;
        first_name: string;
        last_name: string;
        case_id: string | null;
        case_number: string | null;
        last_interaction_at: string | null;
      }>;

      staleClients = resolvedStale.map((r) => {
        const lastAt = r.last_interaction_at
          ? new Date(r.last_interaction_at)
          : null;
        const name =
          `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "—";
        return {
          caseId: r.case_id,
          caseNumber: r.case_number,
          claimantName: name,
          lastInteractionAt: lastAt ? lastAt.toISOString() : null,
          daysStale: lastAt ? daysBetween(lastAt, now) : STALE_THRESHOLD_DAYS,
        };
      });
    } catch {
      staleClients = [];
    }

    return {
      period,
      periodStart: since.toISOString(),
      periodEnd: now.toISOString(),
      tiles: {
        totalClients,
        activatedClients: 0, // stub — ships with portal
        engagementRate: 0, // stub — ships with portal
        adoption: { mobile: 0, web: 0, sms: 0 }, // stub
      },
      funnel: [
        {
          key: "new_contacts",
          label: "New contacts",
          count: newContactsCount,
          stub: false,
        },
        { key: "invited", label: "Invited", count: 0, stub: true },
        { key: "activated", label: "Activated", count: 0, stub: true },
        { key: "engaged", label: "Engaged", count: 0, stub: true },
        {
          key: "closed",
          label: "Closed",
          count: closedCount,
          stub: false,
        },
      ],
      perCase,
      staleClients,
    };
  } catch (err) {
    console.warn("[client-usage] query failed", err);
    return emptyData(period);
  }
}
