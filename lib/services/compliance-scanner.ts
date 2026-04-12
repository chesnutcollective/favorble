import "server-only";
import { db } from "@/db/drizzle";
import {
  complianceRules,
  complianceFindings,
  providerCredentials,
  cases,
  caseStages,
  caseStageTransitions,
  communications,
  documents,
  organizations,
  tasks,
  caseAssignments,
  auditLog,
  aiDrafts,
  supervisorEvents,
} from "@/db/schema";
import { and, desc, eq, isNull, lt, gt, sql, inArray, isNotNull } from "drizzle-orm";
import { logger } from "@/lib/logger/server";

/**
 * Compliance scanner (PR-2).
 *
 * Each rule is a function that takes an organization id and returns an
 * array of findings. `runComplianceScan` iterates every enabled rule
 * for every organization, runs it, and upserts findings into
 * `complianceFindings` deduped by (rule code, subject id).
 *
 * Current registered rules:
 *   HIPAA_PHI_CREDENTIAL_STORAGE   — implemented
 *   BAR_CASE_STAGE_STAGNANT_90D    — implemented
 *   BAR_MISSING_WELCOME_CALL       — implemented
 *   ETHICS_MISSING_FEE_AGREEMENT   — implemented
 *
 * Adding a rule:
 *   1. Seed a row in `complianceRules` with the new code and default
 *      severity (see `scripts/seed-compliance-rules.ts`).
 *   2. Register a function under the same code in `RULE_REGISTRY`.
 *   3. Return { subjectType, subjectId, summary, details, remediationHint }
 *      — severity is taken from the rule row unless the check overrides it.
 */

type FindingSeverity = "info" | "low" | "medium" | "high" | "critical";

type RuleInput = {
  organizationId: string;
};

type Finding = {
  subjectType: "case" | "document" | "user" | "provider_credential";
  subjectId: string;
  caseId?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
  remediationHint?: string;
  severityOverride?: FindingSeverity;
};

type RuleFn = (input: RuleInput) => Promise<Finding[]>;

// ----- Rule: HIPAA — provider credential storage hygiene -----

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

async function ruleHipaaPhiCredentialStorage(
  input: RuleInput,
): Promise<Finding[]> {
  const rows = await db
    .select({
      id: providerCredentials.id,
      providerName: providerCredentials.providerName,
      passwordEncrypted: providerCredentials.passwordEncrypted,
      createdAt: providerCredentials.createdAt,
      updatedAt: providerCredentials.updatedAt,
      isActive: providerCredentials.isActive,
    })
    .from(providerCredentials)
    .where(eq(providerCredentials.organizationId, input.organizationId));

  const findings: Finding[] = [];
  const now = Date.now();

  for (const row of rows) {
    if (!row.isActive) continue;

    // Missing or empty password
    if (!row.passwordEncrypted || row.passwordEncrypted.trim() === "") {
      findings.push({
        subjectType: "provider_credential",
        subjectId: row.id,
        summary: `Provider credential for ${row.providerName} is missing an encrypted password`,
        details: { providerName: row.providerName },
        remediationHint:
          "Re-enter the credential in the MR vault to restore encrypted storage.",
        severityOverride: "high",
      });
      continue;
    }

    // Rotation overdue: created >1yr ago and never updated
    const createdMs = row.createdAt.getTime();
    const updatedMs = row.updatedAt.getTime();
    const neverRotated = Math.abs(updatedMs - createdMs) < 60_000; // <1 min drift
    if (neverRotated && now - createdMs > ONE_YEAR_MS) {
      findings.push({
        subjectType: "provider_credential",
        subjectId: row.id,
        summary: `Provider credential for ${row.providerName} has not been rotated in over a year`,
        details: {
          providerName: row.providerName,
          ageDays: Math.round((now - createdMs) / 86400000),
        },
        remediationHint:
          "Rotate the credential with a new password and update the MR vault.",
      });
    }
  }

  return findings;
}

// ----- Rule: BAR — case stage stagnant 90 days -----

