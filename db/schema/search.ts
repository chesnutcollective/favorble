import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  integer,
  bigserial,
  customType,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { documents } from "./documents";

/**
 * Custom column types for pgvector + tsvector. Drizzle ships neither
 * natively as of this writing, so we teach the query builder to pass
 * them through as raw values. The embedding column accepts a
 * `number[]` at the app layer and is serialized to the `vector(n)`
 * literal `[0.1,0.2,...]` on write.
 */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const vector1536 = customType<{
  data: number[];
  driverData: string;
}>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
});

/**
 * `search_documents` — the polymorphic index that every searchable
 * entity writes into via triggers. See
 * `supabase/migrations/0006_search_foundation.sql` for full notes.
 */
export const searchDocuments = pgTable(
  "search_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),

    title: text("title").notNull(),
    subtitle: text("subtitle"),
    body: text("body"),

    // Generated column — not writable from Drizzle inserts. We keep it
    // here so we can SELECT and ORDER BY ts_rank against it.
    tsv: tsvector("tsv"),

    embedding: vector1536("embedding"),

    allowedRoles: text("allowed_roles")
      .array()
      .notNull()
      .default(["attorney", "case_manager", "admin"]),
    allowedUserIds: uuid("allowed_user_ids").array(),
    ownerUserId: uuid("owner_user_id"),

    facets: jsonb("facets").notNull().default({}),
    identifiers: text("identifiers").array(),

    entityUpdatedAt: timestamp("entity_updated_at", {
      withTimezone: true,
    }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("search_documents_entity_unique").on(
      table.entityType,
      table.entityId,
    ),
    index("idx_search_docs_org_type").on(
      table.organizationId,
      table.entityType,
      table.entityUpdatedAt,
    ),
  ],
);

/**
 * `document_chunks` — phase 3. Paragraph-level chunks of long-form
 * document content with page + char offsets so passage-level hits can
 * deep-link back into the source PDF.
 */
export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").references(() => cases.id, {
      onDelete: "cascade",
    }),

    chunkIndex: integer("chunk_index").notNull(),
    pageNumber: integer("page_number"),
    charStart: integer("char_start").notNull(),
    charEnd: integer("char_end").notNull(),
    chunkText: text("chunk_text").notNull(),
    tokenCount: integer("token_count"),
    bbox: jsonb("bbox"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("document_chunks_unique").on(
      table.documentId,
      table.chunkIndex,
    ),
    index("idx_doc_chunks_case").on(table.caseId),
    index("idx_doc_chunks_org").on(table.organizationId),
  ],
);

/**
 * `search_audit_log` — append-only log of every search query for HIPAA
 * + bar-association compliance. Partitioned by month in the migration.
 */
export const searchAuditLog = pgTable("search_audit_log", {
  id: bigserial("id", { mode: "bigint" }),
  organizationId: uuid("organization_id").notNull(),
  userId: uuid("user_id").notNull(),
  queryText: text("query_text").notNull(),
  queryScope: text("query_scope"),
  filters: jsonb("filters"),
  resultCount: integer("result_count"),
  resultIds: uuid("result_ids").array(),
  latencyMs: integer("latency_ms"),
  clientIp: text("client_ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
