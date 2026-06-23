import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const demoRecords = sqliteTable("demo_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  message: text("message").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type DemoRecord = typeof demoRecords.$inferSelect;
export type NewDemoRecord = typeof demoRecords.$inferInsert;