async function ruleBarCaseStageStagnant90d(
  input: RuleInput,
): Promise<Finding[]> {
  const cutoff = new Date(Date.now() - 90 * 86400000);
  const rows = await db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
      stageEnteredAt: cases.stageEnteredAt,
      stageName: caseStages.name,
    })
    .from(cases)
    .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
    .where(
      and(
        eq(cases.organizationId, input.organizationId),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
        lt(cases.stageEnteredAt, cutoff),
      ),
    );

  return rows.map((r) => ({
    subjectType: "case" as const,
    subjectId: r.id,
    caseId: r.id,
    summary: `Case ${r.caseNumber} has been in ${r.stageName ?? "the same stage"} for 90+ days with no transition`,
    details: {
      stageEnteredAt: r.stageEnteredAt.toISOString(),
      stageName: r.stageName,
    },
    remediationHint:
      "Review the case for a stage transition or document why it is parked.",
  }));
}

// ----- Rule: BAR — missing welcome call within 7 days of intake -----

async function ruleBarMissingWelcomeCall(
  input: RuleInput,
): Promise<Finding[]> {
  const rows = await db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
      createdAt: cases.createdAt,
      stageName: caseStages.name,
      stageCode: caseStages.code,
    })
    .from(cases)
    .leftJoin(caseStages, eq(cases.currentStageId, caseStages.id))
    .where(
      and(
        eq(cases.organizationId, input.organizationId),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
      ),
    );

  const findings: Finding[] = [];
  const sevenDaysMs = 7 * 86400000;

  for (const row of rows) {
    const ageMs = Date.now() - row.createdAt.getTime();
    // Only cases at least 7 days old can fail this rule.
    if (ageMs < sevenDaysMs) continue;

    const windowEnd = new Date(row.createdAt.getTime() + sevenDaysMs);
    const [callRow] = await db
      .select({ id: communications.id })
      .from(communications)
      .where(
        and(
          eq(communications.caseId, row.id),
          eq(communications.type, "phone_outbound"),
          lt(communications.createdAt, windowEnd),
        ),
      )
      .limit(1);

    if (!callRow) {
      findings.push({
        subjectType: "case",
        subjectId: row.id,
        caseId: row.id,
        summary: `Case ${row.caseNumber} has no outbound welcome call within 7 days of intake`,
        details: {
          intakeDate: row.createdAt.toISOString(),
        },
        remediationHint:
          "Log a welcome call or a justification note so the onboarding workflow stays compliant.",
      });
    }
  }

  return findings;
}

// ----- Rule: ETHICS — missing fee agreement on active cases -----

async function ruleEthicsMissingFeeAgreement(
  input: RuleInput,
): Promise<Finding[]> {
  const activeCases = await db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
    })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, input.organizationId),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
      ),
    );

  if (activeCases.length === 0) return [];

  const caseIds = activeCases.map((c) => c.id);

  const feeDocs = await db
    .select({ caseId: documents.caseId })
    .from(documents)
    .where(
      and(
        inArray(documents.caseId, caseIds),
        eq(documents.category, "fee_agreement"),
        isNull(documents.deletedAt),
      ),
    );

  const casesWithFee = new Set(feeDocs.map((d) => d.caseId));

  return activeCases
    .filter((c) => !casesWithFee.has(c.id))
    .map((c) => ({
      subjectType: "case" as const,
      subjectId: c.id,
      caseId: c.id,
      summary: `Case ${c.caseNumber} is active with no fee agreement on file`,
      details: null,
      remediationHint:
        "Upload the signed fee agreement to the case documents in category 'fee_agreement'.",
    }));
}

// ----- Rule: HIPAA — audit log gaps for PHI access -----

