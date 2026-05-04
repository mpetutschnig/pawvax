import { v4 as uuid } from 'uuid'
import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'
import { generateApiKey } from '../utils/apikey.js'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEST_RESULTS_FILE = join(__dirname, '..', '..', 'data', 'test-results.json')

const ORPHAN_DEFINITIONS = [
  {
    key: 'animals',
    label: 'Orphaned animals',
    selectSql: `
      SELECT a.id, a.name AS title, a.account_id AS reference, a.created_at
      FROM animals a
      LEFT JOIN accounts ac ON ac.id = a.account_id
      WHERE ac.id IS NULL
      ORDER BY a.created_at DESC
    `,
    deleteTable: 'animals',
    deleteColumn: 'id'
  },
  {
    key: 'documents',
    label: 'Orphaned documents',
    selectSql: `
      SELECT d.id,
             COALESCE(json_extract(d.extracted_json, '$.title'), d.doc_type, d.image_path) AS title,
             d.animal_id AS reference,
             d.created_at
      FROM documents d
      LEFT JOIN animals a ON a.id = d.animal_id
      WHERE a.id IS NULL
      ORDER BY d.created_at DESC
    `,
    deleteTable: 'documents',
    deleteColumn: 'id'
  },
  {
    key: 'animal_tags',
    label: 'Orphaned tags',
    selectSql: `
      SELECT t.tag_id AS id, t.tag_id AS title, t.animal_id AS reference, t.added_at AS created_at
      FROM animal_tags t
      LEFT JOIN animals a ON a.id = t.animal_id
      WHERE a.id IS NULL
      ORDER BY t.added_at DESC
    `,
    deleteTable: 'animal_tags',
    deleteColumn: 'tag_id'
  },
  {
    key: 'document_pages',
    label: 'Orphaned document pages',
    selectSql: `
      SELECT CAST(dp.id AS TEXT) AS id,
             'Page ' || dp.page_number AS title,
             dp.document_id AS reference,
             NULL AS created_at
      FROM document_pages dp
      LEFT JOIN documents d ON d.id = dp.document_id
      WHERE d.id IS NULL
      ORDER BY dp.id DESC
    `,
    deleteTable: 'document_pages',
    deleteColumn: 'id'
  },
  {
    key: 'animal_sharing',
    label: 'Orphaned animal sharing rows',
    selectSql: `
      SELECT s.id, s.role AS title, s.animal_id AS reference, NULL AS created_at
      FROM animal_sharing s
      LEFT JOIN animals a ON a.id = s.animal_id
      WHERE a.id IS NULL
      ORDER BY s.id DESC
    `,
    deleteTable: 'animal_sharing',
    deleteColumn: 'id'
  },
  {
    key: 'animal_public_shares',
    label: 'Orphaned public shares',
    selectSql: `
      SELECT s.id, COALESCE(s.link_name, s.id) AS title, s.animal_id AS reference, s.created_at
      FROM animal_public_shares s
      LEFT JOIN animals a ON a.id = s.animal_id
      WHERE a.id IS NULL
      ORDER BY s.created_at DESC
    `,
    deleteTable: 'animal_public_shares',
    deleteColumn: 'id'
  },
  {
    key: 'animal_transfers',
    label: 'Orphaned transfer codes',
    selectSql: `
      SELECT t.code AS id, t.code AS title, t.animal_id AS reference, t.created_at
      FROM animal_transfers t
      LEFT JOIN animals a ON a.id = t.animal_id
      WHERE a.id IS NULL
      ORDER BY t.created_at DESC
    `,
    deleteTable: 'animal_transfers',
    deleteColumn: 'code'
  },
  {
    key: 'organizations',
    label: 'Organizations without owner',
    selectSql: `
      SELECT o.id, o.name AS title, o.owner_id AS reference, o.created_at
      FROM organizations o
      LEFT JOIN accounts a ON a.id = o.owner_id
      WHERE a.id IS NULL
      ORDER BY o.created_at DESC
    `,
    deleteTable: 'organizations',
    deleteColumn: 'id'
  },
  {
    key: 'org_memberships_missing_account',
    label: 'Organization memberships without account',
    selectSql: `
      SELECT m.org_id || ':' || m.account_id AS id,
             m.role AS title,
             m.account_id AS reference,
             m.created_at
      FROM org_memberships m
      LEFT JOIN accounts a ON a.id = m.account_id
      WHERE a.id IS NULL
      ORDER BY m.created_at DESC
    `,
    deleteTable: 'org_memberships',
    deleteWhereSql: 'account_id IN (%PLACEHOLDERS%)'
  },
  {
    key: 'org_memberships_missing_org',
    label: 'Organization memberships without organization',
    selectSql: `
      SELECT m.org_id || ':' || m.account_id AS id,
             m.role AS title,
             m.org_id AS reference,
             m.created_at
      FROM org_memberships m
      LEFT JOIN organizations o ON o.id = m.org_id
      WHERE o.id IS NULL
      ORDER BY m.created_at DESC
    `,
    deleteTable: 'org_memberships',
    deleteWhereSql: 'org_id IN (%PLACEHOLDERS%)'
  },
  {
    key: 'medical_administrations_missing_animal',
    label: 'Medical entries without animal',
    selectSql: `
      SELECT m.id, m.substance AS title, m.animal_id AS reference, m.created_at
      FROM medical_administrations m
      LEFT JOIN animals a ON a.id = m.animal_id
      WHERE a.id IS NULL
      ORDER BY m.created_at DESC
    `,
    deleteTable: 'medical_administrations',
    deleteColumn: 'id'
  },
  {
    key: 'medical_administrations_missing_document',
    label: 'Medical entries without document',
    selectSql: `
      SELECT m.id, m.substance AS title, m.document_id AS reference, m.created_at
      FROM medical_administrations m
      LEFT JOIN documents d ON d.id = m.document_id
      WHERE m.document_id IS NOT NULL AND d.id IS NULL
      ORDER BY m.created_at DESC
    `,
    deleteTable: 'medical_administrations',
    deleteColumn: 'id'
  }
]

