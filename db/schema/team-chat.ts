import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { cases } from "./cases";

export const chatChannelTypeEnum = pgEnum("chat_channel_type", [
  "team",
  "case",
  "direct",
  "announcement",
]);

export const chatChannels = pgTable(
  "chat_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    channelType: chatChannelTypeEnum("channel_type").notNull().default("team"),
    caseId: uuid("case_id").references(() => cases.id),
    isPrivate: boolean("is_private").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_chat_channels_org").on(table.organizationId),
    index("idx_chat_channels_case").on(table.caseId),
    index("idx_chat_channels_org_type").on(
      table.organizationId,
      table.channelType,
    ),
  ],
);

export const chatChannelMembers = pgTable(
  "chat_channel_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_chat_members_channel").on(table.channelId),
    index("idx_chat_members_user").on(table.userId),
    uniqueIndex("idx_chat_members_channel_user").on(
      table.channelId,
      table.userId,
    ),
  ],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    parentMessageId: uuid("parent_message_id"),
    mentionedUserIds: uuid("mentioned_user_ids").array(),
    reactions: jsonb("reactions").default({}),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_chat_messages_channel").on(table.channelId),
    index("idx_chat_messages_channel_created").on(
      table.channelId,
      table.createdAt,
    ),
    index("idx_chat_messages_user").on(table.userId),
    index("idx_chat_messages_parent").on(table.parentMessageId),
  ],
);