async function ruleHipaaAuditLogGaps(input: RuleInput): Promise<Finding[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  // Active cases that have at least one phi_accessed audit entry ever
  const casesWithPhi = await db
    .select({ entityId: auditLog.entityId })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.organizationId, input.organizationId),
        eq(auditLog.action, "phi_accessed"),
      ),
    )
    .groupBy(auditLog.entityId);

  const findings: Finding[] = [];
  for (const row of casesWithPhi) {
    // Check for any audit entry in the last 30 days
    const [recent] = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.organizationId, input.organizationId),
          eq(auditLog.entityId, row.entityId),
          gt(auditLog.createdAt, thirtyDaysAgo),
        ),
      )
      .limit(1);
    if (!recent) {
      findings.push({
        subjectType: "case",
        subjectId: row.entityId,
        caseId: row.entityId,
        summary: `Case with PHI access has no audit log entries in 30 days`,
        remediationHint:
          "Review audit trail for this case to ensure PHI access is being logged.",
        severityOverride: "medium",
      });
    }
  }
  return findings;
}

// ----- Rule: BAR — active case with no attorney assigned -----

async function ruleBarCaseNoAttorneyAssigned(
  input: RuleInput,
): Promise<Finding[]> {
  const activeCases = await db
    .select({ id: cases.id, caseNumber: cases.caseNumber })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, input.organizationId),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
      ),
    );

  const findings: Finding[] = [];
  for (const c of activeCases) {
    const [attorney] = await db
      .select({ id: caseAssignments.id })
      .from(caseAssignments)
      .where(
        and(
          eq(caseAssignments.caseId, c.id),
          eq(caseAssignments.role, "attorney"),
          isNull(caseAssignments.unassignedAt),
        ),
      )
      .limit(1);
    if (!attorney) {
      findings.push({
        subjectType: "case",
        subjectId: c.id,
        caseId: c.id,
        summary: `Case ${c.caseNumber} is active with no attorney assigned`,
        remediationHint:
          "Assign an attorney to this case in the case assignments panel.",
      });
    }
  }
  return findings;
}

// ----- Rule: BAR — hearing in 14 days with no pre-hearing brief -----

async function ruleBarHearingNoBrief(input: RuleInput): Promise<Finding[]> {
  const fourteenDaysFromNow = new Date(Date.now() + 14 * 86400000);
  const now = new Date();

  const upcomingCases = await db
    .select({
      id: cases.id,
      caseNumber: cases.caseNumber,
      hearingDate: cases.hearingDate,
    })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, input.organizationId),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
        isNotNull(cases.hearingDate),
        sql`${cases.hearingDate} >= ${now.toISOString()}`,
        sql`${cases.hearingDate} <= ${fourteenDaysFromNow.toISOString()}`,
      ),
    );

  const findings: Finding[] = [];
  for (const c of upcomingCases) {
    const [brief] = await db
      .select({ id: aiDrafts.id })
      .from(aiDrafts)
      .where(
        and(
          eq(aiDrafts.caseId, c.id),
          eq(aiDrafts.type, "pre_hearing_brief"),
        ),
      )
      .limit(1);
    if (!brief) {
      findings.push({
        subjectType: "case",
        subjectId: c.id,
        caseId: c.id,
        summary: `Case ${c.caseNumber} has a hearing in the next 14 days but no pre-hearing brief draft`,
        remediationHint:
          "Create a pre-hearing brief draft for this case before the hearing date.",
        severityOverride: "high",
      });
    }
  }
  return findings;
}

// ----- Rule: BAR — 65-day appeal deadline missed -----

