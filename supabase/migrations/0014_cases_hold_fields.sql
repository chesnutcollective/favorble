ALTER TABLE "cases" ADD COLUMN "hold_reason" text;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "hold_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "hold_by" uuid;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_hold_by_users_id_fk" FOREIGN KEY ("hold_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
