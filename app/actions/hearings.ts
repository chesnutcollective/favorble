"use server";

import { db } from "@/db/drizzle";
import {
  calendarEvents,
  cases,
  caseAssignments,
  caseContacts,
  contacts,
  medicalChronologyEntries,
  documents,
} from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import {
  eq,
  and,
  gte,
  lte,
  isNull,
  asc,
  desc,
  count,
  inArray,
} from "drizzle-orm";

/**
 * Return type for hearing list queries.
 */
export type UpcomingHearing = {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
  location: string | null;
  hearingOffice: string | null;
  adminLawJudge: string | null;
  description: string | null;
  caseId: string | null;
  caseNumber: string | null;
  claimantFirstName: string | null;
  claimantLastName: string | null;
  modeOfAppearance: "in_person" | "video" | "phone" | "unknown";
  prepStatus: "ready" | "partial" | "not_ready";
  chronologyCount: number;
  hasPhiSheet: boolean;
};

/**
 * Infer hearing mode of appearance from description/location text.
 */
function inferModeOfAppearance(
  description: string | null,
  location: string | null,
): "in_person" | "video" | "phone" | "unknown" {
  const blob = `${description ?? ""} ${location ?? ""}`.toLowerCase();
  if (/\b(video|webex|teams|zoom|vtc)\b/.test(blob)) return "video";
  if (/\b(phone|telephonic|telephone|dial[- ]?in)\b/.test(blob)) return "phone";
  if (/\b(in[- ]?person|on[- ]?site|courthouse|oho\b)/.test(blob))
    return "in_person";
  return "unknown";
}

/**
 * Compute prep status: ready if chronology > 5 entries AND has PHI sheet stub.
 * Since there's no dedicated PHI sheet table, we use a metadata field on
 * documents (category = 'phi_sheet') as a proxy.
 */
function computePrepStatus(
  chronologyCount: number,
  hasPhiSheet: boolean,
): "ready" | "partial" | "not_ready" {
  if (hasPhiSheet && chronologyCount > 5) return "ready";
  if (hasPhiSheet || chronologyCount > 0) return "partial";
  return "not_ready";
}

/**
 * Fetch upcoming hearings within the next 30 days.
 * If filter='mine', limits to hearings on cases where the current
 * user is listed in caseAssignments.
 */
export async function getUpcomingHearings(
  filter: "all" | "mine" = "all",
  userId?: string,
): Promise<UpcomingHearing[]> {
  const session = await requireSession();
  const effectiveUserId = userId ?? session.id;

  const now = new Date();
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const baseConditions = [
    eq(calendarEvents.organizationId, session.organizationId),
    eq(calendarEvents.eventType, "hearing" as const),
    isNull(calendarEvents.deletedAt),
    gte(calendarEvents.startAt, now),
    lte(calendarEvents.startAt, end),
  ];

  // If "mine" — restrict to cases the user is assigned to.
  if (filter === "mine") {
    const assignedCases = await db
      .select({ caseId: caseAssignments.caseId })
      .from(caseAssignments)
      .where(
        and(
          eq(caseAssignments.userId, effectiveUserId),
          isNull(caseAssignments.unassignedAt),
        ),
      );
    const caseIds = assignedCases.map((a) => a.caseId);
    if (caseIds.length === 0) return [];
    baseConditions.push(inArray(calendarEvents.caseId, caseIds));
  }

  const rows = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      description: calendarEvents.description,
      startAt: calendarEvents.startAt,
      endAt: calendarEvents.endAt,
      location: calendarEvents.location,
      hearingOffice: calendarEvents.hearingOffice,
      adminLawJudge: calendarEvents.adminLawJudge,
      caseId: calendarEvents.caseId,
      caseNumber: cases.caseNumber,
    })
    .from(calendarEvents)
    .leftJoin(cases, eq(calendarEvents.caseId, cases.id))
    .where(and(...baseConditions))
    .orderBy(asc(calendarEvents.startAt));

  if (rows.length === 0) return [];

  const caseIdsForEnrichment = Array.from(
    new Set(rows.map((r) => r.caseId).filter((id): id is string => !!id)),
  );

  // Claimants for every referenced case
  const claimantRows =
    caseIdsForEnrichment.length > 0
      ? await db
          .select({
            caseId: caseContacts.caseId,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
            relationship: caseContacts.relationship,
            isPrimary: caseContacts.isPrimary,
          })
          .from(caseContacts)
          .innerJoin(contacts, eq(caseContacts.contactId, contacts.id))
          .where(
            and(
              inArray(caseContacts.caseId, caseIdsForEnrichment),
              eq(caseContacts.relationship, "claimant"),
              eq(caseContacts.isPrimary, true),
            ),
          )
      : [];
  const claimantMap = new Map<
    string,
    { firstName: string; lastName: string }
  >();
  for (const c of claimantRows) {
    claimantMap.set(c.caseId, {
      firstName: c.firstName,
      lastName: c.lastName,
    });
  }

  // Chronology entry counts per case
  const chronologyCounts =
    caseIdsForEnrichment.length > 0
      ? await db
          .select({
            caseId: medicalChronologyEntries.caseId,
            total: count(),
          })
          .from(medicalChronologyEntries)
          .where(
            and(
              inArray(medicalChronologyEntries.caseId, caseIdsForEnrichment),
              eq(medicalChronologyEntries.isExcluded, false),
            ),
          )
          .groupBy(medicalChronologyEntries.caseId)
      : [];
  const chronMap = new Map<string, number>();
  for (const c of chronologyCounts) {
    chronMap.set(c.caseId, Number(c.total) || 0);
  }

  // PHI sheet proxy (documents where category='phi_sheet')
  const phiDocs =
    caseIdsForEnrichment.length > 0
      ? await db
          .select({
            caseId: documents.caseId,
          })
          .from(documents)
          .where(
            and(
              inArray(documents.caseId, caseIdsForEnrichment),
              eq(documents.category, "phi_sheet"),
              isNull(documents.deletedAt),
            ),
          )
      : [];
  const phiSet = new Set<string>(phiDocs.map((d) => d.caseId));

  return rows.map((r) => {
    const claimant = r.caseId ? claimantMap.get(r.caseId) : undefined;
    const chronCount = r.caseId ? (chronMap.get(r.caseId) ?? 0) : 0;
    const hasPhi = r.caseId ? phiSet.has(r.caseId) : false;
    return {
      id: r.id,
      title: r.title,
      startAt: r.startAt,
      endAt: r.endAt,
      location: r.location,
      hearingOffice: r.hearingOffice,
      adminLawJudge: r.adminLawJudge,
      description: r.description,
      caseId: r.caseId,
      caseNumber: r.caseNumber,
      claimantFirstName: claimant?.firstName ?? null,
      claimantLastName: claimant?.lastName ?? null,
      modeOfAppearance: inferModeOfAppearance(r.description, r.location),
      prepStatus: computePrepStatus(chronCount, hasPhi),
      chronologyCount: chronCount,
      hasPhiSheet: hasPhi,
    };
  });
}