async function ruleBarAppealDeadlineMissed(
  input: RuleInput,
): Promise<Finding[]> {
  const sixtyFiveDaysAgo = new Date(Date.now() - 65 * 86400000);

  const denialEvents = await db
    .select({
      id: supervisorEvents.id,
      caseId: supervisorEvents.caseId,
      createdAt: supervisorEvents.createdAt,
    })
    .from(supervisorEvents)
    .where(
      and(
        eq(supervisorEvents.organizationId, input.organizationId),
        eq(supervisorEvents.eventType, "denial_received"),
        lt(supervisorEvents.createdAt, sixtyFiveDaysAgo),
      ),
    );

  const findings: Finding[] = [];
  for (const evt of denialEvents) {
    if (!evt.caseId) continue;

    // Check if any appeal was filed after the denial
    const [appeal] = await db
      .select({ id: supervisorEvents.id })
      .from(supervisorEvents)
      .where(
        and(
          eq(supervisorEvents.caseId, evt.caseId),
          sql`${supervisorEvents.eventType} IN ('appeal_filed', 'reconsideration_filed')`,
          gt(supervisorEvents.createdAt, evt.createdAt),
        ),
      )
      .limit(1);
    if (appeal) continue;

    // Confirm the case is still active
    const [caseRow] = await db
      .select({ caseNumber: cases.caseNumber })
      .from(cases)
      .where(
        and(
          eq(cases.id, evt.caseId),
          eq(cases.organizationId, input.organizationId),
          eq(cases.status, "active"),
          isNull(cases.deletedAt),
        ),
      )
      .limit(1);
    if (!caseRow) continue;

    findings.push({
      subjectType: "case",
      subjectId: evt.caseId,
      caseId: evt.caseId,
      summary: `Case ${caseRow.caseNumber}: 65-day appeal deadline has passed with no filing after denial`,
      remediationHint:
        "File an appeal immediately or document good cause for the late filing.",
      severityOverride: "critical",
    });
  }
  return findings;
}

// ----- Rule: ETHICS — client unresponsive 30 days -----

async function ruleEthicsClientUnresponsive30d(
  input: RuleInput,
): Promise<Finding[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const activeCases = await db
    .select({ id: cases.id, caseNumber: cases.caseNumber })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, input.organizationId),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
      ),
    );

  const findings: Finding[] = [];
  for (const c of activeCases) {
    const [recent] = await db
      .select({ id: communications.id })
      .from(communications)
      .where(
        and(
          eq(communications.caseId, c.id),
          eq(communications.direction, "inbound"),
          gt(communications.createdAt, thirtyDaysAgo),
        ),
      )
      .limit(1);
    if (!recent) {
      findings.push({
        subjectType: "case",
        subjectId: c.id,
        caseId: c.id,
        summary: `Case ${c.caseNumber}: no inbound client communication in 30 days`,
        remediationHint:
          "Attempt to contact the client. Document all outreach attempts.",
      });
    }
  }
  return findings;
}

// ----- Rule: ETHICS — tasks overdue by 14+ days -----

async function ruleEthicsTaskOverdue14d(input: RuleInput): Promise<Finding[]> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);

  const overdue = await db
    .select({
      id: tasks.id,
      caseId: tasks.caseId,
      title: tasks.title,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.organizationId, input.organizationId),
        eq(tasks.status, "pending"),
        isNull(tasks.deletedAt),
        isNotNull(tasks.dueDate),
        lt(tasks.dueDate, fourteenDaysAgo),
      ),
    );

  return overdue.map((t) => ({
    subjectType: "case" as const,
    subjectId: t.id,
    caseId: t.caseId,
    summary: `Task "${t.title}" is overdue by 14+ days`,
    remediationHint:
      "Complete the task or reassign it. If no longer needed, close it with a note.",
  }));
}

// ----- Rule: HIPAA — PHI access with no case link -----

async function ruleHipaaPhiAccessNoCaseLink(
  input: RuleInput,
): Promise<Finding[]> {
  const entries = await db
    .select({ id: auditLog.id, entityId: auditLog.entityId })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.organizationId, input.organizationId),
        eq(auditLog.action, "phi_accessed"),
        sql`${auditLog.entityType} != 'case'`,
      ),
    );

  return entries.map((e) => ({
    subjectType: "case" as const,
    subjectId: e.id,
    summary: `Audit log entry for PHI access (${e.entityId}) has no case link`,
    remediationHint:
      "Link this PHI access event to the appropriate case for compliance tracking.",
    severityOverride: "high" as const,
  }));
}

// ----- Rule: BAR — missing case number -----

async function ruleBarMissingCaseNumber(input: RuleInput): Promise<Finding[]> {
  const rows = await db
    .select({ id: cases.id, caseNumber: cases.caseNumber })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, input.organizationId),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
        sql`(${cases.caseNumber} IS NULL OR TRIM(${cases.caseNumber}) = '')`,
      ),
    );

  return rows.map((r) => ({
    subjectType: "case" as const,
    subjectId: r.id,
    caseId: r.id,
    summary: `Active case (ID: ${r.id.slice(0, 8)}...) has no case number`,
    remediationHint:
      "Assign a case number to maintain data integrity and bar compliance.",
    severityOverride: "medium" as const,
  }));
}

