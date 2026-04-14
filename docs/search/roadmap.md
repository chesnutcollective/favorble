# Search Roadmap

What's shipped, what's deferred, and the scaling pivots for
each stage of the company.

## Shipped (phases 0–3)

| Phase | Description | Status | Commit |
|---|---|---|---|
| 0 — foundation | pgvector + pg_trgm extensions, `search_documents` table, Drizzle bindings, shared types, query parser, RRF, access filter, embed client abstraction | ✅ live | `2d79b7e` |
| 0 — API + palette | `/api/search/v2` lexical route + identifier routing + audit logging; Cmd+K palette component replacing `GlobalSearch` | ✅ live | `2d79b7e` |
| 1 — triggers | 13 entity-type triggers (cases, contacts, leads, users, documents, chronology, calendar, tasks, comms, chat, mail, invoices, trust) + backfill script; 935 rows on staging | ✅ live | `2d79b7e` |
| 2 — semantic | Embedding worker + v2 route hybrid fusion (BM25 + vector via RRF) | ✅ code shipped, dormant until provider configured | `dfd960d` |
| 3 — passage retrieval | Document chunker, `document_chunks` table mirrored into `search_documents` as `document_chunk` entity type, PDF viewer `?doc=&page=` deep-links | ✅ live; 190 chunks on staging | `dfd960d` |

## Phase 4 — deferred (intentionally)

These items are valuable but were deliberately not included in
the first pass so we could ship a working end-to-end system
without getting stuck on judgment calls that need real production
traffic to validate.

### 4.1 — LLM query understanding

**What:** Route the user's query through an LLM at parse time to
detect entity mentions ("cases for Martinez" → `client:Martinez`),
resolve colloquialisms ("my hearings this week"), and suggest
filter refinements. Popularized by Notion and Harvey AI.

**Why deferred:** Adds ~500 ms of per-query latency and needs a
BAA-compliant LLM provider. The existing typed-prefix grammar
already handles the power-user case. Revisit when:

- You've seen 1,000+ real queries and you can categorize the top
  failure modes (i.e., what people typed that didn't find what
  they wanted)
- You have a BAA for an LLM provider (Azure OpenAI is the
  default choice)
- You have click logs to A/B the LLM vs. no-LLM path

**Where to add it:** wrap `parseQuery()` in
`lib/search/query-parser.ts` with an optional LLM pass that
returns an enriched `ParsedQuery`.

### 4.2 — Synonym expansion

**What:** A medical thesaurus (ICD-10 terms → synonyms) and a
legal terminology lookup applied to the query before it hits
BM25. "Back pain" would expand to `back pain OR lumbago OR
lumbar OR dorsalgia OR radiculopathy`.

**Why deferred:** Gives a meaningful recall boost but requires
maintaining a synonym dictionary. UMLS and SNOMED are the
reference sources for medical synonyms, both licensed. For
English legal terms we'd curate a smaller list ourselves.

**Where to add it:** a new `lib/search/synonyms.ts` module with
a deterministic expansion function, called from
`query-parser.ts` before `websearch_to_tsquery` builds its query.

### 4.3 — Learning-to-rank

**What:** Train a LambdaMART / XGBoost LTR model on click logs to
learn per-feature weights (how much a recency boost matters vs.
title-match vs. semantic match vs. affinity). The click logs in
`search_audit_log` are structured for this.

**Why deferred:** LTR needs ~10,000+ queries with click-through
signals to converge. At the current scale we'd be training on
noise. Revisit when the firm is past Series-B and has 20+ active
users generating search traffic.

**Where to add it:** offline training pipeline (probably Python
with LightGBM), serve the model as an ONNX file, load it in a
new `lib/search/ranker.ts`, apply its scores inside
`reciprocalRankFusion` as an additional weight term.

### 4.4 — Saved searches + alerts

**What:** Star a query and pin it to the sidebar. Subscribe to a
query to get notified when new matches land. Named views.

**Why deferred:** Schema is a straightforward `saved_searches`
table, and a cron-driven delta check is cheap, but the UX is
non-trivial — notification surface, dedupe, frequency controls,
sharing. Needs product decisions that don't belong in the
foundation pass.

**Where to add it:** new `db/schema/saved-searches.ts` + a
`saved_searches` nav rail item + a `SavedSearchCron` worker.

### 4.5 — Matrix view (cross-document Q&A)

**What:** A spreadsheet UI where rows are documents in a case and
columns are questions. Each cell is an independent RAG call with
the source passage shown inline. Pattern popularized by Hebbia.

**Why deferred:** This is a user-facing feature, not a search
primitive. Foundation for it already exists (chunks with
citations, semantic search). Ship it when the firm asks for it
as a specific workflow — probably for medical record review.

**Where to add it:** new route at `/cases/[id]/matrix`, new
component for the grid, a `/api/matrix` endpoint that runs one
RAG call per (document × question) pair and caches in a new
`matrix_cells` table.

### 4.6 — Citation graph for SSD authorities

**What:** Build a graph of SSRs, POMS, appeals council decisions,
and ALJ opinions where nodes are documents and edges are
citations. Use the citation count as an authority score that
boosts rankings. Lexis's Shepard's and Westlaw's KeyCite are the
gold-standard reference implementations.

**Why deferred:** Valuable but requires parsing citation formats
across multiple document types, and the SSD practice doesn't cite
as heavily as general litigation. Higher-ROI elsewhere first.

**Where to add it:** new `document_citations` table with
`(cited_document_id, citing_document_id)`, a batch job that
parses chronology entries and decision letters for citation
patterns, and a new scoring term in the RRF fusion.

### 4.7 — Automatic chunking on document upload

