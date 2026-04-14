# ADR-001 — Postgres-native hybrid search

**Status:** accepted
**Date:** 2026-04-10
**Deciders:** Engineering
**Superseded-by:** none

## Context

Favorble needs a 99th-percentile global search experience — federated
across 15+ entity types, with BM25-style keyword ranking, semantic
(vector) ranking, typo tolerance, facet filtering, passage-level
retrieval from long OCR'd PDFs, role-based ACLs, HIPAA-compliant
handling of PHI, and sub-200ms latency.

The app is a Next.js 15 App Router frontend on Vercel, with the
source-of-truth database in Railway Postgres 16. Authentication is
Clerk. Every production request already carries an
`organization_id` + role from `requireSession()`.

The scale is Series-B today (10–20 users, thousands of cases per
firm) with architectural headroom required through Series-D
(~100 users, millions of rows per firm).

## Decision

**Build hybrid search directly inside the existing Railway Postgres
database using `pg_trgm` + `tsvector` (GIN-indexed) for lexical and
`pgvector` (HNSW-indexed) for semantic, merged at the API layer
with Reciprocal Rank Fusion. Zero external search vendors.**

## Options considered

### Option A — Postgres FTS + pgvector (chosen)

Native Postgres. One polymorphic `search_documents` table maintained
by triggers on every source table. Keyword queries use
`websearch_to_tsquery` + `ts_rank_cd`. Semantic queries use
`embedding <=> query_vec` with HNSW. Application layer merges both
with RRF.

**Pros:**
- Inherits Railway's BAA perimeter for free — no new vendors to
  sign BAAs with, no new trust boundary to audit.
- Synchronous, transactional index maintenance via triggers. The
  index can't drift out of sync with the source because the
  upsert runs inside the same transaction as the source write.
- Row-level access control is a native WHERE clause — the same
  `organization_id` + role check pattern we already use
  everywhere.
- Federating 15 heterogeneous entity types is a `WHERE entity_type
  IN (...)` — trivially cheap with a compound index.
- Can join search results directly against business tables in one
  query for enrichment.
- `pgvector` with HNSW comfortably handles ~5M–10M vectors per
  index on a reasonable Railway instance.
- Zero incremental ops cost — we already pay for Railway
  Postgres.

