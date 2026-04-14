/**
 * Seed default integration alert rules for critical integrations.
 *
 * Run:
 *
 *   env $(cat .env.local | grep -v '^#' | xargs) \
 *     NODE_OPTIONS="--conditions=react-server" \
 *     pnpm tsx scripts/seed-integration-alerts.ts
 *
 * Idempotent — skips if a rule already exists for the integration + org pair.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import { integrationAlertRules, organizations } from "../db/schema";
import { and, eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

/**
 * Critical integrations that get default alert rules.
 * 3 failures in 60 minutes triggers an alert.
 */
const CRITICAL_INTEGRATIONS = [
  "ere-orchestrator",
  "case-status",
  "langextract",
  "railway-postgres",
  "anthropic",
  "mycase",
  "vercel",
];

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_WINDOW_MINUTES = 60;

async function main() {
  const pg = postgres(DATABASE_URL as string);
  const db = drizzle(pg, { schema });

  console.log("=== Seed integration alert rules ===\n");

  // Get all organizations
  const orgs = await db.select({ id: organizations.id }).from(organizations);

  if (orgs.length === 0) {
    console.error("No organizations found in the database");
    await pg.end();
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;

  for (const org of orgs) {
    for (const integrationId of CRITICAL_INTEGRATIONS) {
      // Check if a rule already exists for this integration + org
      const [existing] = await db
        .select({ id: integrationAlertRules.id })
        .from(integrationAlertRules)
        .where(
          and(
            eq(integrationAlertRules.organizationId, org.id),
            eq(integrationAlertRules.integrationId, integrationId),
          ),
        )
        .limit(1);

      if (existing) {
        console.log(`  - ${integrationId} (org ${org.id.slice(0, 8)}...): already exists, skipping`);
        skipped++;
        continue;
      }

      await db.insert(integrationAlertRules).values({
        organizationId: org.id,
        integrationId,
        failureThreshold: DEFAULT_FAILURE_THRESHOLD,
        windowMinutes: DEFAULT_WINDOW_MINUTES,
        enabled: "true",
      });

      console.log(`  + ${integrationId} (org ${org.id.slice(0, 8)}...): created (3 failures / 60 min)`);
      created++;
    }
  }

  console.log(`\nDone: ${created} rules created, ${skipped} skipped (already existed)\n`);

  await pg.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