**What:** Hook `scripts/chunk-documents.ts` into the document
processing pipeline so new uploads are chunked automatically
after OCR completes, without a manual re-run.

**Why deferred:** The chunker is idempotent and the current
document processing path is `extract → classify → chronicle`. We
need to add a `→ chunk` step and thread it through the existing
langextract worker. Not hard, just work.

**Where to add it:** in `services/langextract-worker/` (or
wherever the post-OCR fan-out lives), call the chunker on the
OCR result before the run completes.

### 4.8 — Tests

**What:** Unit tests for query parser, RRF, chunker, access
filter; integration tests for `/api/search/v2`; a golden query
set with expected top-3 results per query.

**Why deferred:** Not shipped with phases 0–3 to keep scope tight.
The code is working on staging against real data and the sanity
smoke test in [runbook.md § smoke test](./runbook.md#smoke-test)
covers the critical paths. A follow-on PR should add:

- `lib/search/query-parser.test.ts` — scoped prefixes, identifier
  detection, date parsing, facet extraction
- `lib/search/rrf.test.ts` — merge correctness, per-type caps,
  affinity boosts
- `lib/search/chunker.test.ts` — sentence boundaries, page
  indexing, overlap
- `lib/search/access-filter.test.ts` — role inheritance, admin
  gates, team-chat isolation
- `__tests__/api/search/v2.test.ts` — end-to-end against a test
  DB seeded with 100 fixtures
- `__tests__/search/golden-queries.test.ts` — ~20 real queries
  with expected top-3, fail the build if any drift below a
  threshold NDCG

## Scale pivots

The current architecture is designed to work at Series-B scale
(10–20 users, low millions of rows per tenant) with headroom
for Series-C. The pivots below activate as you cross specific
volume thresholds.

### Pivot 1 — ~5M rows per tenant

**Symptom:** HNSW index builds start taking 10+ minutes; query
latency p99 starts creeping toward 500 ms.

**Fix:** Partition `search_documents` by `entity_type`. Postgres
declarative partitioning + per-partition HNSW indexes gives you
linear-cost inserts and keeps individual index sizes small. The
`search_audit_log` table is already partitioned by month as a
reference.

### Pivot 2 — embedding worker falls behind

**Symptom:** `search_documents WHERE embedding IS NULL` grows
faster than the worker drains it.

**Fix options (in order):**

1. Increase `SEARCH_EMBEDDING_BATCH_SIZE` (default 32, try 64 or
   128)
2. Run multiple worker instances in parallel (they compete for
   rows via indexed_at ordering, so this is safe but not ideal
   without a proper claim mechanism — add a `claimed_at` column
   and a `SELECT FOR UPDATE SKIP LOCKED` claim pattern before
   going parallel)
3. Switch from per-row embedding to per-chunk only (skip top-
   level entity embeddings when the content is short)
4. Switch providers to something faster (Voyage claims lower
   latency than OpenAI at matched quality)

### Pivot 3 — hybrid fusion tuning

**Symptom:** Users report that semantic matches are dominating
results when they typed an exact term, or vice versa.

**Fix:** Adjust the RRF `k` parameter (default 60) in
`reciprocalRankFusion()` — lower `k` concentrates score at the
top of each list, higher `k` flattens it. Or introduce weighted
RRF where lexical gets 1.2× the semantic contribution at merge
time. Both are small changes in `lib/search/rrf.ts`.

### Pivot 4 — move the vector index out of Postgres

**Symptom:** You've crossed 10M+ vectors per tenant and pgvector
HNSW is the bottleneck; index builds are painful and query
latency has deteriorated.

**Fix:** Move vectors to Qdrant (self-hosted on Railway, still
inside the BAA perimeter) while keeping the keyword side in
Postgres. The RRF merge layer in `/api/search/v2` stays the
same — it doesn't care where each ranker comes from. Treat
Postgres as the authoritative metadata store and Qdrant as a
derived secondary index.

**What stays:** `search_documents` for keyword + metadata + ACLs,
triggers + backfill, access filter, RRF fusion, palette UX.

**What swaps:** the semantic query runs against Qdrant instead of
the `pgvector` column, using the same query embedding. A new
background job syncs Postgres changes into Qdrant via an outbox
table.

**When to do it:** don't. At least not until you're past Series-D
and you have telemetry proving pgvector is the bottleneck. The
foundation was chosen specifically to delay this pivot as long
as possible.

### Pivot 5 — federated search across firms (multi-firm SaaS mode)

**Symptom:** The product becomes a multi-tenant SaaS and a single
Postgres instance can't hold all firms.

**Fix:** Shard by `firm_id`. `search_documents` is already
org-scoped via the access filter, so the query layer only needs
to know which shard to route to. This is an infra pivot, not a
search pivot — the search code doesn't change.

## Nice-to-haves that aren't tracked anywhere else

- **Typed filter chips in the palette UI.** Currently the parser
  extracts facets from typed prefixes like `stage:4D` but the
  palette just passes them through. A real chip UI (backspace
  pops the chip, clicking removes it) is a ~200-line component
  extension.
- **Preview pane on the right side of the palette** showing the
  first 10 lines of the highlighted result. The v2 route already
  returns `snippet` with `ts_headline` highlighting; the palette
  just needs to render a preview panel.
- **IndexedDB cache of recent entities** for sub-50ms first-match
  before any network call. The palette has a `favorble.search.recents.v2`
  localStorage store for navigation recents, but not a full
  IndexedDB delta-sync cache.
- **Query suggestion / "did you mean"** when no results come
  back. pg_trgm already supports trigram fuzzy match — we'd just
  need to surface the closest title as a suggestion.
- **Faceted sidebar.** The palette currently groups by
  `entity_type`. A full faceted sidebar (stage, ALJ, date range,
  assignee) is phase 4 work.
