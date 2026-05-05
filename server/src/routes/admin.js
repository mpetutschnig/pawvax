import { v4 as uuid } from 'uuid'
import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'
import { generateApiKey } from '../utils/apikey.js'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEST_RESULTS_FILE = join(__dirname, '..', '..', 'data', 'test-results.json')

function normalizeStoredTestPayload(rawSummary, rawDetails) {
  const parsedSummary = rawSummary ? JSON.parse(rawSummary) : null
  const parsedDetails = rawDetails ? JSON.parse(rawDetails) : null

  return {
    summary: parsedSummary ?? parsedDetails?.summary ?? null,
    tests: parsedDetails?.tests?.testResults || parsedDetails?.tests?.assertionResults
      ? parsedDetails.tests
      : (parsedDetails?.tests ?? parsedDetails ?? null)
  }
}

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
             COALESCE(d.extracted_json::jsonb->>'title', d.doc_type, d.image_path) AS title,
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

async function listOrphanCategories(db) {
  const results = []
  for (const definition of ORPHAN_DEFINITIONS) {
    const { rows: items } = await db.query(definition.selectSql)
    results.push({
      key: definition.key,
      label: definition.label,
      count: items.length,
      items,
    })
  }
  return results.filter(category => category.count > 0)
}

async function deleteOrphanCategory(db, definition, rows) {
  if (rows.length === 0) return 0

  const values = definition.deleteColumn
    ? rows.map(row => row.id)
    : rows.map(row => row.reference)

  const uniqueValues = [...new Set(values.filter(value => value !== null && value !== undefined))]
  if (uniqueValues.length === 0) return 0

  const placeholders = uniqueValues.map((_, i) => `$${i + 1}`).join(', ')
  const whereSql = definition.deleteWhereSql ?? `${definition.deleteColumn} IN (${placeholders})`
  const sql = `DELETE FROM ${definition.deleteTable} WHERE ${whereSql.replace('%PLACEHOLDERS%', placeholders)}`
  const result = await db.query(sql, uniqueValues)
  return result.rowCount
}