function listOrphanCategories(db) {
  return ORPHAN_DEFINITIONS.map((definition) => {
    const items = db.prepare(definition.selectSql).all()
    return {
      key: definition.key,
      label: definition.label,
      count: items.length,
      items,
    }
  }).filter(category => category.count > 0)
}

function deleteOrphanCategory(db, definition, rows) {
  if (rows.length === 0) return 0

  const values = definition.deleteColumn
    ? rows.map(row => row.id)
    : rows.map(row => row.reference)

  const uniqueValues = [...new Set(values.filter(value => value !== null && value !== undefined))]
  if (uniqueValues.length === 0) return 0

  const placeholders = uniqueValues.map(() => '?').join(', ')
  const whereSql = definition.deleteWhereSql ?? `${definition.deleteColumn} IN (${placeholders})`
  const sql = `DELETE FROM ${definition.deleteTable} WHERE ${whereSql.replace('%PLACEHOLDERS%', placeholders)}`
  const result = db.prepare(sql).run(...uniqueValues)
  return result.changes
}

export default async function adminRoutes(fastify) {
  // alle Admin-Routen erfordern JWT + Admin-Rolle
  fastify.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify() } catch { return reply.code(401).send({ error: 'Nicht autorisiert' }) }
    const userRoles = req.user.roles ?? [req.user.role]
    if (!userRoles.includes('admin')) return reply.code(403).send({ error: 'Admin-Zugriff erforderlich' })
  })

  // Alle Accounts
  fastify.get('/api/admin/accounts', async (req) => {
    const db = getDb()
    return db.prepare(`
      SELECT id, name, email, role, verified, verification_status, created_at
      FROM accounts
      ORDER BY created_at DESC
    `).all()
  })

  // Accounts mit pending-Verifikation
  fastify.get('/api/admin/accounts/pending-verification', async (req) => {
    const db = getDb()
    return db.prepare(`
      SELECT id, name, email, role, verification_status, created_at
      FROM accounts
      WHERE verification_status = 'pending'
      ORDER BY created_at DESC
    `).all()
  })

  // Account-Rolle ändern
  fastify.patch('/api/admin/accounts/:id', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { role, verified } = req.body
    const { accountId, role: adminRole } = req.user

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id)
    if (!account) return reply.code(404).send({ error: 'Account nicht gefunden' })

    // Prevent admin from demoting their own admin role
    if (id === accountId && role && account.role === 'admin' && role !== 'admin') {
      return reply.code(403).send({ error: 'Cannot demote your own admin role' })
    }

    if (role) {
      db.prepare('UPDATE accounts SET role = ? WHERE id = ?').run(role, id)
    }
    if (verified !== undefined) {
      db.prepare('UPDATE accounts SET verified = ? WHERE id = ?').run(verified ? 1 : 0, id)
    }

    logAudit(db, {
      accountId, role: adminRole, action: 'admin_update_account',
      resource: 'account', resourceId: id,
      details: { role, verified },
      ip: req.ip
    })

    return db.prepare('SELECT id, name, email, role, verified FROM accounts WHERE id = ?').get(id)
  })

  // Verifikation genehmigen/ablehnen
  fastify.post('/api/admin/accounts/:id/verify', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { approved, note } = req.body
    const { accountId, role: adminRole } = req.user

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id)
    if (!account) return reply.code(404).send({ error: 'Account nicht gefunden' })

    const status = approved ? 'approved' : 'rejected'
    db.prepare(`UPDATE accounts SET verification_status = ?, verified = ?, verification_note = ? WHERE id = ?`)
      .run(status, approved ? 1 : 0, note ?? null, id)

    logAudit(db, {
      accountId, role: adminRole, action: `verify_${status}`,
      resource: 'account', resourceId: id,
      details: { note },
      ip: req.ip
    })

    return db.prepare('SELECT id, name, email, role, verified, verification_status FROM accounts WHERE id = ?').get(id)
  })

  // Audit-Log (paginiert) with account details
  fastify.get('/api/admin/audit', async (req) => {
    const db = getDb()
    const page = parseInt(req.query.page) || 1
    const limit = Math.min(parseInt(req.query.limit) || 50, 500)
    const offset = (page - 1) * limit

    const resource = req.query.resource
    const accountId = req.query.accountId

    let sql = `
      SELECT
        al.*,
        a.email as account_email,
        a.name as account_name
      FROM audit_log al
      LEFT JOIN accounts a ON a.id = al.account_id
      WHERE 1=1
    `
    const params = []

    if (resource) {
      sql += ' AND al.resource = ?'
      params.push(resource)
    }
    if (accountId) {
      sql += ' AND al.account_id = ?'
      params.push(accountId)
    }

    sql += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const rows = db.prepare(sql).all(...params)
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM audit_log WHERE 1=1${resource ? ' AND resource = ?' : ''}${accountId ? ' AND account_id = ?' : ''}`).get(...params.slice(0, -2))

    return {
      rows,
      page,
      limit,
      total: total.cnt,
      pages: Math.ceil(total.cnt / limit)
    }
  })

  // Alle Tiere (Admin-Übersicht)
  fastify.get('/api/admin/animals', async (req) => {
    const db = getDb()
    return db.prepare(`
      SELECT a.*, ac.name AS owner_name, ac.email AS owner_email
      FROM animals a
      JOIN accounts ac ON ac.id = a.account_id
      ORDER BY a.created_at DESC
    `).all()
  })

  // Statistiken
  fastify.get('/api/admin/stats', async (req) => {
    const db = getDb()
    const accounts = db.prepare('SELECT COUNT(*) as cnt FROM accounts').get().cnt
    const animals = db.prepare('SELECT COUNT(*) as cnt FROM animals').get().cnt
    const animals_active = db.prepare('SELECT COUNT(*) as cnt FROM animals WHERE is_archived = 0').get().cnt
    const animals_archived = db.prepare('SELECT COUNT(*) as cnt FROM animals WHERE is_archived = 1').get().cnt
    const animals_with_docs = db.prepare(`
      SELECT COUNT(DISTINCT a.id) as cnt FROM animals a
      JOIN documents d ON d.animal_id = a.id
    `).get().cnt
    const documents = db.prepare('SELECT COUNT(*) as cnt FROM documents').get().cnt
    const auditEntries = db.prepare('SELECT COUNT(*) as cnt FROM audit_log').get().cnt
    const pendingVerifications = db.prepare("SELECT COUNT(*) as cnt FROM accounts WHERE verification_status = 'pending'").get().cnt

    return {
      accounts,
      animals: { total: animals, active: animals_active, archived: animals_archived, with_documents: animals_with_docs },
      documents,
      auditEntries,
      pendingVerifications
    }
  })

  // Test Results
  fastify.get('/api/admin/test-results', async (req) => {
    if (existsSync(TEST_RESULTS_FILE)) {
      try {
        const data = JSON.parse(readFileSync(TEST_RESULTS_FILE, 'utf-8'))
        return data
      } catch {
        return { summary: null, tests: null }
      }
    }
    // Fallback: legacy DB-based storage
    const db = getDb()
    const summary = db.prepare("SELECT value FROM settings WHERE key = 'last_test_run'").get()
    const details = db.prepare("SELECT value FROM settings WHERE key = 'last_test_run_details'").get()
    return {
      summary: summary ? JSON.parse(summary.value) : null,
      tests: details ? JSON.parse(details.value) : null
    }
  })

  fastify.get('/api/admin/orphans', async () => {
    const db = getDb()
    const categories = listOrphanCategories(db)
    return {
      total: categories.reduce((sum, category) => sum + category.count, 0),
      categories,
    }
  })

  fastify.post('/api/admin/orphans/delete', async (req, reply) => {
    const db = getDb()
    const { accountId, role } = req.user
    const requestedCategories = Array.isArray(req.body?.categories) ? req.body.categories : []

    if (requestedCategories.length === 0) {
      return reply.code(400).send({ error: 'categories must contain at least one orphan category key' })
    }

    const definitions = ORPHAN_DEFINITIONS.filter(definition => requestedCategories.includes(definition.key))
    if (definitions.length === 0) {
      return reply.code(400).send({ error: 'No valid orphan categories selected' })
    }

    const deleted = {}
    const removeOrphans = db.transaction(() => {
      for (const definition of definitions) {
        const rows = db.prepare(definition.selectSql).all()
        deleted[definition.key] = deleteOrphanCategory(db, definition, rows)
      }
    })

    removeOrphans()

    logAudit(db, {
      accountId,
      role,
      action: 'bulk_delete_orphans',
      resource: 'maintenance',
      resourceId: requestedCategories.join(','),
      details: deleted,
      ip: req.ip
    })

    const categories = listOrphanCategories(db)
    return {
      deleted,
      totalDeleted: Object.values(deleted).reduce((sum, value) => sum + value, 0),
      report: {
        total: categories.reduce((sum, category) => sum + category.count, 0),
        categories,
      }
    }
  })

  // DELETE account
  fastify.delete('/api/admin/accounts/:id', async (req, reply) => {
    const db = getDb()
    const targetId = req.params.id
    const { accountId, role } = req.user

    const target = db.prepare('SELECT role FROM accounts WHERE id = ?').get(targetId)
    if (!target) return reply.code(404).send({ error: 'Account nicht gefunden' })

    if (target.role === 'admin') {
      const otherAdmins = db.prepare("SELECT COUNT(*) as c FROM accounts WHERE role='admin' AND id != ?").get(targetId).c
      if (otherAdmins === 0) {
        return reply.code(403).send({ error: 'Kann letzten Admin nicht löschen' })
      }
    }

    db.prepare('DELETE FROM org_memberships WHERE account_id = ? OR invited_by = ?').run(targetId, targetId)
    db.prepare('DELETE FROM organizations WHERE owner_id = ?').run(targetId)
    db.prepare('DELETE FROM animals WHERE account_id = ?').run(targetId)
    db.prepare('DELETE FROM animal_tags WHERE animal_id NOT IN (SELECT id FROM animals)').run()
    db.prepare('DELETE FROM documents WHERE animal_id NOT IN (SELECT id FROM animals)').run()
    db.prepare('UPDATE documents SET added_by_account = NULL WHERE added_by_account = ?').run(targetId)
    db.prepare('DELETE FROM audit_log WHERE account_id = ?').run(targetId)
    db.prepare('DELETE FROM accounts WHERE id = ?').run(targetId)

    logAudit(db, { accountId, role, action: 'delete_account', resource: 'account', resourceId: targetId, ip: req.ip })
    return reply.code(204).send()
  })

  // DELETE animal
  fastify.delete('/api/admin/animals/:id', async (req, reply) => {
    const db = getDb()
    const animalId = req.params.id
    const { accountId, role } = req.user

    const animal = db.prepare('SELECT id FROM animals WHERE id = ?').get(animalId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    db.prepare('DELETE FROM animal_tags WHERE animal_id = ?').run(animalId)
    db.prepare('DELETE FROM documents WHERE animal_id = ?').run(animalId)
    db.prepare('DELETE FROM animals WHERE id = ?').run(animalId)

    logAudit(db, { accountId, role, action: 'delete_animal', resource: 'animal', resourceId: animalId, ip: req.ip })
    return reply.code(204).send()
  })

  // DELETE document
  fastify.delete('/api/admin/documents/:id', async (req, reply) => {
    const db = getDb()
    const docId = req.params.id
    const { accountId, role } = req.user

    const doc = db.prepare('SELECT id FROM documents WHERE id = ?').get(docId)
    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })

    db.prepare('DELETE FROM document_pages WHERE document_id = ?').run(docId)
    db.prepare('DELETE FROM documents WHERE id = ?').run(docId)

    logAudit(db, { accountId, role, action: 'delete_document', resource: 'document', resourceId: docId, ip: req.ip })
    return reply.code(204).send()
  })

  // DELETE tag (animal_tags)
  fastify.delete('/api/admin/tags/:tagId', async (req, reply) => {
    const db = getDb()
    const tagId = req.params.tagId
    const { accountId, role } = req.user

    const tag = db.prepare('SELECT tag_id FROM animal_tags WHERE tag_id = ?').get(tagId)
    if (!tag) return reply.code(404).send({ error: 'Tag nicht gefunden' })

    db.prepare('DELETE FROM animal_tags WHERE tag_id = ?').run(tagId)

    logAudit(db, { accountId, role, action: 'delete_tag', resource: 'tag', resourceId: tagId, ip: req.ip })
    return reply.code(204).send()
  })

  // ──────────────────────────────────────────────────────────
  // API Key Management (VET-API)
  // ──────────────────────────────────────────────────────────

  // Generate new API key for a verified vet account
  fastify.post('/api/admin/api-keys', async (req, reply) => {
    const db = getDb()
    const { account_id, name } = req.body
    const { accountId, role } = req.user

    if (!account_id || !name) {
      return reply.code(400).send({ error: 'account_id and name are required' })
    }

    // Verify the target account is a verified vet
    const target = db.prepare('SELECT id, role, verified, name AS account_name FROM accounts WHERE id = ?').get(account_id)
    if (!target) return reply.code(404).send({ error: 'Account not found' })
    if (!target.verified || !target.role.includes('vet')) {
      return reply.code(400).send({ error: 'Target account must be a verified veterinarian' })
    }

    const { raw, hash, prefix } = generateApiKey()
    const keyId = uuid()

    db.prepare(`
      INSERT INTO api_keys (id, key_hash, key_prefix, account_id, name)
      VALUES (?, ?, ?, ?, ?)
    `).run(keyId, hash, prefix, account_id, name)

    logAudit(db, {
      accountId, role, action: 'create_api_key',
      resource: 'api_key', resourceId: keyId,
      details: { target_account: account_id, key_name: name },
      ip: req.ip
    })

    // Return raw key ONCE — it cannot be retrieved again
    return reply.code(201).send({
      id: keyId,
      key: raw,
      prefix,
      name,
      account_id,
      account_name: target.account_name,
      message: 'Store this key securely. It will not be shown again.'
    })
  })

  // List all API keys (without hashes)
  fastify.get('/api/admin/api-keys', async (req) => {
    const db = getDb()
    return db.prepare(`
      SELECT k.id, k.key_prefix, k.account_id, k.name, k.permissions, k.rate_limit, k.active, k.last_used_at, k.created_at,
             a.name AS account_name, a.email AS account_email
      FROM api_keys k
      JOIN accounts a ON a.id = k.account_id
      ORDER BY k.created_at DESC
    `).all()
  })

  // Deactivate an API key
  fastify.delete('/api/admin/api-keys/:id', async (req, reply) => {
    const db = getDb()
    const keyId = req.params.id
    const { accountId, role } = req.user

    const key = db.prepare('SELECT id, name FROM api_keys WHERE id = ?').get(keyId)
    if (!key) return reply.code(404).send({ error: 'API key not found' })

    db.prepare('UPDATE api_keys SET active = 0 WHERE id = ?').run(keyId)

    logAudit(db, {
      accountId, role, action: 'deactivate_api_key',
      resource: 'api_key', resourceId: keyId,
      details: { key_name: key.name },
      ip: req.ip
    })

    return reply.code(200).send({ success: true, message: 'API key deactivated' })
  })
}
