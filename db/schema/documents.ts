import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { users } from "./users";
import { documentSourceEnum, signatureStatusEnum } from "./enums";

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull(),
    fileSizeBytes: integer("file_size_bytes"),
    storagePath: text("storage_path").notNull(),
    category: text("category"),
    source: documentSourceEnum("source").notNull().default("upload"),
    sourceExternalId: text("source_external_id"),
    description: text("description"),
    tags: text("tags").array(),
    metadata: jsonb("metadata").default({}),
    version: integer("version").notNull().default(1),
    parentDocumentId: uuid("parent_document_id"),
    isConfidential: boolean("is_confidential").notNull().default(false),
    /**
     * Denormalized flag set by shareDocumentWithClient when at least one
     * active (non-revoked) document_shares row exists. Enables the cases
     * documents view to badge + filter without joining document_shares on
     * every render. Source of truth is still document_shares — this flag is
     * best-effort.
     */
    visibleToClient: boolean("visible_to_client").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_docs_case").on(table.caseId),
    index("idx_docs_source").on(table.source, table.sourceExternalId),
    index("idx_docs_case_created").on(table.caseId, table.createdAt),
  ],
);

export const documentTemplates = pgTable(
  "document_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    templateContent: text("template_content"),
    mergeFields: text("merge_fields").array(),
    storagePath: text("storage_path"),
    requiresSignature: boolean("requires_signature").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idx_doc_templates_org").on(table.organizationId)],
);

export const signatureRequests = pgTable(
  "signature_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    signerEmail: text("signer_email").notNull(),
    signerName: text("signer_name").notNull(),
    status: signatureStatusEnum("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    signedDocumentPath: text("signed_document_path"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_sig_case").on(table.caseId),
    index("idx_sig_status").on(table.status),
  ],
);
