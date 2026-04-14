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
import { users } from "./users";

export const caseSavedViews = pgTable(
  "case_saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    filters: jsonb("filters").notNull().default({}),
    sort: jsonb("sort").notNull().default({}),
    isShared: boolean("is_shared").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_case_saved_views_org").on(table.organizationId),
    index("idx_case_saved_views_user").on(table.userId),
    index("idx_case_saved_views_org_user").on(
      table.organizationId,
      table.userId,
    ),
  ],
);
