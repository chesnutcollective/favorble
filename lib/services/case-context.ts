import "server-only";
import { db } from "@/db/drizzle";
import {
  cases,
  leads,
  users,
  communications,
  medicalChronologyEntries,
  documents,
  tasks,
  caseStageTransitions,
  caseStages,
} from "@/db/schema";
import { and, desc, eq, isNull, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

/**
 * buildCaseContext — the single source of truth for "what does the AI
 * need to know about this case?" Every AI call (draft response, draft
 * artifact, summarize, call script, coaching) should use this helper
 * so prompts stay consistent and we only need to tune one place.
 *
 * Returns a structured bundle that a prompt template can slice into:
 *   - caseMeta: case number, stage, claimant name, DOB, application type
 *   - stageHistory: last N stage transitions with timestamps
 *   - communications: last N messages (inbound + outbound), newest first
 *   - medicalChronology: last N chronology entries (providers, diagnoses)
 *   - documents: last N case documents with categories
 *   - openTasks: current open tasks with assignees
 *   - assignedStaff: who owns what on this case right now
 *
 * Feeds CM-2, CM-4, SA-2, SA-3, SA-4, QA-2, CC-2.
 */

const DEFAULT_COMMS_LIMIT = 30;
const DEFAULT_CHRONOLOGY_LIMIT = 20;
const DEFAULT_DOCS_LIMIT = 25;
const DEFAULT_STAGE_HISTORY_LIMIT = 10;

export type CaseContextBundle = {
  caseMeta: {
    id: string;
    caseNumber: string;
    organizationId: string;
    stageName: string | null;
    stageCode: string | null;
    stageEnteredAt: Date | null;
    status: string;
    applicationTypePrimary: string | null;
    applicationTypeSecondary: string | null;
    ssaClaimNumber: string | null;
    ssaOffice: string | null;
    hearingOffice: string | null;
    adminLawJudge: string | null;
    hearingDate: Date | null;
    dateOfBirth: Date | null;
    allegedOnsetDate: Date | null;
    dateLastInsured: Date | null;
  };
  claimant: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  } | null;
  stageHistory: Array<{
    stageName: string | null;
    stageCode: string | null;
    transitionedAt: Date;
    transitionedByName: string | null;
  }>;
  communications: Array<{
    id: string;
    type: string;
    direction: string | null;
    subject: string | null;
    body: string | null;
    fromAddress: string | null;
    toAddress: string | null;
    createdAt: Date;
    sentimentLabel: string | null;
  }>;
  medicalChronology: Array<{
    id: string;
    entryType: string;
    eventDate: Date | null;
    providerName: string | null;
    providerType: string | null;
    summary: string | null;
    diagnoses: string[] | null;
    medications: string[] | null;
    treatments: string[] | null;
  }>;
  documents: Array<{
    id: string;
    fileName: string;
    category: string | null;
    source: string;
    description: string | null;
    createdAt: Date;
  }>;
  openTasks: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    dueDate: Date | null;
    assignedToName: string | null;
  }>;
};

export type BuildCaseContextOptions = {
  communicationsLimit?: number;
  chronologyLimit?: number;
  documentsLimit?: number;
  stageHistoryLimit?: number;
  /**
   * Include only communications of these types. Defaults to all types.
   */
  communicationTypes?: Array<
    | "email_inbound"
    | "email_outbound"
    | "message_inbound"
    | "message_outbound"
    | "phone_inbound"
    | "phone_outbound"
    | "note"
  >;
};

