/**
 * Run the LangExtract pipeline over all Chronicle-seeded documents that
 * have a real PDF (storage_path starts with `railway://`) and haven't yet
 * been processed.
 *
 * This is the post-processing step that `seed-from-chronicle.ts` never
 * ran. The seed script only loads rows and uploads the PDF blobs — it
 * doesn't invoke the extraction pipeline. This script closes that gap.
 *
 * Run (the shell preload + react-server condition are BOTH required):
 *
 *   env $(cat .env.local | grep -v '^#' | xargs) \
 *     NODE_OPTIONS="--conditions=react-server" \
 *     pnpm tsx scripts/process-chronicle-pdfs.ts
 *
 * Why the shell preload: `@/db/drizzle` and `@/lib/storage/railway-bucket`
 * both read env vars at module load time. Static imports hoist above
 * `dotenv.config()`, so using `dotenv` as a library results in undefined
 * vars at import time. Preloading via the shell avoids this ordering
 * problem entirely.
 *
 * Why the react-server condition: `@/lib/services/document-processor`
 * imports `server-only`, which throws unless Node resolves the
 * `react-server` export condition (mapped to an empty file).
 *
 * Requires: DATABASE_URL, RAILWAY_BUCKET_*, and the langextract-worker
 * URL to be reachable. `.env.local` has all of these.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, isNull, like } from "drizzle-orm";
import * as schema from "../db/schema";
import { processDocument } from "../lib/services/document-processor";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

async function main() {
  const pg = postgres(DATABASE_URL as string);
  const db = drizzle(pg, { schema });

  console.log("=== Process Chronicle PDFs via LangExtract ===\n");

  // Find all Chronicle-source documents with real PDFs that haven't been
  // processed yet (left join to document_processing_results).
  const rows = await pg<
    Array<{
      id: string;
      organization_id: string;
      file_name: string;
      case_id: string | null;
    }>
  >`
    SELECT
      d.id,
      d.organization_id,
      d.file_name,
      d.case_id
    FROM documents d
    LEFT JOIN document_processing_results dpr
      ON dpr.document_id = d.id AND dpr.status = 'completed'
    WHERE d.source = 'chronicle'
      AND d.storage_path LIKE 'railway://%'
      AND dpr.id IS NULL
      AND d.deleted_at IS NULL
    ORDER BY d.created_at DESC
  `;

  console.log(`Found ${rows.length} Chronicle PDFs to process.\n`);

  if (rows.length === 0) {
    console.log("Nothing to do.");
    await pg.end();
    return;
  }

  let success = 0;
  let failed = 0;
  const errors: Array<{ fileName: string; error: string }> = [];

  for (const doc of rows) {
    const preview = doc.file_name.slice(0, 70);
    process.stdout.write(`→ ${preview.padEnd(72)}`);

    try {
      const result = await processDocument({
        documentId: doc.id,
        organizationId: doc.organization_id,
        extractionType: "medical_record",
      });

      if (result.success) {
        console.log(" ✓");
        success++;
      } else {
        console.log(` ✗ ${result.error ?? "unknown"}`);
        failed++;
        errors.push({
          fileName: doc.file_name,
          error: result.error ?? "unknown",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(` ✗ ${msg}`);
      failed++;
      errors.push({ fileName: doc.file_name, error: msg });
    }

    // Small delay to avoid hammering Gemini rate limits (langextract-worker
    // tends to return 429/503 under load).
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Success:  ${success}`);
  console.log(`  Failed:   ${failed}`);

  if (errors.length > 0) {
    console.log(`\nFailures:`);
    for (const e of errors) {
      console.log(`  ${e.fileName}`);
      console.log(`    ${e.error}`);
    }
  }

  // Report chronology + processing result counts after the run
  const chronCount = await pg<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM medical_chronology_entries
  `;
  const procCount = await pg<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM document_processing_results
    WHERE status = 'completed'
  `;
  console.log(`\n  Total chronology entries: ${chronCount[0].n}`);
  console.log(`  Total completed processing results: ${procCount[0].n}`);

  await pg.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
