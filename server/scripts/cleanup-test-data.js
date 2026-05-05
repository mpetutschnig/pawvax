import pg from 'pg'

const TEST_EMAIL_PATTERNS = [
  'test%@example.com',
  'journey%@test.com',
  'unique%@test.com',
  'reanalyzer_%@test.com',
  'doc-owner-%@example.com',
  'doc-foreign-%@example.com',
  'reg9-%@example.com',
  'reg9-admin-%@example.com',
  'reminder-test-%@example.com',
  'reminder-other-%@example.com',
  'reminder-other2-%@example.com',
  'ocr-lang-de-%@example.com',
  'ocr-lang-en-%@example.com',
  'ocr-reanalyze-%@example.com',
  'chip-create-%@example.com',
  'passport-db-%@example.com',
  'passport-retry-%@example.com'
]

const TEST_EMAIL_EXACT = [
  'dedup@example.com'
]

const ORPHAN_DEFINITIONS = [
  {
    key: 'animals',
    selectSql: `
      SELECT a.id, a.account_id AS reference
      FROM animals a
      LEFT JOIN accounts ac ON ac.id = a.account_id
      WHERE ac.id IS NULL
    `,
    deleteTable: 'animals',
    deleteColumn: 'id'
  },
  {
    key: 'documents',
    selectSql: `
      SELECT d.id, d.animal_id AS reference
      FROM documents d
      LEFT JOIN animals a ON a.id = d.animal_id
      WHERE a.id IS NULL
    `,
    deleteTable: 'documents',
    deleteColumn: 'id'
  },
  {
    key: 'animal_tags',
    selectSql: `
      SELECT t.tag_id AS id, t.animal_id AS reference
      FROM animal_tags t
      LEFT JOIN animals a ON a.id = t.animal_id
      WHERE a.id IS NULL
    `,
    deleteTable: 'animal_tags',
    deleteColumn: 'tag_id'
  },
  {
    key: 'document_pages',
    selectSql: `
      SELECT CAST(dp.id AS TEXT) AS id, dp.document_id AS reference
      FROM document_pages dp
      LEFT JOIN documents d ON d.id = dp.document_id
      WHERE d.id IS NULL
    `,
    deleteTable: 'document_pages',
    deleteColumn: 'id'
  },
  {
    key: 'animal_sharing',
    selectSql: `
      SELECT s.id, s.animal_id AS reference
      FROM animal_sharing s
      LEFT JOIN animals a ON a.id = s.animal_id
      WHERE a.id IS NULL
    `,
    deleteTable: 'animal_sharing',
    deleteColumn: 'id'
  },
  {
    key: 'animal_public_shares',
    selectSql: `
      SELECT s.id, s.animal_id AS reference
      FROM animal_public_shares s
      LEFT JOIN animals a ON a.id = s.animal_id
      WHERE a.id IS NULL
    `,
    deleteTable: 'animal_public_shares',
    deleteColumn: 'id'
  },
  {
    key: 'animal_transfers',
    selectSql: `
      SELECT t.code AS id, t.animal_id AS reference
      FROM animal_transfers t
      LEFT JOIN animals a ON a.id = t.animal_id
      WHERE a.id IS NULL
    `,
    deleteTable: 'animal_transfers',
    deleteColumn: 'code'
  },
  {
    key: 'organizations',
    selectSql: `
      SELECT o.id, o.owner_id AS reference
      FROM organizations o
      LEFT JOIN accounts a ON a.id = o.owner_id
      WHERE a.id IS NULL
    `,
    deleteTable: 'organizations',
    deleteColumn: 'id'
  },
  {
    key: 'org_memberships_missing_account',
    selectSql: `
      SELECT m.org_id || ':' || m.account_id AS id, m.account_id AS reference
      FROM org_memberships m
      LEFT JOIN accounts a ON a.id = m.account_id
      WHERE a.id IS NULL
    `,
    deleteTable: 'org_memberships',
    deleteWhereSql: 'account_id IN (%PLACEHOLDERS%)'
  },
  {
    key: 'org_memberships_missing_org',
    selectSql: `
      SELECT m.org_id || ':' || m.account_id AS id, m.org_id AS reference
      FROM org_memberships m
      LEFT JOIN organizations o ON o.id = m.org_id
      WHERE o.id IS NULL
    `,
    deleteTable: 'org_memberships',
    deleteWhereSql: 'org_id IN (%PLACEHOLDERS%)'
  },
  {
    key: 'medical_administrations_missing_animal',
    selectSql: `
      SELECT CAST(m.id AS TEXT) AS id, m.animal_id AS reference
      FROM medical_administrations m
      LEFT JOIN animals a ON a.id = m.animal_id
      WHERE a.id IS NULL
    `,
    deleteTable: 'medical_administrations',
    deleteColumn: 'id'
  },
  {
    key: 'medical_administrations_missing_document',
    selectSql: `
      SELECT CAST(m.id AS TEXT) AS id, m.document_id AS reference
      FROM medical_administrations m
      LEFT JOIN documents d ON d.id = m.document_id
      WHERE m.document_id IS NOT NULL AND d.id IS NULL
    `,
    deleteTable: 'medical_administrations',
    deleteColumn: 'id'
  }
]

