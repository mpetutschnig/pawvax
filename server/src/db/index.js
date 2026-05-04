import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

let db

// Generate human-readable unique ID: 8-char alphanumeric (uppercase + digits)
function generateUniqueId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let id = ''
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

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
    `ALTER TABLE accounts ADD COLUMN gemini_model TEXT DEFAULT 'gemini-2.0-flash'`,
    `ALTER TABLE accounts ADD COLUMN anthropic_token TEXT`,
    `ALTER TABLE accounts ADD COLUMN claude_model TEXT DEFAULT 'claude-3-5-sonnet-20241022'`,
    `ALTER TABLE accounts ADD COLUMN openai_token TEXT`,
    `ALTER TABLE accounts ADD COLUMN openai_model TEXT DEFAULT 'gpt-4.1-mini'`,
    `ALTER TABLE accounts ADD COLUMN ai_provider_priority TEXT DEFAULT '["google", "anthropic", "openai"]'`,
    `ALTER TABLE animals ADD COLUMN unique_id TEXT UNIQUE`,
    `ALTER TABLE animal_public_shares ADD COLUMN link_name TEXT`,
    `ALTER TABLE animals ADD COLUMN archive_reason TEXT CHECK(archive_reason IN ('verstorben', 'verloren', 'verkauft', 'abgegeben', 'sonstiges'))`,
    `ALTER TABLE animals ADD COLUMN archived_at TEXT`,
  ]
  for (const sql of migrations) {
    try { db.exec(sql) } catch { /* column already exists */ }
  }

  try {
    const documentsTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'documents'").get()?.sql || ''
    const needsDocumentTypeMigration = !!documentsTableSql && (
      documentsTableSql.includes("CHECK(doc_type IN ('vaccination', 'medication', 'other'))") ||
      !documentsTableSql.includes("'treatment'") ||
      !documentsTableSql.includes("'pet_passport'")
    )

    if (needsDocumentTypeMigration) {
      db.exec(`
        BEGIN;
        CREATE TABLE documents_new (
          id               TEXT PRIMARY KEY,
          animal_id        TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
          doc_type         TEXT NOT NULL DEFAULT 'general' CHECK(doc_type IN ('vaccination', 'pedigree', 'dog_certificate', 'medical_product', 'treatment', 'pet_passport', 'general')),
          image_path       TEXT NOT NULL,
          extracted_json   TEXT NOT NULL,
          ocr_provider     TEXT,
          added_by_role    TEXT,
          added_by_account TEXT,
          allowed_roles    TEXT,
          created_at       TEXT DEFAULT (datetime('now')),
          analysis_status  TEXT DEFAULT 'pending_analysis'
        );

        INSERT INTO documents_new (id, animal_id, doc_type, image_path, extracted_json, ocr_provider, added_by_role, added_by_account, allowed_roles, created_at, analysis_status)
        SELECT
          id,
          animal_id,
          CASE
            WHEN doc_type = 'vaccination' THEN 'vaccination'
            WHEN doc_type = 'treatment' THEN 'treatment'
            WHEN doc_type = 'pet_passport' THEN 'pet_passport'
            WHEN doc_type = 'medication' THEN 'medical_product'
            ELSE 'general'
          END,
          image_path,
          extracted_json,
          ocr_provider,
          added_by_role,
          added_by_account,
          allowed_roles,
          created_at,
          COALESCE(analysis_status, 'pending_analysis')
        FROM documents;

        DROP TABLE documents;
        ALTER TABLE documents_new RENAME TO documents;
        CREATE INDEX IF NOT EXISTS idx_documents_animal ON documents(animal_id);
        COMMIT;
      `)
    }
  } catch {
    /* documents table may not exist yet */
  }

  try {
    const animalTagsTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'animal_tags'").get()?.sql || ''
    const needsAnimalTagMigration = !!animalTagsTableSql && !animalTagsTableSql.includes("'chip'")

    if (needsAnimalTagMigration) {
      db.exec(`
        BEGIN;
        CREATE TABLE animal_tags_new (
          tag_id    TEXT PRIMARY KEY,
          animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
          tag_type  TEXT NOT NULL CHECK(tag_type IN ('barcode', 'nfc', 'chip')),
          active    INTEGER NOT NULL DEFAULT 1,
          added_at  TEXT DEFAULT (datetime('now'))
        );

        INSERT INTO animal_tags_new (tag_id, animal_id, tag_type, active, added_at)
        SELECT
          tag_id,
          animal_id,
          CASE
            WHEN tag_type IN ('barcode', 'nfc', 'chip') THEN tag_type
            WHEN tag_type = 'microchip' THEN 'chip'
            ELSE 'barcode'
          END,
          active,
          added_at
        FROM animal_tags;

        DROP TABLE animal_tags;
        ALTER TABLE animal_tags_new RENAME TO animal_tags;
        CREATE INDEX IF NOT EXISTS idx_tags_animal ON animal_tags(animal_id);
        CREATE INDEX IF NOT EXISTS idx_tags_active ON animal_tags(tag_id, active);
        COMMIT;
      `)
    }
  } catch {
    /* animal_tags table may not exist yet */
  }

  // Backfill unique_id for existing animals
  try {
    const animalsWithoutId = db.prepare('SELECT id FROM animals WHERE unique_id IS NULL').all()
    for (const animal of animalsWithoutId) {
      let uniqueId = generateUniqueId()
      // Retry if collision (extremely unlikely, but be safe)
      let attempts = 0
      while (attempts < 10) {
        try {
          db.prepare('UPDATE animals SET unique_id = ? WHERE id = ?').run(uniqueId, animal.id)
          break
        } catch (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            uniqueId = generateUniqueId()
            attempts++
          } else {
            throw err
          }
        }
      }
    }
  } catch { /* table or column may not exist yet */ }

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

  // Backfill link_name for legacy shares
  try {
    db.exec(`
      UPDATE animal_public_shares
      SET link_name = 'Legacy-' || substr(id, 1, 8)
      WHERE link_name IS NULL OR trim(link_name) = ''
    `)
  } catch { /* table or column may not exist yet */ }

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
