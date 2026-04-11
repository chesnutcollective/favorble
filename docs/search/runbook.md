# Search Runbook

Commands and workflows for operating the search stack — local dev,
staging rollouts, troubleshooting, and the common ops tasks that
come up day-to-day.

## Prerequisites

You need:

- Postgres 15+ (Railway staging DB is 16)
- The `pgvector` and `pg_trgm` extensions installed (migration `0006`
  enables them via `CREATE EXTENSION IF NOT EXISTS`)
- Node 22+ (installed by `pnpm`)
- `.env.local` with at least `DATABASE_URL`
- Optional: a signed BAA for your embedding provider if the DB
  contains PHI

## Local dev from a fresh clone

```bash
# 1. Install dependencies
pnpm install

# 2. Point DATABASE_URL at either a local Postgres or staging:
#    for staging, copy from Vercel preview env:
vercel env pull .env.local --yes

# 3. Apply all migrations (search migrations are 0006 + 0007)
pnpm db:migrate
# or for hand-rolled SQL:
psql "$DATABASE_URL" -f supabase/migrations/0006_search_foundation.sql
psql "$DATABASE_URL" -f supabase/migrations/0007_search_triggers.sql

# 4. Backfill existing rows into search_documents (re-fires triggers,
#    safe to re-run, idempotent):
pnpm tsx scripts/backfill-search-documents.ts --yes-staging

# 5. (Optional but recommended) chunk long documents:
pnpm tsx scripts/chunk-documents.ts --yes-staging --limit 50

# 6. (Optional) configure embedding provider + run the worker:
#    see § Embedding worker below

# 7. Start the dev server and hit Cmd+K:
pnpm dev
```

The palette should appear on every page under `/dashboard`. Type
`HS-22215` for a direct identifier jump, or a plain word like
`Williams` for federated keyword search, or `stage:4D` for a
scoped facet query.

## Running on staging

Staging shares the Railway Postgres with preview deploys. The
search migrations are already applied. When you push a new
commit that adds a trigger, migration, or schema change, do it
as a dedicated commit so the deploy notes are legible, then
apply the migration to staging before merging:

```bash
# Apply a specific search migration to staging:
psql "$STAGING_DATABASE_URL" -f supabase/migrations/NNNN_my_change.sql

# Or use the same postgres.js-based runner used in the history:
node -e '
require("dotenv").config({ path: ".env.local" });
const postgres = require("postgres");
const fs = require("fs");
const sql = postgres(process.env.DATABASE_URL.replace(/\\n$/, ""), { max: 1 });
(async () => {
  await sql.unsafe(fs.readFileSync("supabase/migrations/NNNN_my_change.sql", "utf8"));
  console.log("applied.");
  await sql.end();
})();
'
```

After migrations land, re-run the backfill if the change touched
how a trigger builds its payload:

```bash
pnpm tsx scripts/backfill-search-documents.ts --yes-staging
```

## Embedding worker

The worker polls `search_documents WHERE embedding IS NULL AND
deleted_at IS NULL ORDER BY indexed_at` and fills vectors in
batches. It runs in two modes:

**One-shot batch** (good for tests and backfills):
```bash
pnpm tsx scripts/embedding-worker.ts --once
```

**Long-running service** (good for continuous indexing in staging):
```bash
LOOP=1 pnpm tsx scripts/embedding-worker.ts
```

Or schedule it as a Railway cron / background service. It's
stateless except for the Postgres polling loop so it scales
horizontally if needed.

### Configuring a provider

The worker reads `SEARCH_EMBEDDING_PROVIDER` from the environment.
Set it to one of:

