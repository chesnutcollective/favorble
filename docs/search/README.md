# Search

Favorble's global search — the Cmd+K command palette — is a
hybrid-search system built on top of the existing Railway Postgres
database using `pgvector` and `pg_trgm` extensions. It federates
~15 entity types into a single ranked result list, supports
identifier-direct-jump, passage-level retrieval from OCR'd PDFs,
and semantic (vector) search when an embedding provider is
configured.

Zero external vendors. All PHI stays inside Railway's BAA perimeter.

## Start here

| If you want to… | Read |
|---|---|
| Understand the design and why each choice was made | [architecture.md](./architecture.md) |
| See what's indexed, what's searchable, and what's gated | [entity-inventory.md](./entity-inventory.md) |
| Run the stack locally or push changes to staging | [runbook.md](./runbook.md) |
| Know what's shipped vs. intentionally deferred | [roadmap.md](./roadmap.md) |
| Understand why Postgres-native was chosen over Elastic / Algolia | [ADR-001-postgres-native.md](./ADR-001-postgres-native.md) |

## One-paragraph overview

Every searchable entity in the app (cases, contacts, leads, users,
documents, chronology entries, calendar events, tasks,
communications, chat messages, outbound mail, invoices, trust
transactions — plus paragraph-level chunks of long documents)
writes into a single polymorphic `search_documents` table via
database triggers. That table has a generated `tsvector` column
(for BM25-style keyword ranking), a `pgvector(1536)` column (for
semantic ranking, populated asynchronously by a background
worker), per-row ACLs (`allowed_roles`, `allowed_user_ids`),
denormalized facets, and exact-match identifiers. A single
`/api/search/v2` route runs keyword + identifier + (optional)
semantic queries in parallel, fuses them with Reciprocal Rank
Fusion, applies per-type caps and affinity boosts, enforces ACLs
as a hard pre-filter inside the SQL, and logs every query to a
partitioned audit log. The Cmd+K palette component consumes this
endpoint and renders grouped results with keyboard navigation,
recent items, and deep links back to the source entity.

## Key files

| File | Purpose |
|---|---|
| `supabase/migrations/0006_search_foundation.sql` | Creates `search_documents`, `document_chunks`, `search_audit_log`, enables pgvector + pg_trgm |
| `supabase/migrations/0007_search_triggers.sql` | 13 entity triggers that keep the index in sync synchronously inside every write transaction |
| `db/schema/search.ts` | Drizzle bindings with custom `tsvector` and `vector(1536)` column types |
| `lib/search/types.ts` | `SearchRequest` / `SearchResult` / `SearchResponse` shapes, per-type caps |
| `lib/search/query-parser.ts` | Scoped prefix grammar (`case:`, `@user`, `stage:4D`), identifier detection (HS-XXXXX, SSA doc IDs, ICD-10, SSN last-4), date language |
| `lib/search/rrf.ts` | Reciprocal Rank Fusion merge with per-type caps + affinity boosts |
| `lib/search/access-filter.ts` | **Hard ACL pre-filter** — enforces organization + role + team-chat isolation inside the query. Must never be post-applied. |
| `lib/search/embed-client.ts` | Provider abstraction for Azure OpenAI / OpenAI / self-hosted BGE / stub. 60-second query cache. |
| `lib/search/chunker.ts` | Sentence-aware paragraph chunker with char-offset + page tracking |
| `app/api/search/v2/route.ts` | The `/api/search/v2` GET handler |
| `components/search/command-palette.tsx` | The Cmd+K palette component |
| `scripts/backfill-search-documents.ts` | Replays existing rows through triggers to populate the index |
| `scripts/embedding-worker.ts` | Background job that fills `embedding` for rows where it's NULL |
| `scripts/chunk-documents.ts` | Chunks `document_processing_results.extracted_text` into `document_chunks` + `search_documents` |

## Current status

Phases 0–3 of the comprehensive search plan are shipped and running
on staging. See [roadmap.md](./roadmap.md) for what's deferred to
phase 4.

| Phase | Status | Notes |
|---|---|---|
| 0 — foundation + API + palette | ✅ shipped | 935 rows indexed on staging |
| 1 — all entity triggers + access control | ✅ shipped | 13 triggers live, audit log partitioned |
| 2 — embedding worker + hybrid RRF | ✅ code shipped | Dormant until `SEARCH_EMBEDDING_PROVIDER` is set |
| 3 — document chunking + PDF deep-links | ✅ shipped | 190 chunks from 30 PDFs, `?doc=&page=` auto-opens viewer |
| 4 — query understanding, synonyms, LTR | 🟡 deferred | Foundation accommodates these without rearchitecture |

## PHI / compliance invariants that must never be broken

These rules are enforced in code and should be reviewed on every PR
that touches search:

1. **ACLs are applied as a hard pre-filter inside the SQL query, never
   as a post-filter on returned rows.** Post-filtering leaks
   information via result counts, facet counts, pagination, and
   timing side-channels. See `lib/search/access-filter.ts`.
2. **Team chat is a separate entity type (`chat_message`) and is only
   returned when the caller explicitly opts in via
   `includeTeamChat: true`.** It must never federate with client
   communications (`communication`). Two lines of defence: the
   query parser defaults scope away from chat, and the access
   filter excludes it unless opted in.
3. **Full SSNs are never indexed.** Only SSN last-4 is searchable,
   and only by users with role `attorney`, `case_manager`,
   `medical_records`, or `admin`. The v2 route parses the
   4-digit pattern and routes through role-gated lookup.
4. **Every search query is logged async** to `search_audit_log`
   (partitioned by month) for HIPAA + bar-association audit trail.
5. **Admin-only entity types** (`workflow`, `document_template`,
   `audit_log_entry`) are hidden from non-admin users in the
   access filter — non-admins never see them in facet counts
   either.

## Support

If you hit a bug or a surprising result, check
[runbook.md § troubleshooting](./runbook.md#troubleshooting) first.
If you're adding a new entity type to the index, read
[architecture.md § adding entities](./architecture.md#adding-a-new-entity-type).