export default async function adminRoutes(fastify) {
  // alle Admin-Routen erfordern JWT + Admin-Rolle
  fastify.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify() } catch { return reply.code(401).send({ error: 'Nicht autorisiert' }) }
    const userRoles = req.user.roles ?? [req.user.role]
    if (!userRoles.includes('admin')) return reply.code(403).send({ error: 'Admin-Zugriff erforderlich' })
  })

  // Version endpoint - Build-Informationen
  fastify.get('/api/admin/version', async (req) => {
    const pkgPath = join(__dirname, '..', '..', 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    return {
      server: pkg.version,
      buildTime: new Date().toISOString(),
      buildDate: new Date().toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      buildTime24h: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
  })

  // Alle Accounts
  fastify.get('/api/admin/accounts', async (req) => {
    const db = getDb()
    const { rows } = await db.query(`
      SELECT id, name, email, role, verified, verification_status, created_at
      FROM accounts
      ORDER BY created_at DESC
    `)
    return rows
  })

  // Accounts mit pending-Verifikation
  fastify.get('/api/admin/accounts/pending-verification', async (req) => {
    const db = getDb()
    const { rows } = await db.query(`
      SELECT id, name, email, role, verification_status, created_at
      FROM accounts
      WHERE verification_status = 'pending'
      ORDER BY created_at DESC
    `)
    return rows
  })

  // Account-Rolle ändern
  fastify.patch('/api/admin/accounts/:id', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { role, verified } = req.body
    const { accountId, role: adminRole } = req.user

    const { rows: [account] } = await db.query('SELECT * FROM accounts WHERE id = $1', [id])
    if (!account) return reply.code(404).send({ error: 'Account nicht gefunden' })

    // Prevent admin from demoting their own admin role
    if (id === accountId && role && account.role === 'admin' && role !== 'admin') {
      return reply.code(403).send({ error: 'Cannot demote your own admin role' })
    }

    if (role) {
      await db.query('UPDATE accounts SET role = $1 WHERE id = $2', [role, id])
    }
    if (verified !== undefined) {
      await db.query('UPDATE accounts SET verified = $1 WHERE id = $2', [verified ? 1 : 0, id])
    }

    await logAudit(db, {
      accountId, role: adminRole, action: 'admin_update_account',
      resource: 'account', resourceId: id,
      details: { role, verified },
      ip: req.ip
    })

    const { rows: [updated] } = await db.query('SELECT id, name, email, role, verified FROM accounts WHERE id = $1', [id])
    return updated
  })

  // Verifikation genehmigen/ablehnen
  fastify.post('/api/admin/accounts/:id/verify', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { approved, note } = req.body
    const { accountId, role: adminRole } = req.user

    const { rows: [account] } = await db.query('SELECT * FROM accounts WHERE id = $1', [id])
    if (!account) return reply.code(404).send({ error: 'Account nicht gefunden' })

    const status = approved ? 'approved' : 'rejected'
    await db.query(`UPDATE accounts SET verification_status = $1, verified = $2, verification_note = $3 WHERE id = $4`,
      [status, approved ? 1 : 0, note ?? null, id])

    await logAudit(db, {
      accountId, role: adminRole, action: `verify_${status}`,
      resource: 'account', resourceId: id,
      details: { note },
      ip: req.ip
    })

    const { rows: [updated] } = await db.query('SELECT id, name, email, role, verified, verification_status FROM accounts WHERE id = $1', [id])
    return updated
  })

  // Get all verification requests (admin)
  fastify.get('/api/admin/verifications', async (req, reply) => {
    const db = getDb()
    try { await req.jwtVerify() } catch { return reply.code(401).send({ error: 'Nicht autorisiert' }) }
    
    const userRoles = req.user?.roles ?? [req.user?.role || 'user']
    if (!userRoles.includes('admin')) return reply.code(403).send({ error: 'Admin-Zugriff erforderlich' })

    const { rows: verifications } = await db.query(`
      SELECT 
        vr.id,
        vr.account_id,
        vr.type,
        vr.status,
        vr.notes,
        vr.document_path,
        vr.rejection_reason,
        vr.created_at,
        vr.updated_at,
        a.name,
        a.email
      FROM verification_requests vr
      JOIN accounts a ON a.id = vr.account_id
      ORDER BY 
        CASE WHEN vr.status = 'pending' THEN 0 ELSE 1 END,
        vr.created_at DESC
    `)

    return { verifications }
  })

  // Approve verification request
  fastify.post('/api/admin/verifications/:id/approve', async (req, reply) => {
    const db = getDb()
    try { await req.jwtVerify() } catch { return reply.code(401).send({ error: 'Nicht autorisiert' }) }
    
    const userRoles = req.user?.roles ?? [req.user?.role || 'user']
    if (!userRoles.includes('admin')) return reply.code(403).send({ error: 'Admin-Zugriff erforderlich' })

    const { id } = req.params
    const { accountId: adminId } = req.user

    const { rows: [vr] } = await db.query('SELECT * FROM verification_requests WHERE id = $1', [id])
    if (!vr) return reply.code(404).send({ error: 'Verifikationsantrag nicht gefunden' })
    if (vr.status !== 'pending') return reply.code(409).send({ error: 'Antrag ist nicht mehr ausstehend' })

    const { rows: [account] } = await db.query('SELECT * FROM accounts WHERE id = $1', [vr.account_id])
    if (!account) return reply.code(404).send({ error: 'Account nicht gefunden' })

    // Update verification request status
    await db.query(`
      UPDATE verification_requests 
      SET status = 'approved', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [id])

    // Assign role based on verification type
    const roleMap = {
      'vet': 'veterinarian',
      'authority': 'authority'
    }
    const roleToAdd = roleMap[vr.type] || vr.type
    
    // Get current roles and add new one (if not already present)
    const currentRoles = (account.role || 'user').split(',').map(r => r.trim()).filter(r => r)
    if (!currentRoles.includes(roleToAdd)) {
      currentRoles.push(roleToAdd)
    }
    const updatedRoles = currentRoles.join(',')

    // Update accounts table with new roles
    await db.query(`
      UPDATE accounts 
      SET verified = 1, verification_status = 'approved', role = $1
      WHERE id = $2
    `, [updatedRoles, vr.account_id])

    await logAudit(db, {
      accountId: adminId,
      role: 'admin',
      action: 'verify_approved',
      resource: 'verification_request',
      resourceId: id,
      details: { user_account_id: vr.account_id },
      ip: req.ip
    })

    return { message: 'Verifikation genehmigt' }
  })

  // Reject verification request
  fastify.post('/api/admin/verifications/:id/reject', async (req, reply) => {
    const db = getDb()
    try { await req.jwtVerify() } catch { return reply.code(401).send({ error: 'Nicht autorisiert' }) }
    
    const userRoles = req.user?.roles ?? [req.user?.role || 'user']
    if (!userRoles.includes('admin')) return reply.code(403).send({ error: 'Admin-Zugriff erforderlich' })

    const { id } = req.params
    const { reason } = req.body
    const { accountId: adminId } = req.user

    if (!reason || reason.trim().length === 0) {
      return reply.code(400).send({ error: 'Ablehnungsgrund erforderlich' })
    }

    const { rows: [vr] } = await db.query('SELECT * FROM verification_requests WHERE id = $1', [id])
    if (!vr) return reply.code(404).send({ error: 'Verifikationsantrag nicht gefunden' })
    if (vr.status !== 'pending') return reply.code(409).send({ error: 'Antrag ist nicht mehr ausstehend' })

    // Update verification request status
    await db.query(`
      UPDATE verification_requests 
      SET status = 'rejected', rejection_reason = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [reason, id])

    // Update accounts table for backward compatibility
    await db.query(`
      UPDATE accounts 
      SET verification_status = 'rejected', verification_note = $1
      WHERE id = $2
    `, [reason, vr.account_id])

    await logAudit(db, {
      accountId: adminId,
      role: 'admin',
      action: 'verify_rejected',
      resource: 'verification_request',
      resourceId: id,
      details: { user_account_id: vr.account_id, reason },
      ip: req.ip
    })

    return { message: 'Verifikation abgelehnt' }
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
        al.id,
        al.account_id,
        al.account_role,
        al.action,
        al.resource,
        al.resource_id,
        al.details,
        al.ip_address as ip,
        al.created_at,
        a.email as account_email,
        a.name as account_name
      FROM audit_log al
      LEFT JOIN accounts a ON a.id = al.account_id
      WHERE 1=1
    `
    const params = []
    const countParams = []
    let paramIdx = 1
    let countParamIdx = 1

    let countWhere = ''
    if (resource) {
      sql += ` AND al.resource = $${paramIdx++}`
      params.push(resource)
      countWhere += ` AND resource = $${countParamIdx++}`
      countParams.push(resource)
    }
    if (accountId) {
      sql += ` AND al.account_id = $${paramIdx++}`
      params.push(accountId)
      countWhere += ` AND account_id = $${countParamIdx++}`
      countParams.push(accountId)
    }

    sql += ` ORDER BY al.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`
    params.push(limit, offset)

    const { rows } = await db.query(sql, params)
    const { rows: [total] } = await db.query(`SELECT COUNT(*)::int as cnt FROM audit_log WHERE 1=1${countWhere}`, countParams)

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
    const { rows } = await db.query(`
      SELECT a.*, ac.name AS owner_name, ac.email AS owner_email
      FROM animals a
      JOIN accounts ac ON ac.id = a.account_id
      ORDER BY a.created_at DESC
    `)
    return rows
  })

  // Statistiken
  fastify.get('/api/admin/stats', async (req) => {
    const db = getDb()
    const { rows: [{ cnt: accounts }] } = await db.query('SELECT COUNT(*)::int as cnt FROM accounts')
    const { rows: [{ cnt: animals }] } = await db.query('SELECT COUNT(*)::int as cnt FROM animals')
    const { rows: [{ cnt: animals_active }] } = await db.query('SELECT COUNT(*)::int as cnt FROM animals WHERE is_archived = 0')
    const { rows: [{ cnt: animals_archived }] } = await db.query('SELECT COUNT(*)::int as cnt FROM animals WHERE is_archived = 1')
    const { rows: [{ cnt: animals_with_docs }] } = await db.query(`
      SELECT COUNT(DISTINCT a.id)::int as cnt FROM animals a
      JOIN documents d ON d.animal_id = a.id
    `)
    const { rows: [{ cnt: documents }] } = await db.query('SELECT COUNT(*)::int as cnt FROM documents')
    const { rows: [{ cnt: auditEntries }] } = await db.query('SELECT COUNT(*)::int as cnt FROM audit_log')
    const { rows: [{ cnt: pendingVerifications }] } = await db.query("SELECT COUNT(*)::int as cnt FROM accounts WHERE verification_status = 'pending'")

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
    const db = getDb()
    const { rows: [latestRow] } = await db.query(`
      SELECT summary_json, details_json
      FROM test_results
      ORDER BY test_timestamp DESC, created_at DESC
      LIMIT 1
    `)

    if (latestRow) {
      try {
        return normalizeStoredTestPayload(latestRow.summary_json, latestRow.details_json)
      } catch {
        return { summary: null, tests: null }
      }
    }

    if (existsSync(TEST_RESULTS_FILE)) {
      try {
        const data = JSON.parse(readFileSync(TEST_RESULTS_FILE, 'utf-8'))
        return {
          summary: data?.summary ?? null,
          tests: data?.tests?.testResults || data?.tests?.assertionResults ? data.tests : (data?.tests ?? null),
        }
      } catch {
        return { summary: null, tests: null }
      }
    }

    const { rows: [summary] } = await db.query("SELECT value FROM settings WHERE key = 'last_test_run'")
    const { rows: [details] } = await db.query("SELECT value FROM settings WHERE key = 'last_test_run_details'")
    try {
      return normalizeStoredTestPayload(summary?.value, details?.value)
    } catch {
      return { summary: null, tests: null }
    }
  })

  fastify.get('/api/admin/orphans', async () => {
    const db = getDb()
    const categories = await listOrphanCategories(db)
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
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      for (const definition of definitions) {
        const { rows } = await client.query(definition.selectSql)
        deleted[definition.key] = await deleteOrphanCategory(client, definition, rows)
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    await logAudit(db, {
      accountId,
      role,
      action: 'bulk_delete_orphans',
      resource: 'maintenance',
      resourceId: requestedCategories.join(','),
      details: deleted,
      ip: req.ip
    })

    const categories = await listOrphanCategories(db)
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

    const { rows: [target] } = await db.query('SELECT role FROM accounts WHERE id = $1', [targetId])
    if (!target) return reply.code(404).send({ error: 'Account nicht gefunden' })

    if (target.role === 'admin') {
      const { rows: [{ c: otherAdmins }] } = await db.query("SELECT COUNT(*)::int as c FROM accounts WHERE role='admin' AND id != $1", [targetId])
      if (otherAdmins === 0) {
        return reply.code(403).send({ error: 'Kann letzten Admin nicht löschen' })
      }
    }

    await db.query('DELETE FROM org_memberships WHERE account_id = $1 OR invited_by = $2', [targetId, targetId])
    await db.query('DELETE FROM organizations WHERE owner_id = $1', [targetId])
    await db.query('DELETE FROM animals WHERE account_id = $1', [targetId])
    await db.query('DELETE FROM animal_tags WHERE animal_id NOT IN (SELECT id FROM animals)')
    await db.query('DELETE FROM documents WHERE animal_id NOT IN (SELECT id FROM animals)')
    await db.query('UPDATE documents SET added_by_account = NULL WHERE added_by_account = $1', [targetId])
    await db.query('DELETE FROM audit_log WHERE account_id = $1', [targetId])
    await db.query('DELETE FROM accounts WHERE id = $1', [targetId])

    await logAudit(db, { accountId, role, action: 'delete_account', resource: 'account', resourceId: targetId, ip: req.ip })
    return reply.code(204).send()
  })

  // DELETE animal
  fastify.delete('/api/admin/animals/:id', async (req, reply) => {
    const db = getDb()
    const animalId = req.params.id
    const { accountId, role } = req.user

    const { rows: [animal] } = await db.query('SELECT id FROM animals WHERE id = $1', [animalId])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    await db.query('DELETE FROM animal_tags WHERE animal_id = $1', [animalId])
    await db.query('DELETE FROM documents WHERE animal_id = $1', [animalId])
    await db.query('DELETE FROM animals WHERE id = $1', [animalId])

    await logAudit(db, { accountId, role, action: 'delete_animal', resource: 'animal', resourceId: animalId, ip: req.ip })
    return reply.code(204).send()
  })

  // DELETE document
  fastify.delete('/api/admin/documents/:id', async (req, reply) => {
    const db = getDb()
    const docId = req.params.id
    const { accountId, role } = req.user

    const { rows: [doc] } = await db.query('SELECT id FROM documents WHERE id = $1', [docId])
    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })

    await db.query('DELETE FROM document_pages WHERE document_id = $1', [docId])
    await db.query('DELETE FROM documents WHERE id = $1', [docId])

    await logAudit(db, { accountId, role, action: 'delete_document', resource: 'document', resourceId: docId, ip: req.ip })
    return reply.code(204).send()
  })

  // DELETE tag (animal_tags)
  fastify.delete('/api/admin/tags/:tagId', async (req, reply) => {
    const db = getDb()
    const tagId = req.params.tagId
    const { accountId, role } = req.user

    const { rows: [tag] } = await db.query('SELECT tag_id FROM animal_tags WHERE tag_id = $1', [tagId])
    if (!tag) return reply.code(404).send({ error: 'Tag nicht gefunden' })

    await db.query('DELETE FROM animal_tags WHERE tag_id = $1', [tagId])

    await logAudit(db, { accountId, role, action: 'delete_tag', resource: 'tag', resourceId: tagId, ip: req.ip })
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
    const { rows: [target] } = await db.query('SELECT id, role, verified, name AS account_name FROM accounts WHERE id = $1', [account_id])
    if (!target) return reply.code(404).send({ error: 'Account not found' })
    if (!target.verified || !target.role.includes('vet')) {
      return reply.code(400).send({ error: 'Target account must be a verified veterinarian' })
    }

    const { raw, hash, prefix } = generateApiKey()
    const keyId = uuid()

    await db.query(`
      INSERT INTO api_keys (id, key_hash, key_prefix, account_id, name)
      VALUES ($1, $2, $3, $4, $5)
    `, [keyId, hash, prefix, account_id, name])

    await logAudit(db, {
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
    const { rows } = await db.query(`
      SELECT k.id, k.key_prefix, k.account_id, k.name, k.permissions, k.rate_limit, k.active, k.last_used_at, k.created_at,
             a.name AS account_name, a.email AS account_email
      FROM api_keys k
      JOIN accounts a ON a.id = k.account_id
      ORDER BY k.created_at DESC
    `)
    return rows
  })

  // Deactivate an API key
  fastify.delete('/api/admin/api-keys/:id', async (req, reply) => {
    const db = getDb()
    const keyId = req.params.id
    const { accountId, role } = req.user

    const { rows: [key] } = await db.query('SELECT id, name FROM api_keys WHERE id = $1', [keyId])
    if (!key) return reply.code(404).send({ error: 'API key not found' })

    await db.query('UPDATE api_keys SET active = 0 WHERE id = $1', [keyId])

    await logAudit(db, {
      accountId, role, action: 'deactivate_api_key',
      resource: 'api_key', resourceId: keyId,
      details: { key_name: key.name },
      ip: req.ip
    })

    return reply.code(200).send({ success: true, message: 'API key deactivated' })
  })
}
