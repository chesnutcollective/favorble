/**
 * Embedding worker.
 *
 * Polls `search_documents WHERE embedding IS NULL AND deleted_at IS NULL`,
 * batches them, embeds each batch through the configured provider, and
 * writes the resulting vectors back. Runs as either:
 *
 *   1. A long-lived Railway background service (the default: sets
 *      `LOOP=1` and sleeps between batches), or
 *
 *   2. A one-shot batch job invoked by cron / a migration hook.
 *
 * Env vars used (see lib/search/embed-client.ts for provider details):
 *   DATABASE_URL                       — Postgres URL (required)
 *   SEARCH_EMBEDDING_PROVIDER          — azure | openai | bge | stub
 *   SEARCH_EMBEDDING_DIM               — defaults to 1536
 *   SEARCH_EMBEDDING_BATCH_SIZE        — rows per iteration, default 32
 *   SEARCH_EMBEDDING_MAX_CHARS         — truncate long body fields, default 8000
 *   SEARCH_EMBEDDING_LOOP_INTERVAL_MS  — sleep between loops, default 5000
 *   LOOP                               — set to "1" to run forever
 *
 * Reads the content from title + subtitle + body so the vector
 * represents the whole display representation, not just the title.
 * Body is truncated to the first N characters (default 8000) to
 * bound token cost; chunks (phase 3) get their own embeddings with a
 * tighter budget.
 *
 * Usage:
 *   pnpm tsx scripts/embedding-worker.ts --once        # single batch
 *   LOOP=1 pnpm tsx scripts/embedding-worker.ts        # long-running
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { embedMany, isEmbeddingConfigured } from "../lib/search/embed-client";

const BATCH_SIZE = Number(process.env.SEARCH_EMBEDDING_BATCH_SIZE ?? "32");
const MAX_CHARS = Number(process.env.SEARCH_EMBEDDING_MAX_CHARS ?? "8000");
const LOOP_INTERVAL_MS = Number(
  process.env.SEARCH_EMBEDDING_LOOP_INTERVAL_MS ?? "5000",
);
const LOOP = process.env.LOOP === "1" && !process.argv.includes("--once");

if (!isEmbeddingConfigured()) {
  console.warn(
    "SEARCH_EMBEDDING_PROVIDER is 'stub' or unset — worker will run but write all-zero vectors. Configure azure/openai/bge for real semantic search.",
  );
}

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const sql = postgres(rawUrl.replace(/\\n$/, "").replace(/\n$/, ""), {
  max: 1,
});

type PendingRow = {
  id: string;
  title: string;
  subtitle: string | null;
  body: string | null;
};

async function fetchPendingBatch(limit: number): Promise<PendingRow[]> {
  // Claim rows by temporarily marking embedding with the sentinel
  // `'[]'::vector(0)` is impossible with our dim, so we use a
  // dedicated claim pattern: select IDs then leave them for the
  // UPDATE to narrow. Simpler approach: rely on the worker being
  // single-instance and select by indexed_at.
  const rows = await sql<PendingRow[]>`
    SELECT id::text AS id, title, subtitle, body
    FROM search_documents
    WHERE embedding IS NULL
      AND deleted_at IS NULL
    ORDER BY indexed_at ASC
    LIMIT ${limit}
  `;
  return rows;
}

function rowToEmbedInput(row: PendingRow): string {
  const parts = [row.title];
  if (row.subtitle) parts.push(row.subtitle);
  if (row.body) parts.push(row.body.slice(0, MAX_CHARS));
  return parts.join("\n\n").slice(0, MAX_CHARS);
}

async function writeEmbedding(id: string, vec: number[]): Promise<void> {
  const literal = `[${vec.join(",")}]`;
  await sql`
    UPDATE search_documents
    SET embedding = ${literal}::vector
    WHERE id = ${id}::uuid
  `;
}

async function markFailed(ids: string[]): Promise<void> {
  // Bump indexed_at so failed rows fall to the back of the queue
  // instead of being re-tried immediately in a tight loop.
  if (!ids.length) return;
  await sql`
    UPDATE search_documents
    SET indexed_at = now()
    WHERE id = ANY(${ids}::uuid[])
  `;
}

async function runOnce(): Promise<{ processed: number; failed: number }> {
  const batch = await fetchPendingBatch(BATCH_SIZE);
  if (!batch.length) return { processed: 0, failed: 0 };

  const inputs = batch.map(rowToEmbedInput);
  const vectors = await embedMany(inputs);

  let processed = 0;
  const failed: string[] = [];
  for (let i = 0; i < batch.length; i++) {
    const vec = vectors[i];
    if (!vec || !Array.isArray(vec)) {
      failed.push(batch[i].id);
      continue;
    }
    try {
      await writeEmbedding(batch[i].id, vec);
      processed += 1;
    } catch (err) {
      failed.push(batch[i].id);
      console.warn(
        `  embed write failed for ${batch[i].id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  if (failed.length) await markFailed(failed);

  return { processed, failed: failed.length };
}

async function main() {
  console.log("=== Embedding worker ===");
  console.log(
    `provider=${process.env.SEARCH_EMBEDDING_PROVIDER ?? "stub"} batch=${BATCH_SIZE} loop=${LOOP ? "yes" : "once"}`,
  );

  const [initial] = await sql<{ pending: number; done: number }[]>`
    SELECT
      count(*) FILTER (WHERE embedding IS NULL)::int AS pending,
      count(*) FILTER (WHERE embedding IS NOT NULL)::int AS done
    FROM search_documents
    WHERE deleted_at IS NULL
  `;
  console.log(
    `initial state: ${initial.pending} pending · ${initial.done} embedded\n`,
  );

  let iteration = 0;
  let totalProcessed = 0;
  let totalFailed = 0;

  while (true) {
    iteration += 1;
    const start = Date.now();
    const { processed, failed } = await runOnce();
    totalProcessed += processed;
    totalFailed += failed;
    const elapsed = Date.now() - start;

    if (processed === 0 && failed === 0) {
      if (!LOOP) break;
      console.log(
        `iter ${iteration}: no pending rows, sleeping ${LOOP_INTERVAL_MS}ms`,
      );
    } else {
      console.log(
        `iter ${iteration}: processed=${processed} failed=${failed} in ${elapsed}ms (total ${totalProcessed})`,
      );
    }

    if (!LOOP) break;
    await new Promise((r) => setTimeout(r, LOOP_INTERVAL_MS));
  }

  const [final] = await sql<{ pending: number; done: number }[]>`
    SELECT
      count(*) FILTER (WHERE embedding IS NULL)::int AS pending,
      count(*) FILTER (WHERE embedding IS NOT NULL)::int AS done
    FROM search_documents
    WHERE deleted_at IS NULL
  `;
  console.log(
    `\nfinal state:   ${final.pending} pending · ${final.done} embedded`,
  );
  console.log(
    `this run:      ${totalProcessed} processed · ${totalFailed} failed`,
  );

  await sql.end();
}

main().catch((err) => {
  console.error("embedding worker crashed:", err);
  process.exit(1);
});
