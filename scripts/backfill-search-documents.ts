/**
 * Backfill the polymorphic `search_documents` index for every existing
 * row in every indexed entity table.
 *
 * Strategy: trigger re-fire. Each entity's `trg_search_*` trigger runs
 * on UPDATE, so we touch every live row with a no-op UPDATE inside a
 * single transaction per table. This is the cheapest way to guarantee
 * every row flows through the exact same serialization path that live
 * writes use, without duplicating the trigger logic in TypeScript.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-search-documents.ts
 *
 * Guardrail: will NOT run against a non-localhost DATABASE_URL unless
 * --yes-staging is passed. Running against staging is safe (the index
 * table already exists) but you should know you're doing it.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const argv = new Set(process.argv.slice(2));

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const DATABASE_URL = rawUrl.replace(/\\n$/, "").replace(/\n$/, "");

const hostMatch = DATABASE_URL.match(/@([^/:?]+)(?::|\/|\?|$)/);
const host = hostMatch?.[1] ?? "";
const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
if (!isLocal && !argv.has("--yes-staging")) {
  console.error(
    `Refusing: DATABASE_URL host is "${host}". Pass --yes-staging to run against a remote DB.`,
  );
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

type TableSpec = {
  table: string;
  softDelete?: boolean;
};

const TABLES: TableSpec[] = [
  { table: "cases", softDelete: true },
  { table: "contacts", softDelete: true },
  { table: "leads", softDelete: true },
  { table: "users" },
  { table: "documents", softDelete: true },
  { table: "medical_chronology_entries" },
  { table: "calendar_events", softDelete: true },
  { table: "tasks", softDelete: true },
  { table: "communications" },
  { table: "chat_messages" },
  { table: "outbound_mail" },
  { table: "invoices" },
  { table: "trust_transactions" },
];

async function touchTable(spec: TableSpec): Promise<number> {
  // UPDATE ... SET id = id re-fires triggers without actually changing
  // any columns. Skips soft-deleted rows via the optional filter.
  const where = spec.softDelete ? sql`WHERE deleted_at IS NULL` : sql``;
  const res = await sql.unsafe(
    `UPDATE ${spec.table} SET updated_at = updated_at ${spec.softDelete ? "WHERE deleted_at IS NULL" : ""}`,
  ).catch(async () => {
    // Fall back for tables without updated_at.
    return sql.unsafe(`UPDATE ${spec.table} SET id = id ${spec.softDelete ? "WHERE deleted_at IS NULL" : ""}`);
  });
  const n = (res as unknown as { count: number }).count ?? 0;
  console.log(`  ${spec.table.padEnd(28)} ${n} rows`);
  return n;
}

async function main() {
  console.log("=== Search backfill ===");
  console.log(`DATABASE_URL host: ${host}\n`);

  // Count pre-backfill state.
  const before = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM search_documents WHERE deleted_at IS NULL
  `;
  console.log(`search_documents rows before: ${before[0].n}\n`);

  let total = 0;
  for (const spec of TABLES) {
    try {
      total += await touchTable(spec);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ${spec.table.padEnd(28)} ERROR: ${msg.slice(0, 120)}`);
    }
  }

  const after = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM search_documents WHERE deleted_at IS NULL
  `;
  console.log(`\nsearch_documents rows after:  ${after[0].n}`);
  console.log(`rows touched across tables:   ${total}`);

  // Sanity: group by entity_type to show coverage.
  const byType = await sql<{ entity_type: string; n: number }[]>`
    SELECT entity_type, count(*)::int AS n
    FROM search_documents
    WHERE deleted_at IS NULL
    GROUP BY entity_type
    ORDER BY n DESC
  `;
  console.log("\nCoverage by entity_type:");
  for (const row of byType) {
    console.log(`  ${row.entity_type.padEnd(24)} ${row.n}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
