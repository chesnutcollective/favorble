import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { userRoleEnum, teamEnum } from "./enums";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    authUserId: uuid("auth_user_id").unique(),
    email: text("email").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    avatarUrl: text("avatar_url"),
    role: userRoleEnum("role").notNull().default("viewer"),
    team: teamEnum("team"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_users_org").on(table.organizationId),
    index("idx_users_email").on(table.email),
    index("idx_users_team").on(table.organizationId, table.team),
    index("idx_users_auth").on(table.authUserId),
  ],
);
