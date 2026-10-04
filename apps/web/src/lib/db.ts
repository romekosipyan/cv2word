import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getConfig } from "./config";

let dbSingleton: DatabaseSync | null = null;
let dbPathForSingleton: string | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL,
  original_object_key TEXT,
  output_object_key TEXT,
  size_bucket TEXT,
  page_bucket TEXT,
  engine_version TEXT,
  error_code TEXT,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  tombstone INTEGER NOT NULL DEFAULT 0,
  quota_counted INTEGER NOT NULL DEFAULT 0,
  upload_token_hash TEXT,
  upload_token_expires_at TEXT,
  lease_token TEXT,
  lease_expires_at TEXT,
  UNIQUE(session_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_jobs_session_state ON jobs(session_id, state);
CREATE INDEX IF NOT EXISTS idx_jobs_session_created ON jobs(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);
`;

function ensureColumn(
  db: DatabaseSync,
  table: string,
  column: string,
  ddl: string,
): void {
  const rows = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  if (rows.some((r) => r.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

export function resetDbForTests(databasePath?: string): void {
  if (dbSingleton) {
    dbSingleton.close();
    dbSingleton = null;
    dbPathForSingleton = null;
  }
  if (databasePath) {
    process.env.DATABASE_PATH = databasePath;
    const dir = path.dirname(databasePath);
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(databasePath)) {
      fs.unlinkSync(databasePath);
    }
  }
}

export function getDb(): DatabaseSync {
  const { databasePath } = getConfig();
  if (dbSingleton && dbPathForSingleton === databasePath) {
    return dbSingleton;
  }
  if (dbSingleton) {
    dbSingleton.close();
    dbSingleton = null;
  }
  const dir = path.dirname(databasePath);
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  ensureColumn(db, "jobs", "lease_token", "lease_token TEXT");
  ensureColumn(db, "jobs", "lease_expires_at", "lease_expires_at TEXT");
  dbSingleton = db;
  dbPathForSingleton = databasePath;
  return db;
}
