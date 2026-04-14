import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { documents } from "./documents";
import { users } from "./users";
import { portalUsers } from "./portal";
import { medicalChronologyEntries } from "./medical-chronology";

/**
 * Phase 5 / B6 — client-facing treatment log.
 *
 * Claimants record visits ("Saw Dr. Smith on 2026-02-14 for back pain, here's
 * the receipt") from the /portal/treatment-log/new form. Medical-records
 * staff review pending entries in the firm-side dashboard and either merge
 * them into medical_chronology_entries (filling in ICD codes + normalizing
 * the provider name) or reject them with a reason.
 *
 * When merged, promoted_to_chronology_entry_id back-references the newly
 * created chronology row so the portal can surface "Reviewed" status and
 * staff can jump from the log into the chronology.
 *
 * Status lifecycle:
 *   pending  -> merged   (via mergeTreatmentEntryIntoChronology)
 *   pending  -> rejected (via rejectTreatmentEntry, notes carries reason)
 */
export const clientTreatmentEntries = pgTable(
  "client_treatment_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    portalUserId: uuid("portal_user_id")
      .notNull()
      .references(() => portalUsers.id),
    providerName: text("provider_name").notNull(),
    visitDate: timestamp("visit_date", { withTimezone: true }).notNull(),
    /**
     * Free-form reason tag from the portal form (primary-care, specialist,
     * ER, hospital, therapy, diagnostic, other). Kept as text — the portal
     * form constrains the choices at the UI level.
     */
    reason: text("reason"),
    /**
     * Claimant-authored notes. On rejection we also store the firm's
     * internal reason here (prefixed "[rejection]: …") so the record is
     * self-contained; the portal surfaces a softer client-facing message.
     */
    notes: text("notes"),
    /** Optional receipt upload → documents table. */
    receiptDocumentId: uuid("receipt_document_id").references(
      () => documents.id,
    ),
    /**
     * When status=merged, points at the medical_chronology_entries row the
     * staff user created from this log entry.
     */
    promotedToChronologyEntryId: uuid(
      "promoted_to_chronology_entry_id",
    ).references(() => medicalChronologyEntries.id),
    /** 'pending' | 'merged' | 'rejected' (CHECK constraint in migration). */
    status: text("status").notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_client_treatment_entries_case").on(table.caseId),
    index("idx_client_treatment_entries_status").on(table.status),
    index("idx_client_treatment_entries_org_created").on(
      table.organizationId,
      table.createdAt,
    ),
    index("idx_client_treatment_entries_portal_user").on(table.portalUserId),
  ],
);

export type ClientTreatmentEntryRow =
  typeof clientTreatmentEntries.$inferSelect;
export type NewClientTreatmentEntryRow =
  typeof clientTreatmentEntries.$inferInsert;

export type ClientTreatmentEntryStatus = "pending" | "merged" | "rejected";

/**
 * Canonical list of reason codes offered to claimants in the portal form.
 * Kept next to the table so the UI + server action share one source.
 */
export const CLIENT_TREATMENT_REASON_CODES = [
  "primary_care",
  "specialist",
  "er",
  "hospital",
  "therapy",
  "diagnostic",
  "other",
] as const;

export type ClientTreatmentReasonCode =
  (typeof CLIENT_TREATMENT_REASON_CODES)[number];
