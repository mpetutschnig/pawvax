import bcrypt from 'bcrypt'
import { v4 as uuid } from 'uuid'
import crypto from 'crypto'
import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'
import { encrypt, decrypt } from '../utils/crypto.js'

export default async function authRoutes(fastify) {
  fastify.post('/api/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 }
        }
      }
    }
  }, async (req, reply) => {
    const { name, email, password } = req.body
    const db = getDb()

    const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email)
    if (existing) {
      return reply.code(409).send({ error: 'E-Mail bereits registriert' })
    }

    const password_hash = await bcrypt.hash(password, 10)
    const id = uuid()

    db.prepare('INSERT INTO accounts (id, name, email, password_hash) VALUES (?, ?, ?, ?)')
      .run(id, name, email, password_hash)

    logAudit(db, { accountId: id, role: 'user', action: 'register', resource: 'account', resourceId: id, ip: req.ip })

    const roles = ['user']
    const jti = crypto.randomUUID()
    const token = fastify.jwt.sign({ accountId: id, name, email, role: 'user', roles, verified: 0, jti })
    return reply.code(201).send({ token, account: { id, name, email, role: 'user', roles, verified: 0 } })
  })

  fastify.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string' }
        }
      }
    },
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '5 minutes'
      }
    }
  }, async (req, reply) => {
    const { email, password } = req.body
    const db = getDb()

    const account = db.prepare('SELECT * FROM accounts WHERE email = ?').get(email)
    if (!account) {
      return reply.code(401).send({ error: 'Ungültige Anmeldedaten' })
    }

    const valid = await bcrypt.compare(password, account.password_hash)
    if (!valid) {
      return reply.code(401).send({ error: 'Ungültige Anmeldedaten' })
    }

    const roleStr = account.role ?? 'user'
    const roles = roleStr.split(',').map(r => r.trim())
    const role = roles[0]
    const verified = account.verified ?? 0

    logAudit(db, { accountId: account.id, role, action: 'login', resource: 'account', resourceId: account.id, ip: req.ip })

    const jti = crypto.randomUUID()
    const token = fastify.jwt.sign({ accountId: account.id, name: account.name, email: account.email, role, roles, verified, jti })
    return { token, account: { id: account.id, name: account.name, email: account.email, role, roles, verified } }
  })

  // Logout — blacklist the JWT token
  fastify.post('/api/auth/logout', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { jti } = req.user
    if (!jti) return reply.code(400).send({ error: 'Invalid token' })

    const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
    db.prepare('INSERT OR IGNORE INTO jwt_blacklist (jti, expires_at) VALUES (?, ?)').run(jti, expiresAt)

    logAudit(db, { accountId: req.user.accountId, role: req.user.role, action: 'logout', resource: 'account', resourceId: req.user.accountId, ip: req.ip })
    return reply.code(204).send()
  })

  // Tierarzt beantragt Verifikation
  fastify.post('/api/accounts/request-verification', async (req, reply) => {
    try { await req.jwtVerify() } catch { return reply.code(401).send({ error: 'Nicht autorisiert' }) }

    const db = getDb()
    const { accountId, role } = req.user

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId)
    if (!account) return reply.code(404).send({ error: 'Account nicht gefunden' })
    if (account.verification_status === 'pending') return reply.code(409).send({ error: 'Verifikation bereits beantragt' })
    if (account.verified) return reply.code(409).send({ error: 'Bereits verifiziert' })

    db.prepare(`UPDATE accounts SET verification_status = 'pending' WHERE id = ?`).run(accountId)
    logAudit(db, { accountId, role, action: 'request_verification', resource: 'account', resourceId: accountId, ip: req.ip })

    return { message: 'Verifikationsantrag eingereicht' }
  })

  // Eigenes Profil lesen
  fastify.get('/api/accounts/me', { onRequest: [fastify.authenticate] }, async (req) => {
    const db = getDb()
    const account = db.prepare('SELECT id, name, email, role, verified, verification_status, gemini_model, created_at FROM accounts WHERE id = ?').get(req.user.accountId)
    if (!account) return { error: 'Account nicht gefunden' }
    const roles = (account.role ?? 'user').split(',').map(r => r.trim())
    return { ...account, roles, has_gemini_token: !!db.prepare('SELECT gemini_token FROM accounts WHERE id = ?').get(account.id)?.gemini_token }
  })

  // Eigenes Profil ändern
  fastify.patch('/api/accounts/me', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { name, gemini_token, gemini_model } = req.body
    const accountId = req.user.accountId
    const ALLOWED_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-3.1-flash-lite-preview', 'gemini-1.5-pro']
    const updates = []
    const vals = []
    if (name !== undefined) { updates.push('name = ?'); vals.push(name) }
    if (gemini_token !== undefined) {
      updates.push('gemini_token = ?')
      vals.push(gemini_token ? encrypt(gemini_token) : null)
    }
    if (gemini_model !== undefined) {
      if (!ALLOWED_MODELS.includes(gemini_model)) {
        return reply.code(400).send({ error: 'Ungültiges Gemini-Modell' })
      }
      updates.push('gemini_model = ?')
      vals.push(gemini_model)
    }
    if (!updates.length) return reply.code(400).send({ error: 'Keine Änderungen' })
    vals.push(accountId)
    db.prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`).run(...vals)
    logAudit(db, { accountId, role: req.user.role, action: 'update_profile', resource: 'account', resourceId: accountId, ip: req.ip })
    return { message: 'Profil aktualisiert' }
  })

  // Account löschen (DSGVO Art. 17)
  fastify.delete('/api/accounts/me', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const accountId = req.user.accountId
    const { role } = req.user

    if (role === 'admin') {
      const otherAdmins = db.prepare("SELECT COUNT(*) as c FROM accounts WHERE role='admin' AND id != ?").get(accountId).c
      if (otherAdmins === 0) {
        return reply.code(403).send({ error: 'Cannot delete the last admin account' })
      }
    }

    db.prepare('DELETE FROM org_memberships WHERE account_id = ? OR invited_by = ?').run(accountId, accountId)
    db.prepare('DELETE FROM organizations WHERE owner_id = ?').run(accountId)
    db.prepare('UPDATE documents SET added_by_account = NULL WHERE added_by_account = ?').run(accountId)
    db.prepare('DELETE FROM audit_log WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId)
    return reply.code(204).send()
  })
}