/**
 * Full prep bundle for a single case's upcoming hearing.
 */
export async function getHearingPrepData(caseId: string) {
  const session = await requireSession();

  const [caseRow] = await db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
      dateOfBirth: cases.dateOfBirth,
      ssaClaimNumber: cases.ssaClaimNumber,
      ssaOffice: cases.ssaOffice,
      applicationTypePrimary: cases.applicationTypePrimary,
      applicationTypeSecondary: cases.applicationTypeSecondary,
      allegedOnsetDate: cases.allegedOnsetDate,
      dateLastInsured: cases.dateLastInsured,
      hearingOffice: cases.hearingOffice,
      adminLawJudge: cases.adminLawJudge,
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

  if (!caseRow) return null;

  // Claimant
  const [claimant] = await db
    .select({
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
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

  // Next upcoming hearing event for this case
  const now = new Date();
  const [hearingEvent] = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      description: calendarEvents.description,
      startAt: calendarEvents.startAt,
      endAt: calendarEvents.endAt,
      location: calendarEvents.location,
      hearingOffice: calendarEvents.hearingOffice,
      adminLawJudge: calendarEvents.adminLawJudge,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.caseId, caseId),
        eq(calendarEvents.eventType, "hearing" as const),
        isNull(calendarEvents.deletedAt),
        gte(calendarEvents.startAt, now),
      ),
    )
    .orderBy(asc(calendarEvents.startAt))
    .limit(1);

  const aljName = hearingEvent?.adminLawJudge ?? caseRow.adminLawJudge;
  const modeOfAppearance = hearingEvent
    ? inferModeOfAppearance(hearingEvent.description, hearingEvent.location)
    : ("unknown" as const);

  // Chronology: top 5 most recent verified entries (fall back to recent any)
  const chronologySummary = await db
    .select({
      id: medicalChronologyEntries.id,
      eventDate: medicalChronologyEntries.eventDate,
      entryType: medicalChronologyEntries.entryType,
      providerName: medicalChronologyEntries.providerName,
      summary: medicalChronologyEntries.summary,
      diagnoses: medicalChronologyEntries.diagnoses,
      medications: medicalChronologyEntries.medications,
      treatments: medicalChronologyEntries.treatments,
    })
    .from(medicalChronologyEntries)
    .where(
      and(
        eq(medicalChronologyEntries.caseId, caseId),
        eq(medicalChronologyEntries.isExcluded, false),
      ),
    )
    .orderBy(desc(medicalChronologyEntries.eventDate))
    .limit(5);

  const [chronologyTotal] = await db
    .select({ total: count() })
    .from(medicalChronologyEntries)
    .where(
      and(
        eq(medicalChronologyEntries.caseId, caseId),
        eq(medicalChronologyEntries.isExcluded, false),
      ),
    );

  // Document counts by category
  const documentCategories = await db
    .select({
      category: documents.category,
      total: count(),
    })
    .from(documents)
    .where(and(eq(documents.caseId, caseId), isNull(documents.deletedAt)))
    .groupBy(documents.category);

  const docCountsByCategory = new Map<string, number>();
  for (const row of documentCategories) {
    if (row.category)
      docCountsByCategory.set(row.category, Number(row.total) || 0);
  }

  // PHI sheet proxy: documents with category='phi_sheet'
  const [phiSheetRow] = await db
    .select({
      id: documents.id,
      fileName: documents.fileName,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(
      and(
        eq(documents.caseId, caseId),
        eq(documents.category, "phi_sheet"),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(1);

  // ALJ stats (cheap version — only total hearings handled via cases)
  const aljStats = aljName ? await getAljStatsInner(aljName) : null;

  const chronCount = Number(chronologyTotal?.total ?? 0);
  const prepStatus = computePrepStatus(chronCount, !!phiSheetRow);

  // Aggregate diagnoses/medications across summary entries
  const diagnoses = new Set<string>();
  const medications = new Set<string>();
  const treatments = new Set<string>();
  for (const e of chronologySummary) {
    for (const d of e.diagnoses ?? []) diagnoses.add(d);
    for (const m of e.medications ?? []) medications.add(m);
    for (const t of e.treatments ?? []) treatments.add(t);
  }

  return {
    case: caseRow,
    claimant: claimant ?? null,
    hearingEvent: hearingEvent ?? null,
    modeOfAppearance,
    chronologySummary,
    chronologyTotal: chronCount,
    keyDiagnoses: Array.from(diagnoses).slice(0, 10),
    keyMedications: Array.from(medications).slice(0, 10),
    keyTreatments: Array.from(treatments).slice(0, 10),
    documentCategories: Object.fromEntries(docCountsByCategory),
    phiSheet: phiSheetRow ?? null,
    aljStats,
    prepStatus,
  };
}

/**
 * Compute simple ALJ stats from cases that share the given ALJ.
 * Win rate = closed_won / (closed_won + closed_lost).
 */
async function getAljStatsInner(aljName: string) {
  const session = await requireSession();

  const aljCases = await db
    .select({
      id: cases.id,
      status: cases.status,
      closedAt: cases.closedAt,
      caseNumber: cases.caseNumber,
    })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, session.organizationId),
        eq(cases.adminLawJudge, aljName),
        isNull(cases.deletedAt),
      ),
    );

  const totalHearings = aljCases.length;
  const won = aljCases.filter((c) => c.status === "closed_won").length;
  const lost = aljCases.filter((c) => c.status === "closed_lost").length;
  const decidedCount = won + lost;
  const winRate = decidedCount > 0 ? won / decidedCount : null;

  // Hearing events linked to these cases to compute avg length
  const caseIds = aljCases.map((c) => c.id);
  let avgHearingLengthMinutes: number | null = null;
  if (caseIds.length > 0) {
    const hearingRows = await db
      .select({
        startAt: calendarEvents.startAt,
        endAt: calendarEvents.endAt,
      })
      .from(calendarEvents)
      .where(
        and(
          inArray(calendarEvents.caseId, caseIds),
          eq(calendarEvents.eventType, "hearing" as const),
          isNull(calendarEvents.deletedAt),
        ),
      );
    const durations = hearingRows
      .filter((h) => h.endAt)
      .map((h) => (h.endAt!.getTime() - h.startAt.getTime()) / 60000);
    if (durations.length > 0) {
      avgHearingLengthMinutes = Math.round(
        durations.reduce((a, b) => a + b, 0) / durations.length,
      );
    }
  }

  // Recent 10 decisions (closed cases)
  const recentDecisions = aljCases
    .filter(
      (c) =>
        (c.status === "closed_won" ||
          c.status === "closed_lost" ||
          c.status === "closed_withdrawn") &&
        c.closedAt,
    )
    .sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0))
    .slice(0, 10)
    .map((c) => ({
      caseId: c.id,
      caseNumber: c.caseNumber,
      status: c.status,
      closedAt: c.closedAt,
    }));

  return {
    aljName,
    totalHearings,
    wonCount: won,
    lostCount: lost,
    winRate,
    avgHearingLengthMinutes,
    recentDecisions,
  };
}

/**
 * Public wrapper for ALJ stats lookup.
 */
export async function getAljStats(aljName: string) {
  return getAljStatsInner(aljName);
}