// ----- Rule: ETHICS — no activity 60 days -----

async function ruleEthicsNoActivity60d(input: RuleInput): Promise<Finding[]> {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);

  const activeCases = await db
    .select({ id: cases.id, caseNumber: cases.caseNumber })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, input.organizationId),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
      ),
    );

  const findings: Finding[] = [];
  for (const c of activeCases) {
    // Check for any communications activity
    const [comm] = await db
      .select({ id: communications.id })
      .from(communications)
      .where(
        and(eq(communications.caseId, c.id), gt(communications.createdAt, sixtyDaysAgo)),
      )
      .limit(1);
    if (comm) continue;

    // Check for any task activity
    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(eq(tasks.caseId, c.id), gt(tasks.createdAt, sixtyDaysAgo)),
      )
      .limit(1);
    if (task) continue;

    // Check for any audit log activity
    const [audit] = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, c.id),
          gt(auditLog.createdAt, sixtyDaysAgo),
        ),
      )
      .limit(1);
    if (audit) continue;

    findings.push({
      subjectType: "case",
      subjectId: c.id,
      caseId: c.id,
      summary: `Case ${c.caseNumber}: zero activity (communications, tasks, audit) in 60 days`,
      remediationHint:
        "Review case status. If active, document why there is no activity. If resolved, close the case.",
      severityOverride: "high",
    });
  }
  return findings;
}

// ----- Rule: BAR — missing signed fee agreement (with e-signature) -----

async function ruleBarMissingSignedFeeAgreement(
  input: RuleInput,
): Promise<Finding[]> {
  // Cases past intake (i.e. case created >7 days ago as a proxy for "past intake")
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const activeCases = await db
    .select({ id: cases.id, caseNumber: cases.caseNumber })
    .from(cases)
    .where(
      and(
        eq(cases.organizationId, input.organizationId),
        eq(cases.status, "active"),
        isNull(cases.deletedAt),
        lt(cases.createdAt, sevenDaysAgo),
      ),
    );

  if (activeCases.length === 0) return [];

  const caseIds = activeCases.map((c) => c.id);

  // Look for documents where category contains 'fee_agreement' AND source
  // contains 'esignature'
  const signedDocs = await db
    .select({ caseId: documents.caseId })
    .from(documents)
    .where(
      and(
        inArray(documents.caseId, caseIds),
        sql`${documents.category} ILIKE '%fee_agreement%'`,
        sql`${documents.source} ILIKE '%esignature%'`,
        isNull(documents.deletedAt),
      ),
    );

  const casesWithSigned = new Set(signedDocs.map((d) => d.caseId));

  return activeCases
    .filter((c) => !casesWithSigned.has(c.id))
    .map((c) => ({
      subjectType: "case" as const,
      subjectId: c.id,
      caseId: c.id,
      summary: `Case ${c.caseNumber}: missing signed (e-signature) fee agreement`,
      details: null,
      remediationHint:
        "Obtain a signed fee agreement via e-signature and upload it to case documents with category 'fee_agreement' and source containing 'esignature'.",
    }));
}

const RULE_REGISTRY: Record<string, RuleFn> = {
  HIPAA_PHI_CREDENTIAL_STORAGE: ruleHipaaPhiCredentialStorage,
  BAR_CASE_STAGE_STAGNANT_90D: ruleBarCaseStageStagnant90d,
  BAR_MISSING_WELCOME_CALL: ruleBarMissingWelcomeCall,
  ETHICS_MISSING_FEE_AGREEMENT: ruleEthicsMissingFeeAgreement,
  HIPAA_AUDIT_LOG_GAPS: ruleHipaaAuditLogGaps,
  BAR_CASE_NO_ATTORNEY_ASSIGNED: ruleBarCaseNoAttorneyAssigned,
  BAR_HEARING_NO_BRIEF: ruleBarHearingNoBrief,
  BAR_APPEAL_DEADLINE_MISSED: ruleBarAppealDeadlineMissed,
  ETHICS_CLIENT_UNRESPONSIVE_30D: ruleEthicsClientUnresponsive30d,
  ETHICS_TASK_OVERDUE_14D: ruleEthicsTaskOverdue14d,
  HIPAA_PHI_ACCESS_NO_CASE_LINK: ruleHipaaPhiAccessNoCaseLink,
  BAR_MISSING_CASE_NUMBER: ruleBarMissingCaseNumber,
  ETHICS_NO_ACTIVITY_60D: ruleEthicsNoActivity60d,
  BAR_MISSING_SIGNED_FEE_AGREEMENT: ruleBarMissingSignedFeeAgreement,
};

