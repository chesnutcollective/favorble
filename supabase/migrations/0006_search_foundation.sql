-- Search Foundation — phases 0 through 3 of the comprehensive search plan.
--
-- This migration builds a single polymorphic `search_documents` index that
-- every searchable entity in the app writes into via triggers. The same
-- table supports:
--   * BM25-style keyword ranking via a generated `tsvector`
--   * Semantic ranking via a pgvector embedding column
--   * Typo-tolerant fuzzy matching via pg_trgm
--   * Direct identifier lookup (case numbers, SSA doc IDs, reference numbers)
--   * Facet filtering via a jsonb column
--   * Role + ACL based access control at the query layer
--
-- It is intentionally additive: existing `/api/search` and the old
-- `GlobalSearch` component keep working. A new `/api/search/v2` endpoint
-- will read from `search_documents`.
--
-- Companion tables:
--   * `document_chunks` — phase 3, stores paragraph-level passages for
--     long document bodies, with page + char offsets for PDF deep-links
--   * `search_audit_log` — every search query is logged for HIPAA /
--     compliance purposes (append-only, partitioned by month)

-- ─── Extensions ────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── search_documents ─────────────────────────────────────────────
--
-- One row per searchable entity. Entity-specific triggers keep this in
-- sync on INSERT/UPDATE/DELETE of the source tables.

CREATE TABLE IF NOT EXISTS search_documents (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type         text          NOT NULL,
  entity_id           uuid          NOT NULL,

  -- Display fields (precomputed so the API doesn't join back to source
  -- tables to render a row).
  title               text          NOT NULL,
  subtitle            text,
  body                text,

  -- Generated full-text vector with per-field weights:
  --   A = title, B = subtitle, C = body
  tsv                 tsvector      GENERATED ALWAYS AS (
                                      setweight(to_tsvector('english', coalesce(title, '')),    'A') ||
                                      setweight(to_tsvector('english', coalesce(subtitle, '')), 'B') ||
                                      setweight(to_tsvector('english', coalesce(body, '')),     'C')
                                    ) STORED,

  -- Semantic embedding, populated asynchronously by the embedding worker.
  -- 1536 dims matches OpenAI text-embedding-3-small. If self-hosting BGE-m3
  -- (1024 dim) or another model, adjust here and in the embedding worker.
  embedding           vector(1536),

  -- Access control. `allowed_roles` is the list of roles that can see this
  -- row. `allowed_user_ids` is an optional explicit allowlist for ethical-
  -- wall or private-matter overrides.
  allowed_roles       text[]        NOT NULL DEFAULT '{attorney,case_manager,admin}',
  allowed_user_ids    uuid[],

  -- "My stuff" boost. Usually the case owner / lead owner / assignee.
  owner_user_id       uuid,

  -- Denormalized facet values for fast filtering without joining to source
  -- tables. Each entity type writes a consistent shape — see triggers.
  facets              jsonb         NOT NULL DEFAULT '{}'::jsonb,

  -- Exact-match identifiers (case number, SSA doc ID, ref numbers).
  -- GIN-indexed so `$1 = ANY(identifiers)` is fast.
  identifiers         text[],

  -- Freshness signal for recency decay.
  entity_updated_at   timestamptz   NOT NULL,

  -- Housekeeping.
  indexed_at          timestamptz   NOT NULL DEFAULT now(),
  deleted_at          timestamptz,

  CONSTRAINT search_documents_entity_unique UNIQUE (entity_type, entity_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_search_docs_tsv         ON search_documents USING GIN (tsv);
CREATE INDEX IF NOT EXISTS idx_search_docs_trgm_title  ON search_documents USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_search_docs_identifiers ON search_documents USING GIN (identifiers);
CREATE INDEX IF NOT EXISTS idx_search_docs_facets      ON search_documents USING GIN (facets jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_search_docs_org_type    ON search_documents (organization_id, entity_type, entity_updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_search_docs_owner       ON search_documents (organization_id, owner_user_id)
  WHERE deleted_at IS NULL AND owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_search_docs_embedding_null ON search_documents (indexed_at)
  WHERE embedding IS NULL AND deleted_at IS NULL;

-- HNSW vector index — created empty here, will populate as the embedding
-- worker fills rows. HNSW builds incrementally so this is safe.
CREATE INDEX IF NOT EXISTS idx_search_docs_embedding
  ON search_documents USING hnsw (embedding vector_cosine_ops);

-- ─── document_chunks ──────────────────────────────────────────────
--
-- Phase 3. Paragraph / passage-level chunks of long-form document content.
-- Each chunk has its own embedding and mirrors into search_documents as
-- entity_type = 'document_chunk' so the main search can retrieve individual
-- passages while still sharing the same ACL + RRF pipeline.

CREATE TABLE IF NOT EXISTS document_chunks (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         uuid          NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id     uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id             uuid          REFERENCES cases(id) ON DELETE CASCADE,

  chunk_index         integer       NOT NULL,             -- 0-based position within the document
  page_number         integer,                            -- 1-based PDF page
  char_start          integer       NOT NULL,             -- char offset in the full extracted_text
  char_end            integer       NOT NULL,
  chunk_text          text          NOT NULL,
  token_count         integer,

  -- Bounding box on the PDF page, if the OCR layer preserved it.
  bbox                jsonb,                              -- {x, y, width, height}

  created_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT document_chunks_unique UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_doc_chunks_document     ON document_chunks (document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_case         ON document_chunks (case_id);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_org          ON document_chunks (organization_id);

-- ─── search_audit_log ─────────────────────────────────────────────
--
-- Every search query lands here, fire-and-forget, off the hot path.
-- HIPAA + bar-association rules both require an auditable trail of what
-- was searched against client records. Partitioned by month so the table
-- stays manageable. The app layer inserts via a separate async call so a
-- slow audit write never blocks the search response.

CREATE TABLE IF NOT EXISTS search_audit_log (
  id              bigserial     NOT NULL,
  organization_id uuid          NOT NULL,
  user_id         uuid          NOT NULL,
  query_text      text          NOT NULL,
  query_scope     text,
  filters         jsonb,
  result_count    integer,
  result_ids      uuid[],
  latency_ms      integer,
  client_ip       inet,
  user_agent      text,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Seed partitions for the current and next two months. A cron job or
-- monthly maintenance script should create future partitions.
DO $$
DECLARE
  month_start date := date_trunc('month', now())::date;
BEGIN
  FOR i IN 0..2 LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS search_audit_log_%s PARTITION OF search_audit_log FOR VALUES FROM (%L) TO (%L)',
      to_char(month_start + (i || ' months')::interval, 'YYYY_MM'),
      (month_start + (i || ' months')::interval)::date,
      (month_start + ((i + 1) || ' months')::interval)::date
    );
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_search_audit_org_user ON search_audit_log (organization_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_audit_created  ON search_audit_log (created_at DESC);
