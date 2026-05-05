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

  // Clean up stale upload stubs
  try {
    await pool.query("DELETE FROM documents WHERE analysis_status = 'uploading'")
  } catch { /* column may not exist on very old schemas */ }

  return pool
}
