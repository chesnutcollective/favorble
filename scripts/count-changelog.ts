import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../db/drizzle");
  const { changelogSummaries } = await import(
    "../db/schema/changelog-summaries"
  );
  const { sql } = await import("drizzle-orm");

  const byStatus = await db
    .select({
      status: changelogSummaries.status,
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(changelogSummaries)
    .groupBy(changelogSummaries.status);

  const total = await db
    .select({ count: sql<number>`count(*)::int`.as("count") })
    .from(changelogSummaries);

  console.log("Total rows:", total[0].count);
  console.log("By status:", byStatus);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