| Provider | Env vars | BAA? |
|---|---|---|
| `azure` | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_API_VERSION` | Yes, on signed Azure BAA |
| `openai` | `OPENAI_API_KEY`, optionally `OPENAI_EMBEDDING_MODEL` | Only on OpenAI Enterprise BAA |
| `bge` | `BGE_EMBEDDING_URL` (points at a self-hosted BGE-m3 HTTP service) | Self-hosted = BAA-moot |
| `stub` (default) | none | Returns zero vectors. Used in tests; disables semantic ranking entirely. |

You can also tune:

```
SEARCH_EMBEDDING_DIM=1536            # embedding dimensions (must match the migration)
SEARCH_EMBEDDING_BATCH_SIZE=32       # rows per iteration
SEARCH_EMBEDDING_MAX_CHARS=8000      # per-row body truncation before embedding
SEARCH_EMBEDDING_LOOP_INTERVAL_MS=5000  # sleep between polls in LOOP=1 mode
```

Where to put them in production:

- Vercel env (for the v2 route's query-time embedding): Preview
  branch-scoped env, same pattern as
  `RAILWAY_BUCKET_*` vars I added earlier.
- Railway env (for the embedding worker): on whichever Railway
  service is running the worker.

**Important:** the `SEARCH_EMBEDDING_DIM` must match the migration
(`vector(1536)`). If you change dimensions you need a new
migration that alters the column.

## Document chunking

Long OCR'd documents are chunked into ~400-token passages by
`scripts/chunk-documents.ts`. Run it whenever new documents with
non-empty `extracted_text` land:

```bash
# Chunk all unchunked documents:
pnpm tsx scripts/chunk-documents.ts --yes-staging

# Only chunk a specific doc:
pnpm tsx scripts/chunk-documents.ts --yes-staging --document-id <uuid>