export type RunComplianceScanResult = {
  organizationsScanned: number;
  rulesEvaluated: number;
  findingsInserted: number;
  findingsSkipped: number;
  rulesWithoutImplementation: string[];
};

/**
 * Upsert helper — dedup by (rule code + subject id). We use a read-then-
 * insert pattern instead of a DB-level unique constraint to keep the
 * schema untouched and allow admins to re-open remediated findings
 * manually without fighting a constraint.
 */
async function findingExists(
  organizationId: string,
  ruleCode: string,
  subjectId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: complianceFindings.id })
    .from(complianceFindings)
    .where(
      and(
        eq(complianceFindings.organizationId, organizationId),
        eq(complianceFindings.ruleCode, ruleCode),
        eq(complianceFindings.subjectId, subjectId),
        inArray(complianceFindings.status, ["open", "acknowledged"]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Run every enabled rule for every organization. In practice this is
 * a single org today, but multi-tenant expansion is built in.
 */
export async function runComplianceScan(): Promise<RunComplianceScanResult> {
  const orgs = await db.select({ id: organizations.id }).from(organizations);
  const rules = await db
    .select({
      code: complianceRules.code,
      defaultSeverity: complianceRules.defaultSeverity,
      enabled: complianceRules.enabled,
      organizationId: complianceRules.organizationId,
    })
    .from(complianceRules)
    .where(eq(complianceRules.enabled, true));

  let findingsInserted = 0;
  let findingsSkipped = 0;
  let rulesEvaluated = 0;
  const rulesWithoutImplementation: string[] = [];

  for (const org of orgs) {
    for (const rule of rules) {
      if (rule.organizationId && rule.organizationId !== org.id) continue;

      const fn = RULE_REGISTRY[rule.code];
      if (!fn) {
        if (!rulesWithoutImplementation.includes(rule.code)) {
          rulesWithoutImplementation.push(rule.code);
        }
        continue;
      }

      rulesEvaluated++;
      try {
        const findings = await fn({ organizationId: org.id });
        for (const finding of findings) {
          if (
            await findingExists(org.id, rule.code, finding.subjectId)
          ) {
            findingsSkipped++;
            continue;
          }
          try {
            await db.insert(complianceFindings).values({
              organizationId: org.id,
              ruleCode: rule.code,
              caseId: finding.caseId ?? null,
              subjectType: finding.subjectType,
              subjectId: finding.subjectId,
              severity: finding.severityOverride ?? rule.defaultSeverity,
              status: "open",
              summary: finding.summary,
              details: finding.details ?? null,
              remediationHint: finding.remediationHint ?? null,
            });
            findingsInserted++;
          } catch (err) {
            logger.error("compliance-scanner: failed to insert finding", {
              ruleCode: rule.code,
              subjectId: finding.subjectId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } catch (err) {
        logger.error("compliance-scanner: rule failed", {
          ruleCode: rule.code,
          organizationId: org.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    organizationsScanned: orgs.length,
    rulesEvaluated,
    findingsInserted,
    findingsSkipped,
    rulesWithoutImplementation,
  };
}

/**
 * Expose the registered rule codes so admin UIs can show which
 * scanners have an implementation vs rules that live only in the DB.
 */
export function getImplementedRuleCodes(): string[] {
  return Object.keys(RULE_REGISTRY);
}
