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
import { documents } from "./documents";
import { users } from "./users";
import { medicalEntryTypeEnum, exhibitPacketStatusEnum } from "./enums";

export const medicalChronologyEntries = pgTable(
  "medical_chronology_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    sourceDocumentId: uuid("source_document_id").references(() => documents.id),
    entryType: medicalEntryTypeEnum("entry_type").notNull().default("other"),
    eventDate: timestamp("event_date", { withTimezone: true }),
    eventDateEnd: timestamp("event_date_end", { withTimezone: true }),
    providerName: text("provider_name"),
    providerType: text("provider_type"),
    facilityName: text("facility_name"),
    summary: text("summary").notNull(),
    details: text("details"),
    diagnoses: text("diagnoses").array(),
    treatments: text("treatments").array(),
    medications: text("medications").array(),
    pageReference: text("page_reference"),
    aiGenerated: boolean("ai_generated").notNull().default(true),
    isVerified: boolean("is_verified").notNull().default(false),
    verifiedBy: uuid("verified_by").references(() => users.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    isExcluded: boolean("is_excluded").notNull().default(false),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_med_chron_case").on(table.caseId),
    index("idx_med_chron_case_date").on(table.caseId, table.eventDate),
    index("idx_med_chron_source_doc").on(table.sourceDocumentId),
    index("idx_med_chron_case_type").on(table.caseId, table.entryType),
    index("idx_med_chron_provider").on(table.providerName),
    index("idx_med_chron_case_verified").on(table.caseId, table.isVerified),
  ],
);

export const exhibitPackets = pgTable(
  "exhibit_packets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    title: text("title").notNull(),
    description: text("description"),
    status: exhibitPacketStatusEnum("status").notNull().default("draft"),
    packetStoragePath: text("packet_storage_path"),
    packetSizeBytes: integer("packet_size_bytes"),
    tableOfContents: jsonb("table_of_contents").default([]),
    metadata: jsonb("metadata").default({}),
    builtAt: timestamp("built_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (table) => [
    index("idx_exhibit_packets_case").on(table.caseId),
    index("idx_exhibit_packets_org_status").on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const exhibitPacketDocuments = pgTable(
  "exhibit_packet_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packetId: uuid("packet_id")
      .notNull()
      .references(() => exhibitPackets.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    exhibitLabel: text("exhibit_label"),
    displayOrder: integer("display_order").notNull().default(0),
    startPage: integer("start_page"),
    endPage: integer("end_page"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_exhibit_packet_docs_packet").on(table.packetId),
    index("idx_exhibit_packet_docs_document").on(table.documentId),
  ],
);