# Limit the batch (useful for incremental rollouts):
pnpm tsx scripts/chunk-documents.ts --yes-staging --limit 50
```

The script is idempotent: it deletes existing chunks for the
document before re-chunking, so you can safely re-run it after a
document's extraction has been re-processed.

Ideally, we'd hook this into the document processing pipeline so
new docs are chunked automatically after OCR completes. That's
tracked in [roadmap.md § phase 4](./roadmap.md#phase-4--ongoing).

## Smoke test

Paste this block after any migration or trigger change to confirm
the stack is healthy. It runs a single connection, prints
diagnostics, and exits.

```bash
node -e '
require("dotenv").config({ path: ".env.local" });
const postgres = require("postgres");
const sql = postgres(process.env.DATABASE_URL.replace(/\\n$/, ""), { max: 1 });
(async () => {
  const [org] = await sql`SELECT id, name FROM organizations LIMIT 1`;
  console.log("Org:", org.name, org.id);

  const counts = await sql`
    SELECT entity_type, count(*)::int AS n
    FROM search_documents
    WHERE organization_id = ${org.id}::uuid AND deleted_at IS NULL
    GROUP BY entity_type ORDER BY n DESC`;
  console.table(counts);

  console.log("\n1. Keyword query: \"Williams\"");
  const kw = await sql`
    SELECT entity_type, left(title, 50) AS title,
           ts_rank_cd(tsv, websearch_to_tsquery(${"english"}, ${"Williams"})) AS score
    FROM search_documents
    WHERE organization_id = ${org.id}::uuid
      AND deleted_at IS NULL
      AND (tsv @@ websearch_to_tsquery(${"english"}, ${"Williams"}) OR title % ${"Williams"})
    ORDER BY score DESC LIMIT 5`;
  console.table(kw);

  console.log("\n2. Identifier lookup: \"HS-22215\"");
  const id = await sql`
    SELECT entity_type, title FROM search_documents
    WHERE organization_id = ${org.id}::uuid
      AND deleted_at IS NULL
      AND ${"HS-22215"} = ANY(identifiers)`;
  console.table(id);

  console.log("\n3. Passage query: \"functional capacity\"");
  const chunks = await sql`
    SELECT entity_type, left(title, 50) AS title,
           ts_rank_cd(tsv, websearch_to_tsquery(${"english"}, ${"functional capacity"})) AS score
    FROM search_documents
    WHERE organization_id = ${org.id}::uuid
      AND deleted_at IS NULL
      AND tsv @@ websearch_to_tsquery(${"english"}, ${"functional capacity"})
    ORDER BY score DESC LIMIT 5`;
  console.table(chunks);

  await sql.end();
})();
'
```

Expected outputs:

- Entity counts should show `case`, `document`, `task`, `contact`,
  `lead`, `chronology_entry`, `calendar_event`, `outbound_mail`,
  `user`, `communication` (and `document_chunk` after chunking)
- "Williams" should return mixed types (contacts + cases + hearings
  + tasks) ranked by score
- "HS-22215" should return exactly one case row with that case
  number
- "functional capacity" should return document_chunk rows with
  higher `ts_rank_cd` than whole-document rows

## Troubleshooting

### Trigger not firing

If you write a row to a source table and it doesn't appear in
`search_documents`:

1. Confirm the trigger exists:
   ```sql
   SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_search_%';
   ```
   All 13 should be listed.
2. Check the source row has an `organization_id` (cases,
   contacts, calendar events, invoices, leads, users, outbound_mail,
   communications, trust_accounts). Documents, tasks, chronology
   entries, and chat messages inherit it via a parent table lookup.
3. Check for a trigger exception in Postgres logs. The trigger
   will fail the write if it raises — the error should be visible
   in the app's request log.
4. Re-run the backfill for that table:
   ```bash
   pnpm tsx scripts/backfill-search-documents.ts --yes-staging
   ```

### Search returns zero rows despite data

Likely causes:

- **ACL mismatch**: the caller's role isn't in `allowed_roles`
  for the target entity type. Check `lib/search/access-filter.ts`
  and confirm the role set in `principalFromSession()`.
- **Chat search**: `chat_message` rows are excluded unless the
  request explicitly passes `includeTeamChat=true`.
- **Date filter**: the parser might have extracted a date bucket
  that excludes everything. Try the raw query without date
  language.
- **Wrong organization**: the request has a different
  `organization_id` than the data. Confirm `requireSession()`
  returns the expected org.

### Semantic search returns nothing

- The `embedding` column is NULL for every row. Either:
  - `SEARCH_EMBEDDING_PROVIDER` is `stub` (the default)
  - The embedding worker hasn't run yet
  - The worker is running but the provider is returning errors
  (check the worker logs — it logs failed rows and bumps
  `indexed_at` so they retry later)

Fix: configure a provider and run the worker once. The v2 route
automatically skips semantic when `isEmbeddingConfigured()`
returns false, so this degrades gracefully.

### Facet counts look wrong

Facet counts are computed from the same ACL-filtered set as the
results. If a restricted row is "missing" from facet counts,
that's by design — see [architecture.md § decision 5
(ACL pre-filter)](./architecture.md#5-access-control-as-a-hard-pre-filter-inside-the-sql-never-a-post-filter).

### `pnpm build` fails with "cannot find module tsvector"

You're importing `tsvector` or `vector1536` from the wrong file —
the custom types live in `db/schema/search.ts` and are Drizzle
internals. They're consumed by the schema definition but never
imported directly by other code. If you need to parse or build a
pgvector literal, do it in raw SQL via `db.execute(sql\`...\`)`
like `app/api/search/v2/route.ts` does.

### HNSW index rebuild is slow on large tables

pgvector HNSW index builds scale roughly linearly with row count.
At 1M+ rows, a fresh build can take 10–30 minutes. Strategies:

- **Build the index empty**, then let the worker fill vectors
  incrementally — this is what we do
- **Never DROP + CREATE INDEX on a populated table in production** —
  use `REINDEX INDEX CONCURRENTLY` if you need to rebuild
- **Partition `search_documents`** by `entity_type` once you cross
  5M+ rows per type — tracked in [roadmap.md](./roadmap.md)

## Deleting the old `GlobalSearch`

The old 1,379-line `components/layout/global-search.tsx` is left
in the tree as dead code for one release cycle so we can compare
behavior. It's no longer imported anywhere (the header uses
`CommandPalette` now). To remove it:

```bash
rm components/layout/global-search.tsx
rm -rf app/api/search/route.ts   # the old ILIKE-based endpoint
```

And update any grep references in audit docs.
