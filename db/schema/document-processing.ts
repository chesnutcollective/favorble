import {
	pgTable,
	uuid,
	text,
	timestamp,
	integer,
	jsonb,
	index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { documents } from "./documents";
import { cases } from "./cases";
import { documentProcessingStatusEnum } from "./enums";

export const documentProcessingResults = pgTable(
	"document_processing_results",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id),
		documentId: uuid("document_id")
			.notNull()
			.references(() => documents.id),
		caseId: uuid("case_id")
			.notNull()
			.references(() => cases.id),
		status: documentProcessingStatusEnum("status")
			.notNull()
			.default("pending"),
		extractedText: text("extracted_text"),
		pageCount: integer("page_count"),
		documentCategory: text("document_category"),
		providerName: text("provider_name"),
		providerType: text("provider_type"),
		treatmentDateStart: timestamp("treatment_date_start", {
			withTimezone: true,
		}),
		treatmentDateEnd: timestamp("treatment_date_end", {
			withTimezone: true,
		}),
		aiClassification: jsonb("ai_classification").default({}),
		aiConfidence: integer("ai_confidence"),
		errorMessage: text("error_message"),
		processingTimeMs: integer("processing_time_ms"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("idx_doc_proc_document").on(table.documentId),
		index("idx_doc_proc_case").on(table.caseId),
		index("idx_doc_proc_status").on(table.status),
		index("idx_doc_proc_case_category").on(
			table.caseId,
			table.documentCategory,
		),
		index("idx_doc_proc_provider").on(table.providerName),
	],
);
