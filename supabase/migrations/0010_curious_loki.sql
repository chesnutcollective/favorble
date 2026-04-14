CREATE TABLE "integration_alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"integration_id" text NOT NULL,
	"failure_threshold" integer DEFAULT 3 NOT NULL,
	"window_minutes" integer DEFAULT 60 NOT NULL,
	"enabled" text DEFAULT 'true' NOT NULL,
	"last_fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"integration_id" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text NOT NULL,
	"latency_ms" integer,
	"http_status" integer,
	"summary" text,
	"payload" jsonb,
	"webhook_path" text,
	"webhook_event_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_alert_rules" ADD CONSTRAINT "integration_alert_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_integration_alert_rules_org" ON "integration_alert_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_integration_alert_rules_integration" ON "integration_alert_rules" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX "idx_integration_events_integration_created" ON "integration_events" USING btree ("integration_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_integration_events_org" ON "integration_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_integration_events_type" ON "integration_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_integration_events_status" ON "integration_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_integration_events_created" ON "integration_events" USING btree ("created_at");