function parseArgs(argv) {
  const connectionString = argv[2] || process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('Usage: node scripts/cleanup-test-data.js [connection-string]  (or set DATABASE_URL)')
  }

  return connectionString
}

async function deleteRows(client, definition, rows) {
  if (rows.length === 0) return 0

  const values = definition.deleteColumn
    ? rows.map((row) => row.id)
    : rows.map((row) => row.reference)

  const uniqueValues = [...new Set(values.filter((value) => value !== null && value !== undefined))]
  if (uniqueValues.length === 0) return 0

  const placeholders = uniqueValues.map((_, i) => '$' + (i + 1)).join(', ')
  const whereSql = definition.deleteWhereSql ?? `${definition.deleteColumn} IN (${placeholders})`
  const sql = `DELETE FROM ${definition.deleteTable} WHERE ${whereSql.replace('%PLACEHOLDERS%', placeholders)}`
  return (await client.query(sql, uniqueValues)).rowCount
}

async function cleanupOrphans(client) {
  const deleted = {}

  for (const definition of ORPHAN_DEFINITIONS) {
    let rows
    try {
      rows = (await client.query(definition.selectSql)).rows
    } catch {
      continue
    }
    const changes = await deleteRows(client, definition, rows)
    if (changes > 0) {
      deleted[definition.key] = changes
    }
  }

  return deleted
}

async function cleanupTestData(connectionString) {
  const client = new pg.Client({ connectionString })
  await client.connect()

  try {
    const likeClause = TEST_EMAIL_PATTERNS.map((_, i) => `email LIKE $${i + 1}`).join(' OR ')
    const exactClause = TEST_EMAIL_EXACT.map((_, i) => `email = $${TEST_EMAIL_PATTERNS.length + i + 1}`).join(' OR ')
    const whereClause = [likeClause, exactClause].filter(Boolean).join(' OR ')
    const params = [...TEST_EMAIL_PATTERNS, ...TEST_EMAIL_EXACT]

    await client.query('BEGIN')

    const accountRows = (await client.query(`SELECT id FROM accounts WHERE ${whereClause}`, params)).rows
    const accountIds = accountRows.map((row) => row.id)
    const deletedAccounts = accountIds.length > 0
      ? (await client.query('DELETE FROM accounts WHERE id = ANY($1::text[])', [accountIds])).rowCount
      : 0

    const deletedOrphans = await cleanupOrphans(client)

    await client.query('COMMIT')

    const summary = {
      deletedAccounts,
      deletedOrphans,
    }

    process.stdout.write(`${JSON.stringify(summary)}\n`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

cleanupTestData(parseArgs(process.argv)).catch(err => { console.error(err); process.exit(1) })