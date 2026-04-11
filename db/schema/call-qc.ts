import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { cases } from "./cases";
import { callQcStatusEnum } from "./enums";

/**
 * Call recordings + transcripts + AI QC reviews.
 *
 * Feeds QA-1. Starts with a CallTools webhook receiver that lands a
 * recording URL + metadata. A transcription worker (Deepgram / Whisper)
 * produces the transcript. An AI reviewer scores the transcript on
 * quality, compliance, and communication standards.
 *
 * NOTE: transcription + QC LLM calls are wired via after() and a
 * scanner cron; see lib/services/call-qc.ts.
 */
export const callRecordings = pgTable(
  "call_recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id").references(() => cases.id),
    // The team member who made/received the call
    userId: uuid("user_id").references(() => users.id),
    // Other party's identity if known — claimant, provider, SSA, etc.
    counterpartyName: text("counterparty_name"),
    counterpartyPhone: text("counterparty_phone"),
    direction: text("direction").notNull(), // "inbound" | "outbound"
    // CallTools (or whichever provider) external id
    externalRecordingId: text("external_recording_id"),
    // Durable storage path for the audio file (railway:// preferred)
    audioStoragePath: text("audio_storage_path"),
    durationSeconds: integer("duration_seconds"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    status: callQcStatusEnum("status")
      .notNull()
      .default("pending_transcription"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_call_recordings_org_status").on(
      table.organizationId,
      table.status,
    ),
    index("idx_call_recordings_case").on(table.caseId),
    index("idx_call_recordings_user").on(table.userId),
  ],
);

export const callTranscripts = pgTable(
  "call_transcripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callRecordingId: uuid("call_recording_id")
      .notNull()
      .references(() => callRecordings.id, { onDelete: "cascade" })
      .unique(),
    // Provider used to generate the transcript
    provider: text("provider").notNull(), // "deepgram" | "whisper" | "stub"
    // Full text of the transcript
    fullText: text("full_text").notNull(),
    // Speaker-segmented entries: [{ speaker, startMs, endMs, text }, ...]
    segments: jsonb("segments"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    wordCount: integer("word_count"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

export const callQcReviews = pgTable(
  "call_qc_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callRecordingId: uuid("call_recording_id")
      .notNull()
      .references(() => callRecordings.id, { onDelete: "cascade" }),
    // Overall quality score 0-100
    overallScore: integer("overall_score").notNull(),
    // Sub-scores: { quality, compliance, empathy, professionalism }
    scores: jsonb("scores").notNull(),
    // Positive/negative observations, each with a transcript offset
    highlights: jsonb("highlights"),
    // Concerns flagged for supervisor review
    flags: jsonb("flags"),
    // AI-generated narrative summary for the reviewer
    summary: text("summary"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_call_qc_reviews_recording").on(table.callRecordingId),
    index("idx_call_qc_reviews_score").on(table.overallScore),
  ],
);
