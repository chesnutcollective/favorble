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
