import { v4 as uuid } from 'uuid'
import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'

export default async function tenantRoutes(fastify) {
  // Alle Tenant-Routen erfordern JWT + Admin-Rolle (Globale Administration)
  fastify.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify() } catch { return reply.code(401).send({ error: 'Nicht autorisiert' }) }
    const userRoles = req.user.roles ?? [req.user.role]
    if (!userRoles.includes('admin')) return reply.code(403).send({ error: 'Admin-Zugriff erforderlich' })
  })

  // 1. Liste alle Mandanten (Organizations)
  fastify.get('/api/admin/tenants', async (req) => {
    const db = getDb()
    const { rows } = await db.query(`
      SELECT o.*, 
             (SELECT COUNT(*) FROM org_memberships WHERE org_id = o.id)::int as member_count,
             (SELECT COUNT(*) FROM domain_registry WHERE org_id = o.id)::int as domain_count
      FROM organizations o
      ORDER BY o.created_at DESC
    `)
    return rows
  })

  // 2. Erstelle einen neuen Mandanten
  fastify.post('/api/admin/tenants', async (req, reply) => {
    const db = getDb()
    const { name, slug, primary_color, owner_id } = req.body
    if (!name || !slug) return reply.code(400).send({ error: 'Name und Slug sind erforderlich' })

    const id = uuid()
    await db.query(`
      INSERT INTO organizations (id, name, slug, primary_color, owner_id, status)
      VALUES ($1, $2, $3, $4, $5, 'active')
    `, [id, name, slug, primary_color || '#0ea5e9', owner_id])

    await logAudit(db, {
      accountId: req.user.accountId,
      role: 'admin',
      action: 'create_tenant',
      resource: 'organization',
      resourceId: id,
      details: { name, slug },
      ip: req.ip
    })

    return { id, name, slug }
  })

  // 3. Domain-Registry Management
  fastify.get('/api/admin/tenants/:id/domains', async (req) => {
    const db = getDb()
    const { rows } = await db.query('SELECT * FROM domain_registry WHERE org_id = $1', [req.params.id])
    return rows
  })

  fastify.post('/api/admin/tenants/:id/domains', async (req, reply) => {
    const db = getDb()
    const { domain, is_primary } = req.body
    const org_id = req.params.id

    if (!domain) return reply.code(400).send({ error: 'Domain erforderlich' })

    const id = uuid()
    await db.query(`
      INSERT INTO domain_registry (id, org_id, domain, is_primary)
      VALUES ($1, $2, $3, $4)
    `, [id, org_id, domain, is_primary ? 1 : 0])

    await logAudit(db, {
      accountId: req.user.accountId,
      role: 'admin',
      action: 'add_tenant_domain',
      resource: 'domain_registry',
      resourceId: id,
      details: { domain, org_id },
      ip: req.ip
    })

    return { id, domain }
  })

  fastify.delete('/api/admin/domains/:id', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    await db.query('DELETE FROM domain_registry WHERE id = $1', [id])
    
    await logAudit(db, {
      accountId: req.user.accountId,
      role: 'admin',
      action: 'delete_tenant_domain',
      resource: 'domain_registry',
      resourceId: id,
      ip: req.ip
    })

    return reply.code(204).send()
  })
}