export async function buildCaseContext(
  caseId: string,
  opts: BuildCaseContextOptions = {},
): Promise<CaseContextBundle | null> {
  const commsLimit = opts.communicationsLimit ?? DEFAULT_COMMS_LIMIT;
  const chronLimit = opts.chronologyLimit ?? DEFAULT_CHRONOLOGY_LIMIT;
  const docsLimit = opts.documentsLimit ?? DEFAULT_DOCS_LIMIT;
  const stageLimit = opts.stageHistoryLimit ?? DEFAULT_STAGE_HISTORY_LIMIT;

  try {
    // --- Case + claimant + current stage ---
    const caseRows = await db
      .select({
        id: cases.id,
        caseNumber: cases.caseNumber,
        organizationId: cases.organizationId,
        status: cases.status,
        stageName: caseStages.name,
        stageCode: caseStages.code,
        stageEnteredAt: cases.stageEnteredAt,
        applicationTypePrimary: cases.applicationTypePrimary,
        applicationTypeSecondary: cases.applicationTypeSecondary,
        ssaClaimNumber: cases.ssaClaimNumber,
        ssaOffice: cases.ssaOffice,
        hearingOffice: cases.hearingOffice,
        adminLawJudge: cases.adminLawJudge,
        hearingDate: cases.hearingDate,
        dateOfBirth: cases.dateOfBirth,
        allegedOnsetDate: cases.allegedOnsetDate,
        dateLastInsured: cases.dateLastInsured,
        leadId: cases.leadId,
      })
      .from(cases)
      .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
      .where(eq(cases.id, caseId))
      .limit(1);

    const caseRow = caseRows[0];
    if (!caseRow) return null;

    let claimant: CaseContextBundle["claimant"] = null;
    if (caseRow.leadId) {
      const [leadRow] = await db
        .select({
          firstName: leads.firstName,
          lastName: leads.lastName,
          email: leads.email,
          phone: leads.phone,
        })
        .from(leads)
        .where(eq(leads.id, caseRow.leadId))
        .limit(1);
      claimant = leadRow ?? null;
    }

    // --- Stage history ---
    const stageHistoryRows = await db
      .select({
        transitionedAt: caseStageTransitions.transitionedAt,
        stageName: caseStages.name,
        stageCode: caseStages.code,
        transitionedByFirst: users.firstName,
        transitionedByLast: users.lastName,
      })
      .from(caseStageTransitions)
      .leftJoin(
        caseStages,
        eq(caseStageTransitions.toStageId, caseStages.id),
      )
      .leftJoin(users, eq(caseStageTransitions.transitionedBy, users.id))
      .where(eq(caseStageTransitions.caseId, caseId))
      .orderBy(desc(caseStageTransitions.transitionedAt))
      .limit(stageLimit);

    const stageHistory: CaseContextBundle["stageHistory"] = stageHistoryRows.map(
      (r) => ({
        stageName: r.stageName,
        stageCode: r.stageCode,
        transitionedAt: r.transitionedAt,
        transitionedByName:
          r.transitionedByFirst && r.transitionedByLast
            ? `${r.transitionedByFirst} ${r.transitionedByLast}`
            : null,
      }),
    );

    // --- Communications ---
    const commsConditions = [eq(communications.caseId, caseId)];
    if (opts.communicationTypes && opts.communicationTypes.length > 0) {
      commsConditions.push(inArray(communications.type, opts.communicationTypes));
    }
    const commsRows = await db
      .select({
        id: communications.id,
        type: communications.type,
        direction: communications.direction,
        subject: communications.subject,
        body: communications.body,
        fromAddress: communications.fromAddress,
        toAddress: communications.toAddress,
        createdAt: communications.createdAt,
        sentimentLabel: communications.sentimentLabel,
      })
      .from(communications)
      .where(and(...commsConditions))
      .orderBy(desc(communications.createdAt))
      .limit(commsLimit);

    // --- Medical chronology ---
    const chronRows = await db
      .select({
        id: medicalChronologyEntries.id,
        entryType: medicalChronologyEntries.entryType,
        eventDate: medicalChronologyEntries.eventDate,
        providerName: medicalChronologyEntries.providerName,
        providerType: medicalChronologyEntries.providerType,
        summary: medicalChronologyEntries.summary,
        diagnoses: medicalChronologyEntries.diagnoses,
        medications: medicalChronologyEntries.medications,
        treatments: medicalChronologyEntries.treatments,
      })
      .from(medicalChronologyEntries)
      .where(eq(medicalChronologyEntries.caseId, caseId))
      .orderBy(desc(medicalChronologyEntries.eventDate))
      .limit(chronLimit);

    // --- Documents (exclude soft-deleted) ---
    const docsRows = await db
      .select({
        id: documents.id,
        fileName: documents.fileName,
        category: documents.category,
        source: documents.source,
        description: documents.description,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(
        and(eq(documents.caseId, caseId), isNull(documents.deletedAt)),
      )
      .orderBy(desc(documents.createdAt))
      .limit(docsLimit);

    // --- Open tasks ---
    const taskRows = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        assignedFirstName: users.firstName,
        assignedLastName: users.lastName,
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.assignedToId, users.id))
      .where(
        and(
          eq(tasks.caseId, caseId),
          isNull(tasks.deletedAt),
          inArray(tasks.status, ["pending", "in_progress", "blocked"]),
        ),
      )
      .orderBy(tasks.dueDate);

    const openTasks: CaseContextBundle["openTasks"] = taskRows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      dueDate: r.dueDate,
      assignedToName:
        r.assignedFirstName && r.assignedLastName
          ? `${r.assignedFirstName} ${r.assignedLastName}`
          : null,
    }));

    return {
      caseMeta: {
        id: caseRow.id,
        caseNumber: caseRow.caseNumber,
        organizationId: caseRow.organizationId,
        stageName: caseRow.stageName,
        stageCode: caseRow.stageCode,
        stageEnteredAt: caseRow.stageEnteredAt,
        status: caseRow.status,
        applicationTypePrimary: caseRow.applicationTypePrimary,
        applicationTypeSecondary: caseRow.applicationTypeSecondary,
        ssaClaimNumber: caseRow.ssaClaimNumber,
        ssaOffice: caseRow.ssaOffice,
        hearingOffice: caseRow.hearingOffice,
        adminLawJudge: caseRow.adminLawJudge,
        hearingDate: caseRow.hearingDate,
        dateOfBirth: caseRow.dateOfBirth,
        allegedOnsetDate: caseRow.allegedOnsetDate,
        dateLastInsured: caseRow.dateLastInsured,
      },
      claimant,
      stageHistory,
      communications: commsRows,
      medicalChronology: chronRows,
      documents: docsRows,
      openTasks,
    };
  } catch (err) {
    logger.error("buildCaseContext failed", {
      caseId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Serialize a CaseContextBundle into a prompt-ready text blob. Used by
 * AI draft generators that want a plain-text context section. For
 * structured prompts that consume the object directly, callers should
 * use the bundle shape instead.
 */
export function formatCaseContextForPrompt(
  ctx: CaseContextBundle,
  opts: { includeFullBodies?: boolean; maxBodyChars?: number } = {},
): string {
  const maxBody = opts.maxBodyChars ?? 600;
  const cm = ctx.caseMeta;

  const parts: string[] = [];

  parts.push(`# Case ${cm.caseNumber}`);
  if (ctx.claimant) {
    parts.push(
      `Claimant: ${ctx.claimant.firstName} ${ctx.claimant.lastName}` +
        (ctx.claimant.email ? ` <${ctx.claimant.email}>` : "") +
        (ctx.claimant.phone ? ` · ${ctx.claimant.phone}` : ""),
    );
  }
  if (cm.dateOfBirth) {
    parts.push(`DOB: ${cm.dateOfBirth.toISOString().split("T")[0]}`);
  }
  parts.push(
    `Stage: ${cm.stageName ?? "—"} (${cm.stageCode ?? "—"}) since ${
      cm.stageEnteredAt?.toISOString().split("T")[0] ?? "—"
    }`,
  );
  const appTypes = [cm.applicationTypePrimary, cm.applicationTypeSecondary]
    .filter(Boolean)
    .join(" + ");
  if (appTypes) parts.push(`Application type: ${appTypes}`);
  if (cm.ssaClaimNumber) parts.push(`SSA claim #: ${cm.ssaClaimNumber}`);
  if (cm.ssaOffice) parts.push(`SSA office: ${cm.ssaOffice}`);
  if (cm.hearingOffice) parts.push(`Hearing office: ${cm.hearingOffice}`);
  if (cm.adminLawJudge) parts.push(`ALJ: ${cm.adminLawJudge}`);
  if (cm.hearingDate) {
    parts.push(`Hearing date: ${cm.hearingDate.toISOString().split("T")[0]}`);
  }
  if (cm.allegedOnsetDate) {
    parts.push(
      `Alleged onset: ${cm.allegedOnsetDate.toISOString().split("T")[0]}`,
    );
  }
  if (cm.dateLastInsured) {
    parts.push(
      `Date last insured: ${cm.dateLastInsured.toISOString().split("T")[0]}`,
    );
  }

  if (ctx.stageHistory.length > 0) {
    parts.push("\n## Stage history (most recent first)");
    for (const s of ctx.stageHistory) {
      parts.push(
        `- ${s.transitionedAt.toISOString().split("T")[0]}: → ${
          s.stageName ?? "—"
        }${s.transitionedByName ? ` (by ${s.transitionedByName})` : ""}`,
      );
    }
  }

  if (ctx.openTasks.length > 0) {
    parts.push("\n## Open tasks");
    for (const t of ctx.openTasks) {
      parts.push(
        `- [${t.priority}] ${t.title}${
          t.dueDate ? ` (due ${t.dueDate.toISOString().split("T")[0]})` : ""
        }${t.assignedToName ? ` · ${t.assignedToName}` : ""}`,
      );
    }
  }

  if (ctx.medicalChronology.length > 0) {
    parts.push("\n## Medical chronology (most recent first)");
    for (const e of ctx.medicalChronology.slice(0, 10)) {
      const date = e.eventDate?.toISOString().split("T")[0] ?? "unknown";
      const provider = e.providerName ?? "unknown provider";
      parts.push(`- ${date} — ${provider}: ${e.summary ?? e.entryType}`);
      if (e.diagnoses && e.diagnoses.length > 0) {
        parts.push(`    Dx: ${e.diagnoses.join(", ")}`);
      }
      if (e.medications && e.medications.length > 0) {
        parts.push(`    Rx: ${e.medications.join(", ")}`);
      }
    }
  }

  if (ctx.documents.length > 0) {
    parts.push("\n## Recent documents");
    for (const d of ctx.documents.slice(0, 15)) {
      parts.push(
        `- ${d.createdAt.toISOString().split("T")[0]} · ${d.source} · ${
          d.category ?? "uncategorized"
        } — ${d.fileName}${d.description ? ` (${d.description})` : ""}`,
      );
    }
  }

  if (ctx.communications.length > 0) {
    parts.push("\n## Recent communications (most recent first)");
    for (const c of ctx.communications.slice(0, 15)) {
      const who =
        c.direction === "inbound"
          ? `← ${c.fromAddress ?? "client"}`
          : `→ ${c.toAddress ?? "client"}`;
      parts.push(
        `- ${c.createdAt.toISOString().split("T")[0]} ${c.type} ${who}${
          c.subject ? ` · ${c.subject}` : ""
        }`,
      );
      if (c.body) {
        const truncated = opts.includeFullBodies
          ? c.body
          : c.body.slice(0, maxBody) + (c.body.length > maxBody ? "…" : "");
        parts.push(`    ${truncated.replace(/\n/g, " ")}`);
      }
    }
  }

  return parts.join("\n");
}
