import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

let db

export function getDb() {
  return db
}

export function initDb(dbPath) {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const schema = readFileSync(join(__dir, 'schema.sql'), 'utf8')
  db.exec(schema)

  // Phase-2 migrations — try/catch because SQLite has no IF NOT EXISTS for columns
  const migrations = [
    `ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`,
    `ALTER TABLE accounts ADD COLUMN verified INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE accounts ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'none'`,
    `ALTER TABLE accounts ADD COLUMN verification_note TEXT`,
    `ALTER TABLE documents ADD COLUMN added_by_account TEXT REFERENCES accounts(id)`,
    `ALTER TABLE documents ADD COLUMN added_by_role TEXT DEFAULT 'user'`,
    `ALTER TABLE accounts ADD COLUMN gemini_token TEXT`,
  ]
  for (const sql of migrations) {
    try { db.exec(sql) } catch { /* column already exists */ }
  }

  return db
}
