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
    `ALTER TABLE animals ADD COLUMN avatar_path TEXT`,
    `ALTER TABLE animals ADD COLUMN dynamic_fields TEXT DEFAULT '{}'`,
    `ALTER TABLE documents ADD COLUMN allowed_roles TEXT DEFAULT '["vet", "authority", "readonly"]'`,
    `ALTER TABLE animal_sharing ADD COLUMN share_dynamic_fields INTEGER NOT NULL DEFAULT 0`,
  ]
  for (const sql of migrations) {
    try { db.exec(sql) } catch { /* column already exists */ }
  }

  // JWT Blacklist table for logout functionality
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS jwt_blacklist (
        jti TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
      )
    `)
  } catch { /* table already exists */ }

  // Organizations table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'family',
        owner_id TEXT NOT NULL REFERENCES accounts(id),
        verified INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `)
  } catch { /* table already exists */ }

  // Organization memberships
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS org_memberships (
        org_id TEXT NOT NULL REFERENCES organizations(id),
        account_id TEXT NOT NULL REFERENCES accounts(id),
        role TEXT DEFAULT 'member',
        invited_by TEXT REFERENCES accounts(id),
        accepted INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        PRIMARY KEY (org_id, account_id)
      )
    `)
  } catch { /* table already exists */ }

  // Cleanup expired tokens on startup
  const now = Math.floor(Date.now() / 1000)
  db.prepare('DELETE FROM jwt_blacklist WHERE expires_at < ?').run(now)

  return db
}
