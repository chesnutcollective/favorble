import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/drizzle";
import {
  cases,
  caseStages,
  contacts,
  caseContacts,
  caseAssignments,
  tasks,
  documents,
  leads,
  calendarEvents,
  communications,
  users,
} from "@/db/schema";
import { eq, and, isNull, ilike, or, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { alias } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function computeScore(
  query: string,
  primaryField: string | null | undefined,
  secondaryFields: (string | null | undefined)[] = [],
): number {
  let score = 0;
  const q = query.toLowerCase();

  if (primaryField) {
    const p = primaryField.toLowerCase();
    if (p === q) {
      score += 100;
    } else if (p.startsWith(q)) {
      score += 80;
    } else if (p.includes(q)) {
      score += 50;
    }
  }

  for (const field of secondaryFields) {
    if (field) {
      const f = field.toLowerCase();
      if (f === q || f.includes(q)) {
        score += 30;
      }
    }
  }

  return score;
}

// ---------------------------------------------------------------------------
// Entity type constants
// ---------------------------------------------------------------------------

type EntityType =
  | "case"
  | "contact"
  | "task"
  | "document"
  | "lead"
  | "event"
  | "message";

const DEFAULT_LIMITS: Record<EntityType, number> = {
  case: 8,
  contact: 5,
  task: 5,
  document: 5,
  lead: 5,
  event: 5,
  message: 5,
};

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const session = await requireSession();
  const orgId = session.organizationId;

  const rawQ = request.nextUrl.searchParams.get("q")?.trim();
  const typeFilter = request.nextUrl.searchParams.get(
    "type",
  ) as EntityType | null;
  const limitParam = request.nextUrl.searchParams.get("limit");

  const isBrowseMode = rawQ === "*";

  if (!rawQ || (!isBrowseMode && rawQ.length < 2)) {
    return NextResponse.json({
      results: {
        cases: [],
        contacts: [],
        tasks: [],
        documents: [],
        leads: [],
        events: [],
        messages: [],
      },
      topHit: null,
    });
  }

  const q: string = rawQ;
  const pattern = isBrowseMode ? "%" : `%${q}%`;

  function shouldSearch(type: EntityType): boolean {
    return !typeFilter || typeFilter === type;
  }

  function getLimit(type: EntityType): number {
    if (limitParam) {
      const n = parseInt(limitParam, 10);
      if (!isNaN(n) && n > 0) return Math.min(n, 50);
    }
    return DEFAULT_LIMITS[type];
  }

  // -------------------------------------------------------------------------
  // Search functions — each wrapped in try/catch so a single failure doesn't
  // break the entire response.
  // -------------------------------------------------------------------------

  async function searchCases() {
    if (!shouldSearch("case")) return [];
    try {
      const assignedToUser = alias(users, "assigned_to_user");

      const rows = await db
        .select({
          id: cases.id,
          caseNumber: cases.caseNumber,
          stageName: caseStages.name,
          stageColor: caseStages.color,
          claimantFirstName: contacts.firstName,
          claimantLastName: contacts.lastName,
          assignedToFirstName: assignedToUser.firstName,
          assignedToLastName: assignedToUser.lastName,
          updatedAt: cases.updatedAt,
          ssnEncrypted: cases.ssnEncrypted,
          ssaClaimNumber: cases.ssaClaimNumber,
        })
        .from(cases)
        .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
        .leftJoin(
          caseContacts,
          and(
            eq(caseContacts.caseId, cases.id),
            eq(caseContacts.isPrimary, true),
            eq(caseContacts.relationship, "claimant"),
          ),
        )
        .leftJoin(contacts, eq(caseContacts.contactId, contacts.id))
        .leftJoin(
          caseAssignments,
          and(
            eq(caseAssignments.caseId, cases.id),
            eq(caseAssignments.isPrimary, true),
            isNull(caseAssignments.unassignedAt),
          ),
        )
        .leftJoin(assignedToUser, eq(caseAssignments.userId, assignedToUser.id))
        .where(
          and(
            eq(cases.organizationId, orgId),
            isNull(cases.deletedAt),
            or(
              ilike(cases.caseNumber, pattern),
              ilike(
                sql`COALESCE(${contacts.firstName}, '') || ' ' || COALESCE(${contacts.lastName}, '')`,
                pattern,
              ),
              ilike(cases.ssaClaimNumber, pattern),
              // Match last 4 of SSN — only if query looks like 4 digits
              ...(q.length === 4 && /^\d{4}$/.test(q)
                ? [ilike(cases.ssnEncrypted, `%${q}`)]
                : []),
            ),
          ),
        )
        .limit(getLimit("case"));

      return rows.map((r) => {
        const claimantName =
          r.claimantFirstName || r.claimantLastName
            ? `${r.claimantFirstName ?? ""} ${r.claimantLastName ?? ""}`.trim()
            : null;
        const assignedToName =
          r.assignedToFirstName || r.assignedToLastName
            ? `${r.assignedToFirstName ?? ""} ${r.assignedToLastName ?? ""}`.trim()
            : null;

        return {
          _type: "case" as const,
          id: r.id,
          caseNumber: r.caseNumber,
          claimantName,
          stageName: r.stageName,
          stageColor: r.stageColor,
          assignedToName,
          updatedAt: r.updatedAt,
          score: computeScore(q, claimantName, [
            r.caseNumber,
            r.ssaClaimNumber,
          ]),
        };
      });
    } catch (err) {
      console.error("[search] cases query failed:", err);
      return [];
    }
  }

  async function searchContacts() {
    if (!shouldSearch("contact")) return [];
    try {
      const rows = await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          contactType: contacts.contactType,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.organizationId, orgId),
            isNull(contacts.deletedAt),
            or(
              ilike(contacts.firstName, pattern),
              ilike(contacts.lastName, pattern),
              ilike(
                sql`${contacts.firstName} || ' ' || ${contacts.lastName}`,
                pattern,
              ),
              ilike(contacts.email, pattern),
              ilike(contacts.phone, pattern),
            ),
          ),
        )
        .limit(getLimit("contact"));

      return rows.map((r) => {
        const fullName = `${r.firstName} ${r.lastName}`.trim();
        return {
          _type: "contact" as const,
          id: r.id,
          fullName,
          contactType: r.contactType,
          email: r.email,
          phone: r.phone,
          score: computeScore(q, fullName, [r.email, r.phone]),
        };
      });
    } catch (err) {
      console.error("[search] contacts query failed:", err);
      return [];
    }
  }

  async function searchTasks() {
    if (!shouldSearch("task")) return [];
    try {
      const rows = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
          caseId: tasks.caseId,
          caseNumber: cases.caseNumber,
        })
        .from(tasks)
        .leftJoin(cases, eq(tasks.caseId, cases.id))
        .where(
          and(
            eq(tasks.organizationId, orgId),
            isNull(tasks.deletedAt),
            ilike(tasks.title, pattern),
          ),
        )
        .limit(getLimit("task"));

      return rows.map((r) => ({
        _type: "task" as const,
        id: r.id,
        title: r.title,
        status: r.status,
        priority: r.priority,
        dueDate: r.dueDate,
        caseId: r.caseId,
        caseNumber: r.caseNumber,
        score: computeScore(q, r.title, [r.caseNumber]),
      }));
    } catch (err) {
      console.error("[search] tasks query failed:", err);
      return [];
    }
  }

  async function searchDocuments() {
    if (!shouldSearch("document")) return [];
    try {
      const rows = await db
        .select({
          id: documents.id,
          fileName: documents.fileName,
          fileType: documents.fileType,
          category: documents.category,
          source: documents.source,
          caseId: documents.caseId,
          caseNumber: cases.caseNumber,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .leftJoin(cases, eq(documents.caseId, cases.id))
        .where(
          and(
            eq(documents.organizationId, orgId),
            isNull(documents.deletedAt),
            ilike(documents.fileName, pattern),
          ),
        )
        .limit(getLimit("document"));

      return rows.map((r) => ({
        _type: "document" as const,
        id: r.id,
        fileName: r.fileName,
        fileType: r.fileType,
        category: r.category,
        source: r.source,
        caseId: r.caseId,
        caseNumber: r.caseNumber,
        createdAt: r.createdAt,
        score: computeScore(q, r.fileName, [r.caseNumber]),
      }));
    } catch (err) {
      console.error("[search] documents query failed:", err);
      return [];
    }
  }

  async function searchLeads() {
    if (!shouldSearch("lead")) return [];
    try {
      const rows = await db
        .select({
          id: leads.id,
          firstName: leads.firstName,
          lastName: leads.lastName,
          email: leads.email,
          phone: leads.phone,
          status: leads.status,
          source: leads.source,
          createdAt: leads.createdAt,
        })
        .from(leads)
        .where(
          and(
            eq(leads.organizationId, orgId),
            isNull(leads.deletedAt),
            or(
              ilike(leads.firstName, pattern),
              ilike(leads.lastName, pattern),
              ilike(
                sql`${leads.firstName} || ' ' || ${leads.lastName}`,
                pattern,
              ),
              ilike(leads.email, pattern),
              ilike(leads.phone, pattern),
            ),
          ),
        )
        .limit(getLimit("lead"));

      return rows.map((r) => {
        const fullName = `${r.firstName} ${r.lastName}`.trim();
        return {
          _type: "lead" as const,
          id: r.id,
          fullName,
          status: r.status,
          source: r.source,
          createdAt: r.createdAt,
          score: computeScore(q, fullName, [r.email, r.phone]),
        };
      });
    } catch (err) {
      console.error("[search] leads query failed:", err);
      return [];
    }
  }

  async function searchEvents() {
    if (!shouldSearch("event")) return [];
    try {
      const rows = await db
        .select({
          id: calendarEvents.id,
          title: calendarEvents.title,
          description: calendarEvents.description,
          eventType: calendarEvents.eventType,
          startDate: calendarEvents.startAt,
          caseId: calendarEvents.caseId,
          caseNumber: cases.caseNumber,
        })
        .from(calendarEvents)
        .leftJoin(cases, eq(calendarEvents.caseId, cases.id))
        .where(
          and(
            eq(calendarEvents.organizationId, orgId),
            isNull(calendarEvents.deletedAt),
            or(
              ilike(calendarEvents.title, pattern),
              ilike(calendarEvents.description, pattern),
            ),
          ),
        )
        .limit(getLimit("event"));

      return rows.map((r) => ({
        _type: "event" as const,
        id: r.id,
        title: r.title,
        eventType: r.eventType,
        startDate: r.startDate,
        caseId: r.caseId,
        caseNumber: r.caseNumber,
        score: computeScore(q, r.title, [r.description]),
      }));
    } catch (err) {
      console.error("[search] events query failed:", err);
      return [];
    }
  }

  async function searchMessages() {
    if (!shouldSearch("message")) return [];
    try {
      const rows = await db
        .select({
          id: communications.id,
          subject: communications.subject,
          body: communications.body,
          type: communications.type,
          caseId: communications.caseId,
          caseNumber: cases.caseNumber,
          createdAt: communications.createdAt,
        })
        .from(communications)
        .leftJoin(cases, eq(communications.caseId, cases.id))
        .where(
          and(
            eq(communications.organizationId, orgId),
            or(
              ilike(communications.subject, pattern),
              ilike(communications.body, pattern),
            ),
          ),
        )
        .limit(getLimit("message"));

      return rows.map((r) => ({
        _type: "message" as const,
        id: r.id,
        subject: r.subject,
        // Truncate body to 200 chars for the search result
        body: r.body ? r.body.slice(0, 200) : null,
        type: r.type,
        caseId: r.caseId,
        caseNumber: r.caseNumber,
        createdAt: r.createdAt,
        score: computeScore(q, r.subject, [
          r.body ? r.body.slice(0, 500) : null,
        ]),
      }));
    } catch (err) {
      console.error("[search] messages query failed:", err);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Execute all searches in parallel
  // -------------------------------------------------------------------------

  const [
    caseResults,
    contactResults,
    taskResults,
    documentResults,
    leadResults,
    eventResults,
    messageResults,
  ] = await Promise.all([
    searchCases(),
    searchContacts(),
    searchTasks(),
    searchDocuments(),
    searchLeads(),
    searchEvents(),
    searchMessages(),
  ]);

  // Sort each group by score descending
  const sortByScore = <T extends { score: number }>(arr: T[]) =>
    arr.sort((a, b) => b.score - a.score);

  sortByScore(caseResults);
  sortByScore(contactResults);
  sortByScore(taskResults);
  sortByScore(documentResults);
  sortByScore(leadResults);
  sortByScore(eventResults);
  sortByScore(messageResults);

  // -------------------------------------------------------------------------
  // Determine the top hit across all entity types
  // -------------------------------------------------------------------------

  type ScoredResult = { _type: string; score: number; [key: string]: unknown };
  const allResults: ScoredResult[] = [
    ...caseResults,
    ...contactResults,
    ...taskResults,
    ...documentResults,
    ...leadResults,
    ...eventResults,
    ...messageResults,
  ];

  let topHit: {
    type: string;
    data: Record<string, unknown>;
    score: number;
  } | null = null;

  if (allResults.length > 0) {
    const best = allResults.reduce((a, b) => (a.score >= b.score ? a : b));
    if (best.score > 0) {
      const { _type, score, ...data } = best;
      topHit = { type: _type, data, score };
    }
  }

  // -------------------------------------------------------------------------
  // Strip internal _type / score from results before returning
  // -------------------------------------------------------------------------

  const strip = <T extends { _type: string; score: number }>(
    arr: T[],
  ): Omit<T, "_type" | "score">[] =>
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    arr.map(({ _type, score, ...rest }) => rest as Omit<T, "_type" | "score">);

  return NextResponse.json({
    results: {
      cases: strip(caseResults),
      contacts: strip(contactResults),
      tasks: strip(taskResults),
      documents: strip(documentResults),
      leads: strip(leadResults),
      events: strip(eventResults),
      messages: strip(messageResults),
    },
    topHit,
  });
}
