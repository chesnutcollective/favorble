# Search Architecture

## The high-level shape

```
┌───────────────────────┐      writes          ┌──────────────────────────┐
│  15 source tables     │────────────────────▶ │  search_documents        │
│  cases, contacts,     │   trg_search_*       │  (polymorphic, org+ACL)  │
│  leads, users,        │   synchronous        │                          │
│  documents, chrono,   │                      │  + document_chunks       │
│  calendar, tasks,     │                      │    (phase 3, ¶-level)    │
│  comms, chat, mail,   │                      │                          │
│  invoices, trust, …   │                      │  + search_audit_log      │
└───────────────────────┘                      │    (partitioned monthly) │
                                               └────────────┬─────────────┘
                                                            │
                                                            │ async fill
                                                            ▼
                                               ┌──────────────────────────┐
                                               │  embedding-worker        │
                                               │  polls WHERE embedding   │
                                               │  IS NULL, batches,       │
                                               │  writes pgvector(1536)   │
                                               └──────────────────────────┘

                        ▲
                        │ SELECT
                        │
┌───────────────────────┴───────────────────────┐
│  /api/search/v2                               │
│    parse → access-filter → run:               │
│      · lexical  (tsvector + pg_trgm + ident)  │
│      · semantic (pgvector HNSW, if enabled)   │
│    → RRF merge + per-type caps                │
│    → entity-affinity boost                    │
│    → facet aggregation (ACL-scoped)           │
│    → audit log (fire-and-forget)              │
└───────────────────────────┬───────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────┐
│  <CommandPalette>  (components/search/)       │
│    · Cmd+K hotkey, centered modal             │
│    · debounced fetch (120ms)                  │
│    · grouped by entity_type with caps         │
│    · keyboard nav, recents cache, deep links  │
└───────────────────────────────────────────────┘
```

## The ten decisions that define the system

Each of these was a deliberate choice. If you want to change one,
read the rationale first — most of them have non-obvious tradeoffs.

### 1. Postgres-native, not a separate search engine

We run keyword + vector search inside the same Railway Postgres that
holds the source of truth. No Elasticsearch, no Algolia, no
Meilisearch service. Full rationale in
[ADR-001-postgres-native.md](./ADR-001-postgres-native.md), but the
five-word version: **one trust boundary, no CDC**.

### 2. One polymorphic table, not one-index-per-entity

Every searchable row lives in `search_documents` with a
discriminator column `entity_type`. The alternatives would be:

- **One table per entity type**: forces the API layer to run a
  UNION across 15 queries and merge client-side. Facet counts
  become hard. Per-type caps become hard. RLS becomes hard.
- **Separate indexes in an external engine**: introduces fan-out
  latency, cross-index ranking issues, and vendor lock-in.

One polymorphic table gives us free federation, naturally
supports RRF, and makes `WHERE entity_type = ANY(...)` a trivial
scope filter.

### 3. Triggers for write-time index maintenance (not CDC, not outbox)

Every source table has a `trg_search_*` trigger that runs inside
the same transaction as the write. This means:

- The index is always consistent with the source
- No background sync worker to monitor
- No CDC pipeline (Debezium, Kafka Connect) to operate
- A failed trigger fails the write — so we get a loud error
  instead of a silent drift

