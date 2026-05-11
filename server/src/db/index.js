import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

let pool

// Generate human-readable unique ID: 8-char alphanumeric (uppercase + digits)
function generateUniqueId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let id = ''
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

/**
 * Returns the pg Pool instance.
 * Route files call getDb() to get the pool, then use pool.query() directly.
 */
export function getDb() {
  return pool
}

/**
 * Initialize the PostgreSQL connection pool, run schema, and perform migrations.
 * @param {string} connectionString - PostgreSQL connection URL
 */
export async function initDb(connectionString) {
  pool = new pg.Pool({ connectionString })

  // Verify connection
  const client = await pool.connect()
  try {
    await client.query('SELECT 1')
  } finally {
    client.release()
  }

  // Run schema
  const schema = readFileSync(join(__dir, 'schema.sql'), 'utf8')
  await pool.query(schema)

  // Run Tenant & Governance Migration
  try {
    const tenantMigration = readFileSync(join(__dir, 'tenant_migration.sql'), 'utf8')
    await pool.query(tenantMigration)
  } catch (err) {
    console.error('Tenant migration failed, but continuing...', err)
  }

  // Backfill unique_id for existing animals
  try {
    const { rows: animalsWithoutId } = await pool.query('SELECT id FROM animals WHERE unique_id IS NULL')
    for (const animal of animalsWithoutId) {
      let uniqueId = generateUniqueId()
      let attempts = 0
      while (attempts < 10) {
        try {
          await pool.query('UPDATE animals SET unique_id = $1 WHERE id = $2', [uniqueId, animal.id])
          break
        } catch (err) {
          if (err.code === '23505') { // unique_violation
            uniqueId = generateUniqueId()
            attempts++
          } else {
            throw err
          }
        }
      }
    }
  } catch { /* table or column may not exist yet */ }

  // Ensure every animal has a public sharing row for guest role
  try {
    await pool.query(`
      INSERT INTO animal_sharing (id, animal_id, role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields)
      SELECT gen_random_uuid()::text, a.id, 'guest', 0, 1, 1, 0, 0
      FROM animals a
      WHERE NOT EXISTS (
        SELECT 1 FROM animal_sharing s WHERE s.animal_id = a.id AND s.role = 'guest'
      )
      ON CONFLICT DO NOTHING
    `)
  } catch { /* table may not exist yet */ }

  // Cleanup expired tokens on startup
  const now = Math.floor(Date.now() / 1000)
  await pool.query('DELETE FROM jwt_blacklist WHERE expires_at < $1', [now])
  await pool.query('DELETE FROM email_verification_tokens WHERE expires_at < $1 OR consumed_at IS NOT NULL', [now]).catch(() => {})
  await pool.query('DELETE FROM password_reset_tokens WHERE expires_at < $1 OR consumed_at IS NOT NULL', [now]).catch(() => {})

  // Clean up stale upload stubs
  try {
    await pool.query("DELETE FROM documents WHERE analysis_status = 'uploading'")
  } catch { /* column may not exist on very old schemas */ }

  // Migration: add record_permissions column (idempotent)
  try {
    await pool.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS record_permissions TEXT DEFAULT NULL")
  } catch { /* column may already exist */ }

  // Migration: add share_image_with_guest column (idempotent)
  try {
    await pool.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS share_image_with_guest INTEGER NOT NULL DEFAULT 0")
  } catch { /* column may already exist */ }

  // Migration: email verification support for new accounts without breaking legacy users.
  try {
    await pool.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email_verified INTEGER NOT NULL DEFAULT 0")
    await pool.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email_verification_required INTEGER NOT NULL DEFAULT 0")
    await pool.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email_verified_at TEXT")
    await pool.query(`
      UPDATE accounts
      SET email_verified = 1,
          email_verified_at = COALESCE(email_verified_at, created_at)
      WHERE email_verification_required = 0 AND email_verified = 0
    `)
  } catch { /* columns may already exist */ }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::INTEGER)
      )
    `)
    await pool.query('CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_account ON email_verification_tokens(account_id)')
    await pool.query('CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires ON email_verification_tokens(expires_at)')
  } catch { /* table may already exist */ }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::INTEGER)
      )
    `)
    await pool.query('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_account ON password_reset_tokens(account_id)')
    await pool.query('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at)')
  } catch { /* table may already exist */ }

  // Migration: Consolidate comma-separated roles to single exclusive role
  // Priority: admin > veterinarian > authority > user
  try {
    const { rows: accountsWithCommaRoles } = await pool.query("SELECT id, role FROM accounts WHERE role LIKE '%,%'")
    for (const account of accountsWithCommaRoles) {
      const roles = account.role.split(',').map(r => r.trim()).filter(r => r)
      const uniqueRoles = [...new Set(roles)]
      const roleMap = { admin: 4, veterinarian: 3, authority: 2, user: 1 }
      const newRole = uniqueRoles.sort((a, b) => (roleMap[b] || 0) - (roleMap[a] || 0))[0] || 'user'
      await pool.query('UPDATE accounts SET role = $1 WHERE id = $2', [newRole, account.id])
    }
  } catch { /* table or column may not exist, or no accounts need migration */ }

  // Migration: normalize 'veterinarian' → 'vet' (approval route used wrong string)
  try {
    await pool.query("UPDATE accounts SET role = 'vet' WHERE role = 'veterinarian'")
  } catch { /* ignore */ }

  // Migration: add allowed_role column to animal_public_shares (per-link permissions)
  try {
    await pool.query("ALTER TABLE animal_public_shares ADD COLUMN IF NOT EXISTS allowed_role TEXT NOT NULL DEFAULT 'guest'")
  } catch { /* column may already exist */ }

  // OAuth accounts table for social login
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_accounts (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        email TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(provider, provider_user_id)
      )
    `)
    await pool.query('CREATE INDEX IF NOT EXISTS idx_oauth_accounts_account ON oauth_accounts(account_id)')
  } catch { /* table may already exist */ }

  try {
    await pool.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS pending_email TEXT")
  } catch { /* already exists */ }

  // Migration: AI fallback control + billing budget in euros
  try { await pool.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS system_fallback_enabled INTEGER DEFAULT 1") } catch { /* already exists */ }
  try { await pool.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS billing_budget_eur REAL DEFAULT NULL") } catch { /* already exists */ }

  // Migration: vet raw image sharing for unanalyzed documents
  try { await pool.query("ALTER TABLE animal_sharing ADD COLUMN IF NOT EXISTS share_raw_images INTEGER DEFAULT 0") } catch { /* already exists */ }

  // Migration: update doc_type check constraint to include vet_report
  try {
    // Drop existing constraint if it matches the default naming convention
    await pool.query("ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_doc_type_check")
    await pool.query("ALTER TABLE documents ADD CONSTRAINT documents_doc_type_check CHECK (doc_type IN ('vaccination', 'pedigree', 'dog_certificate', 'medical_product', 'treatment', 'pet_passport', 'general', 'vet_report'))")
  } catch { /* ignore if fails (e.g. named differently) */ }

  return pool
}
