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
    `ALTER TABLE animals ADD COLUMN address TEXT`,
    `ALTER TABLE documents ADD COLUMN allowed_roles TEXT DEFAULT '["vet", "authority", "guest"]'`,
    `ALTER TABLE documents ADD COLUMN analysis_status TEXT DEFAULT 'pending_analysis'`,
    `ALTER TABLE animal_sharing ADD COLUMN share_dynamic_fields INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE animal_sharing ADD COLUMN share_address INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE accounts ADD COLUMN gemini_model TEXT DEFAULT 'gemini-3.1-flash-lite-preview'`,
    `ALTER TABLE accounts ADD COLUMN anthropic_token TEXT`,
    `ALTER TABLE accounts ADD COLUMN claude_model TEXT DEFAULT 'claude-haiku-4-5-20251001'`,
    `ALTER TABLE accounts ADD COLUMN openai_token TEXT`,
    `ALTER TABLE accounts ADD COLUMN openai_model TEXT DEFAULT 'gpt-4.1-mini'`,
    `ALTER TABLE accounts ADD COLUMN ai_provider_priority TEXT DEFAULT '["google", "anthropic", "openai"]'`,
  ]
  for (const sql of migrations) {
    try { db.exec(sql) } catch { /* column already exists */ }
  }

  // Detect whether animal_sharing currently supports guest or readonly as public role.
  const animalSharingTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'animal_sharing'").get()?.sql || ''
  const supportsGuestRole = animalSharingTableSql.includes("'guest'")
  const publicSharingRole = supportsGuestRole ? 'guest' : 'readonly'

  // Ensure every animal has a public sharing row in the role that the current schema accepts.
  try {
    db.exec(`
      INSERT OR IGNORE INTO animal_sharing (id, animal_id, role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields)
      SELECT lower(hex(randomblob(16))), a.id, '${publicSharingRole}', 0, 1, 1, 0, 0
      FROM animals a
      WHERE NOT EXISTS (
        SELECT 1 FROM animal_sharing s WHERE s.animal_id = a.id AND s.role = '${publicSharingRole}'
      )
    `)
  } catch { /* table may not exist yet */ }

  // Role/data migrations for sharing model changes.
  if (supportsGuestRole) {
    try {
      db.exec(`
        INSERT OR IGNORE INTO animal_sharing (id, animal_id, role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields)
        SELECT id, animal_id, 'guest', share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields
        FROM animal_sharing
        WHERE role = 'readonly'
      `)
      db.exec("DELETE FROM animal_sharing WHERE role = 'readonly'")
    } catch { /* table may not exist yet */ }
  }
  try {
    db.exec(`
      UPDATE documents
      SET allowed_roles = REPLACE(allowed_roles, '"readonly"', '"guest"')
      WHERE allowed_roles IS NOT NULL
    `)
  } catch { /* column may not exist yet */ }

  // Migrate animal_public_shares expires_at from TEXT to INTEGER (Unix timestamp)
  try {
    db.exec(`
      UPDATE animal_public_shares
      SET expires_at = CAST(strftime('%s', expires_at) AS INTEGER)
      WHERE typeof(expires_at) = 'text'
    `)
  } catch { /* table may not exist yet or already migrated */ }

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

  // Document pages table for multi-page scanning
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL REFERENCES documents(id),
        page_number INTEGER NOT NULL,
        image_path TEXT,
        ocr_text TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `)
  } catch { /* table already exists */ }

  // Cleanup expired tokens on startup
  const now = Math.floor(Date.now() / 1000)
  db.prepare('DELETE FROM jwt_blacklist WHERE expires_at < ?').run(now)

  return db
}
