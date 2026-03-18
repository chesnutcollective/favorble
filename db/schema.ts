import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const launches = pgTable("launches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
