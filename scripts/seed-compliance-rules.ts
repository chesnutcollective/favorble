/**
 * Seed compliance rules (PR-2). Inserts the four scanner-backed rules
 * into `complianceRules` so the scanner has metadata to work with.
 *
 * Run:
 *
 *   env $(cat .env.local | grep -v '^#' | xargs) \
 *     NODE_OPTIONS="--conditions=react-server" \
 *     pnpm tsx scripts/seed-compliance-rules.ts
 *
 * Idempotent — uses ON CONFLICT (code) DO UPDATE, so re-running will
 * refresh the description/severity without duplicating rows.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import { complianceRules } from "../db/schema";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

type RuleSeed = {
  code: string;
  name: string;
  description: string;
  category: "bar" | "ethics" | "documentation" | "hipaa";
  defaultSeverity: "info" | "low" | "medium" | "high" | "critical";
};

const RULES: RuleSeed[] = [
  // --- Existing 4 rules ---
  {
    code: "HIPAA_PHI_CREDENTIAL_STORAGE",
    name: "PHI credential storage hygiene",
    description:
      "Flags any provider credential where the encrypted password is missing or the credential has not been rotated in the last year.",
    category: "hipaa",
    defaultSeverity: "high",
  },
  {
    code: "BAR_CASE_STAGE_STAGNANT_90D",
    name: "Stagnant case (90 days, no stage transition)",
    description:
      "Raises a finding on any active case that has been in the same stage for 90+ days with no recorded transition.",
    category: "bar",
    defaultSeverity: "medium",
  },
  {
    code: "BAR_MISSING_WELCOME_CALL",
    name: "Missing welcome call",
    description:
      "Cases 7+ days past intake with no outbound phone communication on file within the first 7 days.",
    category: "bar",
    defaultSeverity: "medium",
  },
  {
    code: "ETHICS_MISSING_FEE_AGREEMENT",
    name: "Missing fee agreement",
    description:
      "Active cases without any document in category 'fee_agreement'. A signed fee agreement is required before work proceeds.",
    category: "ethics",
    defaultSeverity: "high",
  },
  // --- 10 new rules ---
  {
    code: "HIPAA_AUDIT_LOG_GAPS",
    name: "HIPAA audit log gaps (30 days)",
    description:
      "Cases with PHI access history but no audit log entry in the last 30 days. Continuous audit coverage is required for HIPAA compliance.",
    category: "hipaa",
    defaultSeverity: "medium",
  },
  {
    code: "BAR_CASE_NO_ATTORNEY_ASSIGNED",
    name: "No attorney assigned to active case",
    description:
      "Active cases with no attorney in case assignments. Every active case must have a supervising attorney.",
    category: "bar",
    defaultSeverity: "high",
  },
  {
    code: "BAR_HEARING_NO_BRIEF",
    name: "Hearing approaching without pre-hearing brief",
    description:
      "Cases with a hearing in the next 14 days and no pre-hearing brief AI draft on file.",
    category: "bar",
    defaultSeverity: "high",
  },
  {
    code: "BAR_APPEAL_DEADLINE_MISSED",
    name: "65-day appeal deadline missed",
    description:
      "Cases where a denial was received over 65 days ago with no appeal or reconsideration filing on record.",
    category: "bar",
    defaultSeverity: "critical",
  },
  {
    code: "ETHICS_CLIENT_UNRESPONSIVE_30D",
    name: "Client unresponsive (30 days)",
    description:
      "Active cases with no inbound client communication in 30 days. Ethical duty to maintain client contact.",
    category: "ethics",
    defaultSeverity: "medium",
  },
  {
    code: "ETHICS_TASK_OVERDUE_14D",
    name: "Task overdue by 14+ days",
    description:
      "Pending tasks that are overdue by 14 or more days. Overdue tasks may indicate neglected client obligations.",
    category: "ethics",
    defaultSeverity: "medium",
  },
  {
    code: "HIPAA_PHI_ACCESS_NO_CASE_LINK",
    name: "PHI access without case link",
    description:
      "Audit log entries with action 'phi_accessed' that are not linked to a specific case. All PHI access must be traceable to a case.",
    category: "hipaa",
    defaultSeverity: "high",
  },
  {
    code: "BAR_MISSING_CASE_NUMBER",
    name: "Missing case number on active case",
    description:
      "Active cases with an empty or null case number. Every case must have a valid case number for tracking and bar compliance.",
    category: "bar",
    defaultSeverity: "medium",
  },
  {
    code: "ETHICS_NO_ACTIVITY_60D",
    name: "No activity on case (60 days)",
    description:
      "Active cases with zero audit log, task, or communication activity in the last 60 days. May indicate abandoned representation.",
    category: "ethics",
    defaultSeverity: "high",
  },
  {
    code: "BAR_MISSING_SIGNED_FEE_AGREEMENT",
    name: "Missing signed (e-signature) fee agreement",
    description:
      "Cases past intake stage with no document where category contains 'fee_agreement' AND source contains 'esignature'. A signed fee agreement is required for bar compliance.",
    category: "bar",
    defaultSeverity: "high",
  },
];

async function main() {
  const pg = postgres(DATABASE_URL as string);
  const db = drizzle(pg, { schema });

  console.log("=== Seed compliance rules ===\n");

  for (const rule of RULES) {
    await db
      .insert(complianceRules)
      .values({
        code: rule.code,
        name: rule.name,
        description: rule.description,
        category: rule.category,
        defaultSeverity: rule.defaultSeverity,
        enabled: true,
      })
      .onConflictDoUpdate({
        target: complianceRules.code,
        set: {
          name: rule.name,
          description: rule.description,
          category: rule.category,
          defaultSeverity: rule.defaultSeverity,
          updatedAt: new Date(),
        },
      });
    console.log(`  • ${rule.code} (${rule.defaultSeverity})`);
  }

  const total = await db.execute<{ c: number }>(
    sql`SELECT COUNT(*)::int AS c FROM compliance_rules`,
  );
  console.log(`\nTotal rules in table: ${total[0]?.c ?? 0}\n`);

  await pg.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
