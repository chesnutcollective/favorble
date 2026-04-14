/**
 * Chunk every document's OCR'd extracted_text into passages and index
 * them for passage-level retrieval.
 *
 * Reads from:  document_processing_results (joined to documents + cases)
 * Writes to:
 *   1. document_chunks — the canonical table with page/offset metadata
 *   2. search_documents — as entity_type='document_chunk' so the main
 *      search pipeline surfaces individual passages with their own
 *      embedding alongside regular document rows.
 *
 * Idempotent: deletes existing chunks for a document before rechunking.
 * Safe to re-run.
 *
 * Usage:
 *   pnpm tsx scripts/chunk-documents.ts --yes-staging
 *   pnpm tsx scripts/chunk-documents.ts --yes-staging --document-id <uuid>
 *   pnpm tsx scripts/chunk-documents.ts --limit 10
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { chunkText } from "../lib/search/chunker";

const argv = process.argv.slice(2);
const hasFlag = (name: string) => argv.includes(name);
const getArg = (name: string): string | undefined => {
  const idx = argv.indexOf(name);
  if (idx < 0 || idx + 1 >= argv.length) return undefined;
  return argv[idx + 1];
};

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("DATABASE_URL not set.");
  process.exit(1);
}
const DATABASE_URL = rawUrl.replace(/\\n$/, "").replace(/\n$/, "");

const hostMatch = DATABASE_URL.match(/@([^/:?]+)(?::|\/|\?|$)/);
const host = hostMatch?.[1] ?? "";
const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
if (!isLocal && !hasFlag("--yes-staging")) {
  console.error(
    `Refusing: DATABASE_URL host is "${host}". Pass --yes-staging to run against a remote DB.`,
  );
  process.exit(1);
}

const limit = Number(getArg("--limit") ?? "0"); // 0 = no limit
const only = getArg("--document-id");

const sql = postgres(DATABASE_URL, { max: 1 });

type DocRow = {
  document_id: string;
  organization_id: string;
  case_id: string | null;
  file_name: string;
  category: string | null;
  extracted_text: string | null;
  allowed_roles: string[];
};

async function fetchDocuments(): Promise<DocRow[]> {
  if (only) {
    return sql<DocRow[]>`
      SELECT
        dp.document_id                                          AS document_id,
        c.organization_id                                       AS organization_id,
        d.case_id                                                AS case_id,
        d.file_name                                              AS file_name,
        d.category                                               AS category,
        dp.extracted_text                                        AS extracted_text,
        ARRAY['attorney','case_manager','medical_records','phi_sheet_writer','reviewer','admin']::text[] AS allowed_roles
      FROM document_processing_results dp
      JOIN documents d ON d.id = dp.document_id
      JOIN cases c     ON c.id = d.case_id
      WHERE dp.document_id = ${only}::uuid
        AND dp.extracted_text IS NOT NULL
    `;
  }
  const limitClause = limit > 0 ? sql`LIMIT ${limit}` : sql``;
  return sql<DocRow[]>`
    SELECT
      dp.document_id                                          AS document_id,
      c.organization_id                                       AS organization_id,
      d.case_id                                                AS case_id,
      d.file_name                                              AS file_name,
      d.category                                               AS category,
      dp.extracted_text                                        AS extracted_text,
      ARRAY['attorney','case_manager','medical_records','phi_sheet_writer','reviewer','admin']::text[] AS allowed_roles
    FROM document_processing_results dp
    JOIN documents d ON d.id = dp.document_id
    JOIN cases c     ON c.id = d.case_id
    WHERE dp.extracted_text IS NOT NULL
      AND length(dp.extracted_text) > 200
    ORDER BY d.created_at DESC
    ${limitClause}
  `;
}

async function deleteExistingChunks(documentId: string): Promise<void> {
  // Delete from document_chunks first; search_documents rows are
  // cleaned up by a companion DELETE keyed on entity_id.
  const existing = await sql<{ id: string }[]>`
    SELECT id::text AS id FROM document_chunks WHERE document_id = ${documentId}::uuid
  `;
  if (!existing.length) return;
  const ids = existing.map((r) => r.id);
  await sql`
    DELETE FROM document_chunks WHERE document_id = ${documentId}::uuid
  `;
  await sql`
    UPDATE search_documents
    SET deleted_at = now()
    WHERE entity_type = 'document_chunk'
      AND entity_id = ANY(${ids}::uuid[])
  `;
}

async function insertChunk(
  doc: DocRow,
  chunk: ReturnType<typeof chunkText>[number],
): Promise<void> {
  // Write canonical chunk row.
  const inserted = await sql<{ id: string }[]>`
    INSERT INTO document_chunks (
      document_id, organization_id, case_id,
      chunk_index, page_number, char_start, char_end,
      chunk_text, token_count
    ) VALUES (
      ${doc.document_id}::uuid,
      ${doc.organization_id}::uuid,
      ${doc.case_id}::uuid,
      ${chunk.chunkIndex},
      ${chunk.pageNumber},
      ${chunk.charStart},
      ${chunk.charEnd},
      ${chunk.text},
      ${chunk.tokenCount}
    )
    RETURNING id::text
  `;
  const chunkId = inserted[0].id;

  // Mirror into search_documents as its own entity_type so the main
  // search pipeline surfaces it with its own embedding.
  const title = `${doc.file_name} · p.${chunk.pageNumber ?? "?"}`;
  const subtitle = `${doc.category ?? "document"} · chunk ${chunk.chunkIndex + 1}`;
  const facets = JSON.stringify({
    document_id: doc.document_id,
    case_id: doc.case_id,
    page_number: chunk.pageNumber,
    chunk_index: chunk.chunkIndex,
    char_start: chunk.charStart,
    char_end: chunk.charEnd,
    category: doc.category,
  });
  await sql`
    INSERT INTO search_documents (
      organization_id, entity_type, entity_id,
      title, subtitle, body,
      allowed_roles, owner_user_id, facets, identifiers,
      entity_updated_at
    ) VALUES (
      ${doc.organization_id}::uuid,
      'document_chunk',
      ${chunkId}::uuid,
      ${title},
      ${subtitle},
      ${chunk.text},
      ${doc.allowed_roles}::text[],
      NULL,
      ${facets}::jsonb,
      NULL,
      now()
    )
    ON CONFLICT (entity_type, entity_id) DO UPDATE SET
      title             = EXCLUDED.title,
      subtitle          = EXCLUDED.subtitle,
      body              = EXCLUDED.body,
      facets            = EXCLUDED.facets,
      entity_updated_at = EXCLUDED.entity_updated_at,
      indexed_at        = now(),
      deleted_at        = NULL,
      embedding         = NULL
  `;
}

async function main() {
  console.log("=== Document chunker ===");
  console.log(`host=${host} limit=${limit || "∞"} only=${only ?? "(all)"}\n`);

  const docs = await fetchDocuments();
  console.log(`fetched ${docs.length} documents with extracted_text\n`);

  let totalChunks = 0;
  let failed = 0;

  for (const [i, doc] of docs.entries()) {
    const text = doc.extracted_text ?? "";
    if (!text.trim()) continue;
    try {
      await deleteExistingChunks(doc.document_id);
      const chunks = chunkText(text, { targetTokens: 400, overlapTokens: 50 });
      for (const chunk of chunks) {
        await insertChunk(doc, chunk);
      }
      totalChunks += chunks.length;
      if ((i + 1) % 10 === 0 || i === docs.length - 1) {
        console.log(
          `  [${i + 1}/${docs.length}] ${doc.file_name.slice(0, 60).padEnd(60)} → ${chunks.length} chunks`,
        );
      }
    } catch (err) {
      failed += 1;
      console.warn(
        `  FAILED ${doc.document_id}:`,
        err instanceof Error
          ? err.message.slice(0, 120)
          : String(err).slice(0, 120),
      );
    }
  }

  const [summary] = await sql<{ n: number; chunks: number }[]>`
    SELECT
      (SELECT count(*)::int FROM document_chunks)          AS chunks,
      (SELECT count(*)::int FROM search_documents
         WHERE entity_type = 'document_chunk' AND deleted_at IS NULL) AS n
  `;
  console.log(
    `\ndone: ${docs.length} docs · ${totalChunks} chunks written · ${failed} failed`,
  );
  console.log(
    `document_chunks total: ${summary.chunks} · search_documents chunks live: ${summary.n}`,
  );

  await sql.end();
}

main().catch((err) => {
  console.error("chunker crashed:", err);
  process.exit(1);
});
