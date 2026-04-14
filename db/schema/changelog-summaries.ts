import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * AI-generated thorough explanations for each git commit, keyed by SHA.
 * SHAs are immutable, so rows never need invalidation — only inserted once
 * per commit and re-generated when the prompt rubric changes (bumped via
 * promptVersion).
 */
export const changelogSummaries = pgTable(
  "changelog_summaries",
  {
    sha: text("sha").primaryKey(),
    shortHash: text("short_hash").notNull(),
    subject: text("subject").notNull(),
    type: text("type").notNull(),
    author: text("author").notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull(),

    // AI-generated content
    summary: text("summary"),
    details: text("details"),
    userImpact: text("user_impact"),
    riskNotes: text("risk_notes"),
    bullets: jsonb("bullets").$type<string[]>(),

    // Diff / file metadata captured from GitHub
    filesChanged: jsonb("files_changed").$type<
      Array<{
        path: string;
        status: string;
        additions: number;
        deletions: number;
      }>
    >(),
    additions: integer("additions"),
    deletions: integer("deletions"),
    prNumber: integer("pr_number"),

    // Generation metadata
    model: text("model"),
    promptVersion: text("prompt_version"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),

    // Lifecycle
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_changelog_summaries_committed_at").on(table.committedAt),
    index("idx_changelog_summaries_status").on(table.status),
  ],
);
