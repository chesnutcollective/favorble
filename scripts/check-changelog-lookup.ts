import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../db/drizzle");
  const { changelogSummaries } = await import(
    "../db/schema/changelog-summaries"
  );
  const { eq } = await import("drizzle-orm");

  const sha = "f582cff4242b2d00f3300855af0e04c7cfa19c9b";
  const start = Date.now();
  const rows = await db
    .select()
    .from(changelogSummaries)
    .where(eq(changelogSummaries.sha, sha))
    .limit(1);
  console.log(`Query: ${Date.now() - start}ms`);
  console.log(`Found: ${!!rows[0]}, status: ${rows[0]?.status}`);
  console.log(`Summary: "${rows[0]?.summary?.slice(0, 80)}..."`);
  console.log(`Bullets: ${rows[0]?.bullets?.length} items`);
  process.exit(0);
}

main();
