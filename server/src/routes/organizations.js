import { v4 as uuid } from 'uuid'
import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'

export default async function organizationRoutes(fastify) {
  // All org routes require JWT
  fastify.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/organizations')) {
      try { await req.jwtVerify() } catch { return reply.code(401).send({ error: 'Nicht autorisiert' }) }
    }
  })

  // Create organization
  fastify.post('/api/organizations', async (req, reply) => {
    const db = getDb()
    const { name, type } = req.body
    const { accountId, role } = req.user

    if (!name) return reply.code(400).send({ error: 'Name erforderlich' })

    const orgId = uuid()
    const now = Math.floor(Date.now() / 1000)

    db.prepare(`
      INSERT INTO organizations (id, name, type, owner_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(orgId, name, type ?? 'family', accountId, now)

    // Add owner to org
    db.prepare(`
      INSERT INTO org_memberships (org_id, account_id, role, accepted, created_at)
      VALUES (?, ?, 'owner', 1, ?)
    `).run(orgId, accountId, now)

    logAudit(db, {
      accountId, role, action: 'create_organization', resource: 'organization', resourceId: orgId,
      ip: req.ip
    })

    return { id: orgId, name, type: type ?? 'family', owner_id: accountId, created_at: now }
  })

  // List user's organizations
  fastify.get('/api/organizations', async (req) => {
    const db = getDb()
    const { accountId } = req.user

    return db.prepare(`
      SELECT DISTINCT o.* FROM organizations o
      JOIN org_memberships om ON o.id = om.org_id
      WHERE om.account_id = ?
      ORDER BY o.created_at DESC
    `).all(accountId)
  })

  // Get organization members
  fastify.get('/api/organizations/:id/members', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId } = req.user

    const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(id)
    if (!org) return reply.code(404).send({ error: 'Organisation nicht gefunden' })

    // Only owner can list members
    if (org.owner_id !== accountId) return reply.code(403).send({ error: 'Nur der Owner kann Mitglieder sehen' })

    return db.prepare(`
      SELECT om.account_id, om.role, om.accepted, om.created_at, a.name, a.email
      FROM org_memberships om
      JOIN accounts a ON om.account_id = a.id
      WHERE om.org_id = ?
      ORDER BY om.created_at DESC
    `).all(id)
  })

  // Invite user to organization
  fastify.post('/api/organizations/:id/invite', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { email } = req.body
    const { accountId, role } = req.user

    const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(id)
    if (!org) return reply.code(404).send({ error: 'Organisation nicht gefunden' })

    if (org.owner_id !== accountId) return reply.code(403).send({ error: 'Nur der Owner kann einladen' })

    const invitee = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email)
    if (!invitee) return reply.code(404).send({ error: 'Account nicht gefunden' })

    // Check if already a member
    const existing = db.prepare('SELECT * FROM org_memberships WHERE org_id = ? AND account_id = ?').get(id, invitee.id)
    if (existing) return reply.code(409).send({ error: 'Benutzer ist bereits Mitglied' })

    const now = Math.floor(Date.now() / 1000)
    db.prepare(`
      INSERT INTO org_memberships (org_id, account_id, role, invited_by, accepted, created_at)
      VALUES (?, ?, 'member', ?, 0, ?)
    `).run(id, invitee.id, accountId, now)

    logAudit(db, {
      accountId, role, action: 'invite_to_organization', resource: 'organization', resourceId: id,
      details: { invitee_id: invitee.id },
      ip: req.ip
    })

    return { message: `${email} wurde eingeladen` }
  })

  // Accept organization invitation
  fastify.post('/api/organizations/:id/accept', async (req, reply) => {
    const db = getDb()
    const { id } = req.params
    const { accountId, role } = req.user

    const membership = db.prepare('SELECT * FROM org_memberships WHERE org_id = ? AND account_id = ?').get(id, accountId)
    if (!membership) return reply.code(404).send({ error: 'Einladung nicht gefunden' })

    if (membership.accepted) return reply.code(409).send({ error: 'Bereits akzeptiert' })

    db.prepare('UPDATE org_memberships SET accepted = 1 WHERE org_id = ? AND account_id = ?').run(id, accountId)

    logAudit(db, {
      accountId, role, action: 'accept_organization_invite', resource: 'organization', resourceId: id,
      ip: req.ip
    })

    return { message: 'Einladung akzeptiert' }
  })

  // Remove organization member (owner only)
  fastify.delete('/api/organizations/:id/members/:memberId', async (req, reply) => {
    const db = getDb()
    const { id, memberId } = req.params
    const { accountId, role } = req.user

    const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(id)
    if (!org) return reply.code(404).send({ error: 'Organisation nicht gefunden' })

    if (org.owner_id !== accountId) return reply.code(403).send({ error: 'Nur der Owner kann Mitglieder entfernen' })

    if (memberId === accountId) return reply.code(403).send({ error: 'Cannot remove yourself' })

    db.prepare('DELETE FROM org_memberships WHERE org_id = ? AND account_id = ?').run(id, memberId)

    logAudit(db, {
      accountId, role, action: 'remove_from_organization', resource: 'organization', resourceId: id,
      details: { removed_member_id: memberId },
      ip: req.ip
    })

    return reply.code(204).send()
  })
}