The tradeoff is ~2-5 ms of added latency per write. At our scale
this is invisible; at millions-of-writes-per-minute scale we'd
switch to an outbox table + background sync worker for the
heaviest write paths. See
[roadmap.md § scale pivots](./roadmap.md#scale-pivots).

### 4. Generated `tsvector` column with per-field weights

The `tsv` column is a Postgres `GENERATED ALWAYS AS … STORED`
expression that combines title, subtitle, and body with weights
A, B, C respectively. This means:

- Every `UPDATE` automatically regenerates the tsvector
- Per-field weighting is applied at index build time (fast
  queries) rather than at query time
- There's zero chance of the tsvector drifting out of sync with
  the source fields

A match on a case caption ranks ~5–10× higher than a match in a
document body, which is the correct legal-domain ranking.

### 5. Access control as a hard pre-filter inside the SQL, never a post-filter

**This is the single most important invariant in the whole system.**

```sql
-- Correct: ACL is part of the WHERE clause
SELECT ... FROM search_documents
WHERE organization_id = $1
  AND (allowed_roles && $2::text[] OR $3::uuid = ANY(allowed_user_ids))
  AND tsv @@ websearch_to_tsquery('english', $4)
```

```sql
-- WRONG: ACL applied in application code after the query
SELECT ... FROM search_documents WHERE tsv @@ ...
-- ... then in TypeScript: results.filter(r => canSee(r))
```

Post-filtering leaks information in several subtle ways:

- **Result counts** reveal the existence of restricted rows
- **Facet counts** reveal counts of restricted rows per facet
- **Pagination** behaves differently (`limit 20 offset 40`
  stops returning rows earlier than a naive user expects)
- **Timing side-channels** reveal content even when rows are
  dropped

`lib/search/access-filter.ts` builds the SQL fragment and every
query in `/api/search/v2` ANDs it into the WHERE. If you add a
new query, you MUST thread the access filter through it.

### 6. Reciprocal Rank Fusion for merging rankers

Keyword (`ts_rank_cd` on BM25-style vector) and semantic (cosine
similarity on `pgvector`) produce scores on wildly different
scales. Keyword scores are unbounded positive; vector cosine is
in [−1, 1]. Normalizing them into a weighted sum is fragile.

RRF sidesteps the problem by using ranks not scores:

```
final_score(doc) = sum over rankers of [1 / (k + rank_in_ranker)]
```

With k = 60 this produces a stable merged ranking regardless of
how each ranker normalizes. It's also the industry-standard merge
used by Vespa, Weaviate, Elastic, and most academic hybrid-search
papers.

Per-type caps are applied *after* RRF: the final result list is
limited to N rows per `entity_type` so one dominant type (e.g.
documents from a single large case) can't drown the others.

### 7. Identifier hits bypass ranking

If the parsed query is a recognized identifier (case number
`HS-XXXXX`, SSA document ID `A1001001A24K06B23258B63346`, SSN
last-4, ICD-10 code, email address), the route runs a separate
exact-match query that feeds into RRF as a prepended lexical
list. An exact ID hit effectively lands at rank 0 and gets the
maximum RRF contribution, so typing `HS-22215` always puts that
case at the top regardless of how many other rows matched.

### 8. 400-token chunks with 50-token overlap for long documents

Medical records and legal briefs run to hundreds of pages.
Embedding a whole document into one vector gives you a "kind of
about medicine" score for every query, which isn't useful. We
chunk long text into ~400-token passages with ~50-token overlap
at sentence boundaries (see `lib/search/chunker.ts`), store each
chunk in `document_chunks` with its page number + char offsets,
and mirror each into `search_documents` as
`entity_type = 'document_chunk'`.

A chunk's `facets` JSON records `document_id`, `case_id`,
`page_number`, `chunk_index`, `char_start`, `char_end`. The
palette uses these to build a deep-link URL that opens the PDF
viewer at the matching page: `/cases/<id>/documents?doc=<did>&page=<N>`.

400 tokens was chosen because it's within the context of every
modern embedding model (smallest is ~512), it's large enough to
hold a full paragraph, and it's small enough that a query like
"back pain December 2024" matches the *specific* passage
describing that, not the entire encounter note.

### 9. Embedding worker is asynchronous and fallback-tolerant

The `embedding` column is populated out-of-band by
`scripts/embedding-worker.ts`. The write path (trigger) sets it
to NULL on every change, and the worker fills it in when it runs.

This means:

- The hot write path is fast (triggers don't call out to an
  embedding API)
- If the embedding provider is down, writes still succeed and
  lexical search keeps working
- Swapping providers is a no-op for the rest of the system
- The v2 route has a `isEmbeddingConfigured()` check — if the
  provider is `stub` (the default), the semantic query is skipped
  and search falls back to pure lexical + identifier

We currently support `azure` (Azure OpenAI — the BAA-compliant
default for PHI), `openai` (OpenAI direct, Enterprise BAA only),
`bge` (self-hosted BGE-m3 for HIPAA-strict deployments), and
`stub` (zero vectors, for tests and fallback). See
`lib/search/embed-client.ts`.

### 10. Search queries are always audit-logged

Every query lands in `search_audit_log` (partitioned by month)
with the user, org, query text, scope, result count, result IDs,
latency, IP, and user agent. Required for HIPAA and bar
association audit trails. The insert is fire-and-forget so a slow
audit write never blocks the response, and errors are swallowed
so a broken audit table never breaks search.

## Adding a new entity type

Follow this recipe:

1. **Add the entity type name** to `EntityType` in
   `lib/search/types.ts` and add a per-type cap to
   `DEFAULT_TYPE_CAPS`.
2. **Write a trigger** in a new migration file
   `supabase/migrations/NNNN_search_<entity>_trigger.sql`.
   Follow the pattern in `0007_search_triggers.sql` — call
   `search_upsert()` with title/subtitle/body/roles/owner/
   facets/identifiers and handle soft-delete via `search_soft_delete`.
3. **Extend the access filter's `adminOnly` list** if the new
   type should be hidden from non-admins
   (`lib/search/access-filter.ts`).
4. **Extend `hrefFor()`** in `app/api/search/v2/route.ts` to
   build the deep-link URL for the new type.
5. **Extend `scripts/backfill-search-documents.ts`** to add the
   source table to the `TABLES` array so existing rows get
   indexed on first run.
6. **Extend `iconMeta()` and `typeLabel()`** in
   `components/search/command-palette.tsx` so the palette renders
   the new type's icon and group header.
7. **Run the backfill** against the target DB:
   `pnpm tsx scripts/backfill-search-documents.ts --yes-staging`.
8. **Add a golden query** to the smoke test in
   [runbook.md § smoke test](./runbook.md#smoke-test) to confirm
   the new type surfaces correctly.

## Adding a new query feature (prefix, facet, identifier type)

Edit `lib/search/query-parser.ts`. All parsing logic lives in
one file. Add a regex to the `RX` table for new identifier
types, add entries to `SCOPE_ALIASES` for new scoped prefixes, or
extend the facet extraction loop for new key:value facets. Add
unit tests (see `docs/search/roadmap.md § tests` — tests are
deferred to a follow-on PR but the file layout is already
planned).

## Cross-references

- Entity coverage and per-field PHI gates:
  [entity-inventory.md](./entity-inventory.md)
- Local dev workflow and troubleshooting:
  [runbook.md](./runbook.md)
- What's intentionally deferred and why:
  [roadmap.md](./roadmap.md)
- Full ADR for the Postgres-native choice:
  [ADR-001-postgres-native.md](./ADR-001-postgres-native.md)
