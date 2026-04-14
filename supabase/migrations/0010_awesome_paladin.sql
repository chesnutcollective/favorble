CREATE TABLE "changelog_summaries" (
	"sha" text PRIMARY KEY NOT NULL,
	"short_hash" text NOT NULL,
	"subject" text NOT NULL,
	"type" text NOT NULL,
	"author" text NOT NULL,
	"committed_at" timestamp with time zone NOT NULL,
	"summary" text,
	"details" text,
	"user_impact" text,
	"risk_notes" text,
	"bullets" jsonb,
	"files_changed" jsonb,
	"additions" integer,
	"deletions" integer,
	"pr_number" integer,
	"model" text,
	"prompt_version" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"generated_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_changelog_summaries_committed_at" ON "changelog_summaries" USING btree ("committed_at");--> statement-breakpoint
CREATE INDEX "idx_changelog_summaries_status" ON "changelog_summaries" USING btree ("status");