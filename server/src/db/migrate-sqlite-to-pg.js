#!/usr/bin/env node
/**
 * Migration script: SQLite → PostgreSQL
 * 
 * Usage:
 *   node src/db/migrate-sqlite-to-pg.js [sqlite-path] [pg-connection-string]
 * 
 * Example:
 *   node src/db/migrate-sqlite-to-pg.js ./data/paw.db postgresql://pawvax:pawvax@localhost:5432/pawvax
 */

import Database from 'better-sqlite3'
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SQLITE_PATH = process.argv[2] || process.env.DB_PATH || './data/paw.db'
const PG_URL = process.argv[3] || process.env.DATABASE_URL || 'postgresql://pawvax:pawvax@localhost:5432/pawvax'

// Tables in dependency order (parents before children)
const TABLES = [
  'accounts',
  'animals',
  'animal_tags',
  'documents',
  'document_pages',
  'analysis_history',
  'audit_log',
  'animal_sharing',
  'animal_public_shares',
  'jwt_blacklist',
  'settings',
  'organizations',
  'org_memberships',
  'verification_requests',
  'reminders',
  'animal_scans',
  'animal_transfers',
  'api_keys',
  'medical_administrations',
  'test_results',
]

async function migrate() {
  console.log(`Migrating from SQLite: ${SQLITE_PATH}`)
  console.log(`           to Postgres: ${PG_URL.replace(/:[^:@]*@/, ':***@')}`)

  const sqlite = new Database(SQLITE_PATH, { readonly: true })
  const pool = new pg.Pool({ connectionString: PG_URL })

  try {
    // 1. Create schema in PostgreSQL
    console.log('\n--- Creating PostgreSQL schema ---')
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8')
    await pool.query(schema)
    console.log('Schema created.')

    // 2. Migrate each table
    for (const table of TABLES) {
      // Check if table exists in SQLite
      const tableExists = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(table)

      if (!tableExists) {
        console.log(`  [SKIP] ${table} — not in SQLite`)
        continue
      }

      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all()
      if (rows.length === 0) {
        console.log(`  [SKIP] ${table} — 0 rows`)
        continue
      }

      const columns = Object.keys(rows[0])
      // Skip 'id' column for tables with SERIAL PRIMARY KEY
      const serialTables = ['document_pages']
      const insertCols = serialTables.includes(table)
        ? columns.filter(c => c !== 'id')
        : columns

      const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(', ')
      const insertSQL = `INSERT INTO ${table} (${insertCols.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        let inserted = 0
        for (const row of rows) {
          const values = insertCols.map(col => row[col])
          const result = await client.query(insertSQL, values)
          inserted += result.rowCount
        }
        await client.query('COMMIT')
        console.log(`  [OK]   ${table} — ${inserted}/${rows.length} rows`)
      } catch (err) {
        await client.query('ROLLBACK')
        console.error(`  [FAIL] ${table} — ${err.message}`)
      } finally {
        client.release()
      }
    }

    console.log('\n--- Migration complete ---')
  } finally {
    sqlite.close()
    await pool.end()
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
