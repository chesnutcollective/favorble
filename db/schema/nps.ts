import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { cases, caseStages } from "./cases";
import { contacts } from "./contacts";

/**
 * NPS campaigns — configurable survey triggers tied to a case stage.
 * Actual survey send / data capture ships in Phase 5 (client portal).
 */
export const npsCampaigns = pgTable(
  "nps_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    triggerStageId: uuid("trigger_stage_id").references(() => caseStages.id),
    delayDays: integer("delay_days").notNull().default(0),
    // 'email' | 'sms' | 'portal'
    channel: text("channel").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (table) => [
    index("idx_nps_campaigns_org_created").on(
      table.organizationId,
      table.createdAt,
    ),
    index("idx_nps_campaigns_trigger_stage").on(table.triggerStageId),
  ],
);

/**
 * NPS responses captured from claimants.
 * category is computed server-side from score:
 *   9-10 = promoter, 7-8 = passive, 0-6 = detractor.
 */
export const npsResponses = pgTable(
  "nps_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    campaignId: uuid("campaign_id").references(() => npsCampaigns.id),
    /**
     * Nullable until the claimant actually submits. Rows are enqueued on
     * stage transition with score/category = null, and filled in by
     * `submitNpsResponse`.
     */
    score: integer("score"),
    // 'promoter' | 'passive' | 'detractor' (CHECK in migration, nullable
    // while the survey is pending)
    category: text("category"),
    comment: text("comment"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    // 'email' | 'sms' | 'portal'
    channel: text("channel").notNull(),
    /**
     * Delivery / scheduling metadata. Known keys:
     *   - scheduledFor: ISO timestamp; dispatcher only sends once now >= this
     *   - stageTransitionId: uuid of the triggering transition (for audit)
     *   - skipped: 'no_twilio' | 'no_phone' | 'opted_out' — reason send was
     *     not actually delivered
     *   - linkUrl, magicLinkId, twilioSid: populated after dispatch attempt
     */
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_nps_responses_org_created").on(
      table.organizationId,
      table.createdAt,
    ),
    index("idx_nps_responses_case").on(table.caseId),
    index("idx_nps_responses_campaign").on(table.campaignId),
    index("idx_nps_responses_category").on(table.category),
  ],
);

/**
 * Action items opened off the back of a response (typically detractors).
 * Assignee is a staff user; status progresses open → in_progress → resolved.
 */
export const npsActionItems = pgTable(
  "nps_action_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => npsResponses.id),
    // 'open' | 'in_progress' | 'resolved'
    status: text("status").notNull().default("open"),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_nps_action_items_response").on(table.responseId),
    index("idx_nps_action_items_assignee").on(table.assignedToUserId),
    index("idx_nps_action_items_status").on(table.status),
  ],
);

// Table-level types live here with a `Record` suffix to avoid colliding with
// the UI-shaped `NpsResponseRow` / `NpsActionItemRow` types exported by
// `app/actions/nps.ts`.
export type NpsCampaignRecord = typeof npsCampaigns.$inferSelect;
export type NewNpsCampaignRecord = typeof npsCampaigns.$inferInsert;
export type NpsResponseRecord = typeof npsResponses.$inferSelect;
export type NewNpsResponseRecord = typeof npsResponses.$inferInsert;
export type NpsActionItemRecord = typeof npsActionItems.$inferSelect;
export type NewNpsActionItemRecord = typeof npsActionItems.$inferInsert;
