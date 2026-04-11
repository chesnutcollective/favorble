"use server";

import { db } from "@/db/drizzle";
import {
  complianceRules,
  complianceFindings,
  cases,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";

/**
 * Compliance server actions (PR-2). Back the `/admin/compliance` page
 * and its finding-level actions.
 */

export type ComplianceFindingStatus =
  | "open"
  | "acknowledged"
  | "remediated"
  | "false_positive";

export type ComplianceSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical";

export type ComplianceFindingListItem = {
  id: string;
  ruleCode: string;
  ruleName: string | null;
  caseId: string | null;
  caseNumber: string | null;
  subjectType: string;
  severity: ComplianceSeverity;
  status: ComplianceFindingStatus;
  summary: string;
  remediationHint: string | null;
  detectedAt: string;
};

export type ComplianceRuleListItem = {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  defaultSeverity: ComplianceSeverity;
  enabled: boolean;
};

export async function getComplianceFindings(
  status?: ComplianceFindingStatus,
): Promise<ComplianceFindingListItem[]> {
  const session = await requireSession();

  const conditions = [
    eq(complianceFindings.organizationId, session.organizationId),
  ];
  if (status) {
    conditions.push(eq(complianceFindings.status, status));
  }

  const rows = await db
    .select({
      id: complianceFindings.id,
      ruleCode: complianceFindings.ruleCode,
      caseId: complianceFindings.caseId,
      subjectType: complianceFindings.subjectType,
      severity: complianceFindings.severity,
      status: complianceFindings.status,
      summary: complianceFindings.summary,
      remediationHint: complianceFindings.remediationHint,
      detectedAt: complianceFindings.detectedAt,
      ruleName: complianceRules.name,
      caseNumber: cases.caseNumber,
    })
    .from(complianceFindings)
    .leftJoin(
      complianceRules,
      eq(complianceRules.code, complianceFindings.ruleCode),
    )
    .leftJoin(cases, eq(cases.id, complianceFindings.caseId))
    .where(and(...conditions))
    .orderBy(desc(complianceFindings.detectedAt))
    .limit(500);

  return rows.map((r) => ({
    id: r.id,
    ruleCode: r.ruleCode,
    ruleName: r.ruleName ?? null,
    caseId: r.caseId ?? null,
    caseNumber: r.caseNumber ?? null,
    subjectType: r.subjectType,
    severity: r.severity as ComplianceSeverity,
    status: r.status as ComplianceFindingStatus,
    summary: r.summary,
    remediationHint: r.remediationHint ?? null,
    detectedAt: r.detectedAt.toISOString(),
  }));
}

export async function getComplianceRules(): Promise<ComplianceRuleListItem[]> {
  await requireSession();
  const rows = await db
    .select({
      id: complianceRules.id,
      code: complianceRules.code,
      name: complianceRules.name,
      description: complianceRules.description,
      category: complianceRules.category,
      defaultSeverity: complianceRules.defaultSeverity,
      enabled: complianceRules.enabled,
    })
    .from(complianceRules)
    .orderBy(complianceRules.category, complianceRules.code);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    category: r.category,
    defaultSeverity: r.defaultSeverity as ComplianceSeverity,
    enabled: r.enabled,
  }));
}

export async function acknowledgeComplianceFinding(findingId: string) {
  const session = await requireSession();
  await db
    .update(complianceFindings)
    .set({
      status: "acknowledged",
      acknowledgedBy: session.id,
      acknowledgedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(complianceFindings.id, findingId),
        eq(complianceFindings.organizationId, session.organizationId),
      ),
    );
  revalidatePath("/admin/compliance");
  return { success: true };
}

export async function remediateComplianceFinding(findingId: string) {
  const session = await requireSession();
  await db
    .update(complianceFindings)
    .set({
      status: "remediated",
      remediatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(complianceFindings.id, findingId),
        eq(complianceFindings.organizationId, session.organizationId),
      ),
    );
  revalidatePath("/admin/compliance");
  return { success: true };
}

export async function markComplianceFindingFalsePositive(findingId: string) {
  const session = await requireSession();
  await db
    .update(complianceFindings)
    .set({
      status: "false_positive",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(complianceFindings.id, findingId),
        eq(complianceFindings.organizationId, session.organizationId),
      ),
    );
  revalidatePath("/admin/compliance");
  return { success: true };
}
