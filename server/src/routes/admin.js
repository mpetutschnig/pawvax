import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'

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
    const documents = db.prepare('SELECT COUNT(*) as cnt FROM documents').get().cnt
    const auditEntries = db.prepare('SELECT COUNT(*) as cnt FROM audit_log').get().cnt

    return { accounts, animals, documents, auditEntries }
  })
}