**Cons:**
- Ranking is less sophisticated than Elasticsearch (no LTR out of
  the box, no built-in learned rerankers, no query-time boosting
  DSL as rich as Elasticsearch's).
- At extreme scale (~10M+ vectors per tenant), HNSW index rebuilds
  get slow and memory pressure becomes real.
- No built-in faceting / highlighting / synonyms / typo tolerance
  — you build them. Trigram helps with typos,
  `ts_headline` helps with highlighting, and facet aggregation
  is just `GROUP BY facets->>'key'`.

### Option B — Meilisearch or Typesense (self-hosted)

Run a Meilisearch or Typesense container on Railway as a
self-hosted service. Both give you typo tolerance, phrase
matching, and hybrid (keyword + vector) search out of the box with
minimal configuration.

**Rejected because:**
- Cloud tiers (Meilisearch Cloud, Typesense Cloud) have no public
  HIPAA BAAs. Self-hosting is the only option, which gives up the
  turnkey benefit.
- A self-hosted search engine needs a sync worker + outbox table +
  retry logic to keep the index in sync with Postgres writes. At
  our scale this is needless complexity — trigger-based sync in
  the same DB is strictly simpler.
- 15 heterogeneous entity types push us toward multiple indexes
  (one per type) plus app-level fusion, which reinvents what we
  get for free from a polymorphic Postgres table.
- Facet counts and RLS-style per-row ACLs are harder to enforce
  cleanly in a second engine. The hard pre-filter rule
  (`architecture.md § decision 5`) is easy to enforce in SQL,
  much harder when the filter has to round-trip through a
  search-engine-specific query DSL.

### Option C — Elasticsearch / OpenSearch (managed cloud with BAA)

Elastic Cloud (Enterprise tier) and AWS OpenSearch both offer
signed BAAs. Battle-tested feature surface.

**Rejected because:**
- Operationally heavy even as managed services — JVM tuning, shard
  management, index lifecycle policies, reindex jobs, field data
  circuit breakers.
- Minimum viable HIPAA-compliant cluster costs $300–500/month on
  Elastic Cloud, $150–400/month on AWS OpenSearch. At our current
  scale this is pure overhead.
- Adds a second vendor BAA to the compliance posture.
- CDC pipeline (Debezium + Kafka Connect, or the
  `logstash-input-postgres` plugin) is required for reliable
  index maintenance. This is non-trivial to operate.
- The pain of migrating away later, if we outgrow it, is a known
  industry horror story. We'd rather delay adoption until it's
  unambiguously the right choice.

### Option D — Algolia / Convex / Turbopuffer (managed SaaS)

Fully managed hosted search with excellent DX.

**Rejected because:**
- None of them currently offer HIPAA BAAs on standard plans.
  Algolia has explicitly said PHI is not permitted without a
  specific enterprise arrangement, and even then it's rare.
- Disqualifying for a PHI-handling app. Period.

### Option E — Dedicated vector store (Qdrant, Weaviate, Pinecone, LanceDB)

Purpose-built vector DBs with excellent HNSW performance at
billion-scale.

**Rejected for Phase 0 because:**
- None of these are a full keyword engine — you'd still need
  Postgres FTS (or Meilisearch, or Elastic) for BM25. So this is
  really "Option E = A + a dedicated vector DB." Adds complexity
  without immediate benefit.
- Pinecone offers a BAA only on Enterprise tier with upcharge.
- Qdrant self-hosted on Railway is the natural upgrade path if
  `pgvector` ever becomes a bottleneck — we tracked it as
  [Pivot 4 in roadmap.md](./roadmap.md#pivot-4--move-the-vector-index-out-of-postgres).

## Consequences

### Positive

1. **Single trust boundary.** PHI never leaves Railway. One BAA to
   worry about. One incident response plan. One compliance
   audit surface.
2. **Simple ops story.** No sync worker, no CDC pipeline, no
   separate search engine to monitor. Everything is in
   `supabase/migrations/` + regular Next.js code.
3. **Drizzle types are honest.** The search schema lives next to
   the business schema and imports from the same source types.
   No stringly-typed document mapping to maintain.
4. **Swappable internals.** The API layer owns `search(request)`
   as a clean contract. If pgvector becomes the bottleneck, we
   swap to Qdrant behind the same interface (see roadmap.md
   § pivot 4). If BM25 ever needs a better engine, we can move
   the keyword side to Tantivy without touching the caller.
5. **Cheap at this scale.** Incremental cost is near zero.

### Negative

1. **No out-of-the-box LTR.** We'd have to build a learning-to-rank
   system ourselves, which at this scale is overkill but becomes
   worth doing at ~100k queries/month.
2. **pgvector HNSW limits.** We'll hit them eventually. Planned
   migration path exists.
3. **No fancy query DSL.** Elasticsearch-style score boosting,
   function scores, or percolator queries don't exist here. We
   accept simpler ranking in exchange for operational simplicity.
4. **Manual faceting + highlighting.** We're writing these
   ourselves. `ts_headline` handles highlighting, facets are
   `GROUP BY`. Fine at this scale; would be annoying at extreme
   scale.

### Accepted risks

- **Trigger maintenance cost.** Every source-table write fires a
  trigger that upserts into `search_documents`. Measured at
  ~2–5 ms on normal rows. If cases or documents grow to thousands
  of writes per second, we'll switch those two tables to an
  outbox + async sync worker (see roadmap.md § pivot 2).
- **HNSW rebuild time.** A full rebuild at 1M+ vectors takes
  ~10+ minutes. We never rebuild — HNSW builds incrementally and
  tolerates in-place inserts.
- **Embedding provider availability.** The embedding worker can
  fall behind if the provider is flaky. Mitigated by: marking
  failed rows for retry via `indexed_at` bump, graceful
  degradation to lexical-only search when `embedding IS NULL`,
  and a provider abstraction that lets us swap without touching
  the rest of the system.

## Implementation summary

See [architecture.md](./architecture.md) for the full design and
[runbook.md](./runbook.md) for operational procedures.

The system was built in four phases over one session. Phases 0–3
shipped in commits `2d79b7e` and `dfd960d`. Phase 4 is explicitly
deferred — see [roadmap.md](./roadmap.md) for the breakdown.

## Related

- [README](./README.md) — entry point for the search subsystem
- [architecture.md](./architecture.md) — how the pieces fit together
- [entity-inventory.md](./entity-inventory.md) — what's indexed
- [runbook.md](./runbook.md) — how to operate it
- [roadmap.md](./roadmap.md) — what's deferred and why
