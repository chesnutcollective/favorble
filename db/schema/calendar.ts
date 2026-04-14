import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { cases } from "./cases";
import { users } from "./users";
import { portalUsers } from "./portal";
import { calendarEventTypeEnum } from "./enums";

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id").references(() => cases.id),
    title: text("title").notNull(),
    description: text("description"),
    eventType: calendarEventTypeEnum("event_type").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location"),
    hearingOffice: text("hearing_office"),
    adminLawJudge: text("admin_law_judge"),
    outlookEventId: text("outlook_event_id"),
    reminderSent: boolean("reminder_sent").notNull().default(false),
    reminderConfig: jsonb("reminder_config").default({}),
    createdBy: uuid("created_by").references(() => users.id),

    // Portal (B5) — whether this event surfaces on the client portal.
    visibleToClient: boolean("visible_to_client").notNull().default(false),
    // Portal (B5) — whether the claimant's attendance is required (shows a
    // prominent badge on the portal card).
    attendanceRequired: boolean("attendance_required").notNull().default(false),
    // Portal (B5) — staff-authored location string shown to the client. Falls
    // back to `location` if null.
    clientLocationText: text("client_location_text"),
    // Portal (B5) — staff-authored description shown to the client. Falls
    // back to `description` if null.
    clientDescription: text("client_description"),
    // Portal (B5) — timestamp when the claimant confirmed the appointment via
    // the portal. Null = not confirmed.
    clientConfirmedAt: timestamp("client_confirmed_at", { withTimezone: true }),
    // Portal (B5) — portal_user_id that clicked Confirm.
    clientConfirmedBy: uuid("client_confirmed_by").references(
      () => portalUsers.id,
    ),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_events_org").on(table.organizationId),
    index("idx_events_case").on(table.caseId),
    index("idx_events_date").on(table.startAt),
    index("idx_events_org_type_date").on(
      table.organizationId,
      table.eventType,
      table.startAt,
    ),
    index("idx_events_visible_to_client").on(table.visibleToClient),
  ],
);

export const calendarEventAttendees = pgTable(
  "calendar_event_attendees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id),
    userId: uuid("user_id").references(() => users.id),
    email: text("email"),
    name: text("name"),
    responseStatus: text("response_status"),
  },
  (table) => [
    index("idx_attendees_event").on(table.eventId),
    index("idx_attendees_user").on(table.userId),
  ],
);
