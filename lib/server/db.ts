import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { count, desc } from "drizzle-orm";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";

import * as schema from "@/lib/server/db/schema";
import { demoRecords, type DemoRecord } from "@/lib/server/db/schema";

const DEFAULT_DATABASE_PATH = path.join(
  process.cwd(),
  ".local",
  "data",
  "app.sqlite",
);
const DEFAULT_VERCEL_DATABASE_PATH = path.join(os.tmpdir(), "app.sqlite");

export const MAX_DEMO_RECORD_MESSAGE_LENGTH = 500;

type DatabaseConnection = {
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
};

let cachedConnection: DatabaseConnection | undefined;

export function getDatabasePath() {
  return (
    process.env.DATABASE_PATH ??
    (process.env.VERCEL === "1"
      ? DEFAULT_VERCEL_DATABASE_PATH
      : DEFAULT_DATABASE_PATH)
  );
}

export function getDatabase() {
  return getConnection().db;
}

export function ensureDatabase() {
  getConnection();
}

function getConnection() {
  if (cachedConnection?.sqlite.open) {
    return cachedConnection;
  }

  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  migrate(sqlite);

  cachedConnection = {
    sqlite,
    db: drizzle(sqlite, { schema }),
  };
  return cachedConnection;
}

export function listDemoRecords(): DemoRecord[] {
  return getDatabase()
    .select({
      id: demoRecords.id,
      message: demoRecords.message,
      createdAt: demoRecords.createdAt,
    })
    .from(demoRecords)
    .orderBy(desc(demoRecords.id))
    .limit(50)
    .all();
}

export function countDemoRecords() {
  const row = getDatabase().select({ value: count() }).from(demoRecords).get();

  return row?.value ?? 0;
}

export function createDemoRecord(message: string): DemoRecord {
  return getDatabase()
    .insert(demoRecords)
    .values({ message })
    .returning({
      id: demoRecords.id,
      message: demoRecords.message,
      createdAt: demoRecords.createdAt,
    })
    .get();
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS demo_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
