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
} from "@/db/schema";
import { and, desc, eq, isNull, lt, gt, sql, inArray } from "drizzle-orm";
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

const RULE_REGISTRY: Record<string, RuleFn> = {
  HIPAA_PHI_CREDENTIAL_STORAGE: ruleHipaaPhiCredentialStorage,
  BAR_CASE_STAGE_STAGNANT_90D: ruleBarCaseStageStagnant90d,
  BAR_MISSING_WELCOME_CALL: ruleBarMissingWelcomeCall,
  ETHICS_MISSING_FEE_AGREEMENT: ruleEthicsMissingFeeAgreement,
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
