import bcrypt from 'bcrypt'
import { v4 as uuid } from 'uuid'
import crypto from 'crypto'
import { createReadStream, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'
import { saveImageChunks, getUploadPath } from '../services/storage.js'
import { encrypt, decrypt } from '../utils/crypto.js'
import { ALLOWED_CLAUDE_MODELS, ALLOWED_GEMINI_MODELS, ALLOWED_OPENAI_MODELS } from '../utils/aiModels.js'

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? resolve(process.env.UPLOADS_DIR)
  : resolve('./uploads')

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

  // Tierarzt/Behörde beantragt Verifikation mit optionalem Dokument
  fastify.post('/api/accounts/request-verification', async (req, reply) => {
    try { await req.jwtVerify() } catch { return reply.code(401).send({ error: 'Nicht autorisiert' }) }

    const db = getDb()
    const { accountId, role } = req.user

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId)
    if (!account) return reply.code(404).send({ error: 'Account nicht gefunden' })

    // Check for existing pending/approved requests
    const existingRequest = db.prepare(`
      SELECT id, status FROM verification_requests 
      WHERE account_id = ? AND status IN ('pending', 'approved')
    `).get(accountId)
    if (existingRequest) {
      return reply.code(409).send({ 
        error: existingRequest.status === 'pending' 
          ? 'Verifikation bereits beantragt' 
          : 'Bereits verifiziert' 
      })
    }

    let documentPath = null
    let verType = 'vet'
    let notes = null

    // Try to parse multipart data if content-type is multipart
    if (req.headers['content-type'] && req.headers['content-type'].includes('multipart')) {
      try {
        const data = await req.file()
        if (data) {
          for await (const part of data) {
            if (part.type === 'field') {
              if (part.fieldname === 'type') verType = part.value || 'vet'
              if (part.fieldname === 'notes') notes = part.value || null
            } else if (part.type === 'file' && part.fieldname === 'document') {
              // Save verification document (PDF or image)
              const ext = part.filename.split('.').pop() || 'pdf'
              const docFilename = `verifications/${accountId}-${Date.now()}.${ext}`
              const chunks = []
              
              for await (const chunk of part.file) {
                chunks.push(chunk)
              }
              
              const buffer = Buffer.concat(chunks)
              // Basic file type validation (just check size)
              if (buffer.length > 10 * 1024 * 1024) { // 10MB limit
                return reply.code(413).send({ error: 'Datei zu groß (max 10MB)' })
              }
              
              const filepath = getUploadPath(docFilename)
              const dirPath = dirname(filepath)
              require('fs').mkdirSync(dirPath, { recursive: true })
              require('fs').writeFileSync(filepath, buffer)
              documentPath = docFilename
            }
          }
        }
      } catch (err) {
        // Multipart parsing failed, fall back to JSON body
      }
    }

    // Fallback: try to read from JSON body (for backward compatibility)
    if (!verType && req.body) {
      verType = req.body.type || 'vet'
      notes = req.body.notes || null
    }

    const verificationId = uuid()

    // Create verification request
    db.prepare(`
      INSERT INTO verification_requests (id, account_id, type, status, notes, document_path, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))
    `).run(verificationId, accountId, verType, notes, documentPath)

    // Also update old accounts table for backward compatibility
    db.prepare(`UPDATE accounts SET verification_status = 'pending' WHERE id = ?`).run(accountId)

    logAudit(db, { 
      accountId, 
      role, 
      action: 'request_verification', 
      resource: 'verification_request', 
      resourceId: verificationId, 
      ip: req.ip 
    })

    return { message: 'Verifikationsantrag eingereicht', requestId: verificationId }
  })

  // User abrufen eigene Verifikations-Anfragen
  fastify.get('/api/accounts/verifications', { onRequest: [fastify.authenticate] }, async (req) => {
    const db = getDb()
    const { accountId } = req.user

    const requests = db.prepare(`
      SELECT id, type, status, notes, document_path, rejection_reason, created_at, updated_at
      FROM verification_requests
      WHERE account_id = ?
      ORDER BY created_at DESC
    `).all(accountId)

    return { requests }
  })

  // Eigenes Profil lesen
  fastify.get('/api/accounts/me', { onRequest: [fastify.authenticate] }, async (req) => {
    const db = getDb()
    const account = db.prepare('SELECT id, name, email, role, verified, verification_status, gemini_model, claude_model, created_at FROM accounts WHERE id = ?').get(req.user.accountId)
    if (!account) return { error: 'Account nicht gefunden' }
    const roles = (account.role ?? 'user').split(',').map(r => r.trim())
    const fullAccount = db.prepare('SELECT gemini_token, anthropic_token FROM accounts WHERE id = ?').get(account.id)
    return { ...account, roles,
      has_gemini_token: !!fullAccount?.gemini_token,
      has_anthropic_token: !!fullAccount?.anthropic_token
    }
  })

  // Eigenes Profil ändern
  fastify.patch('/api/accounts/me', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { name, gemini_token, gemini_model, anthropic_token, claude_model, openai_token, openai_model, ai_provider_priority } = req.body
    const accountId = req.user.accountId
    const updates = []
    const vals = []
    if (name !== undefined) { updates.push('name = ?'); vals.push(name) }
    if (gemini_token !== undefined) {
      updates.push('gemini_token = ?')
      vals.push(gemini_token ? encrypt(gemini_token) : null)
    }
    if (gemini_model !== undefined) {
      if (!ALLOWED_GEMINI_MODELS.includes(gemini_model)) {
        return reply.code(400).send({ error: 'Ungültiges Gemini-Modell' })
      }
      updates.push('gemini_model = ?')
      vals.push(gemini_model)
    }
    if (anthropic_token !== undefined) {
      updates.push('anthropic_token = ?')
      vals.push(anthropic_token ? encrypt(anthropic_token) : null)
    }
    if (claude_model !== undefined) {
      if (!ALLOWED_CLAUDE_MODELS.includes(claude_model)) {
        return reply.code(400).send({ error: 'Ungültiges Claude-Modell' })
      }
      updates.push('claude_model = ?')
      vals.push(claude_model)
    }
    if (openai_token !== undefined) {
      updates.push('openai_token = ?')
      vals.push(openai_token ? encrypt(openai_token) : null)
    }
    if (openai_model !== undefined) {
      if (!ALLOWED_OPENAI_MODELS.includes(openai_model)) {
        return reply.code(400).send({ error: 'Ungültiges OpenAI-Modell' })
      }
      updates.push('openai_model = ?')
      vals.push(openai_model)
    }
    if (ai_provider_priority !== undefined) {
      updates.push('ai_provider_priority = ?')
      vals.push(typeof ai_provider_priority === 'string' ? ai_provider_priority : JSON.stringify(ai_provider_priority))
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

  // DSGVO Datenexport (Takeout) — liefert ZIP mit allen Tier- und Dokumentdaten
  fastify.get('/api/accounts/me/export', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { accountId } = req.user

    const account = db.prepare('SELECT id, name, email, created_at FROM accounts WHERE id = ?').get(accountId)
    if (!account) return reply.code(404).send({ error: 'Account nicht gefunden' })

    const animals = db.prepare('SELECT * FROM animals WHERE account_id = ?').all(accountId)

    const archiver = (await import('archiver')).default
    const archive = archiver('zip', { zlib: { level: 6 } })

    reply.raw.setHeader('Content-Type', 'application/zip')
    reply.raw.setHeader('Content-Disposition', `attachment; filename="pawvax-export-${accountId.slice(0, 8)}.zip"`)

    archive.on('error', (err) => {
      fastify.log.error({ err, accountId }, 'Takeout archive error')
    })

    archive.pipe(reply.raw)

    // account.json
    archive.append(JSON.stringify({ ...account, export_date: new Date().toISOString() }, null, 2), { name: 'account.json' })

    for (const animal of animals) {
      const prefix = `animals/${animal.id}/`
      const docs = db.prepare('SELECT * FROM documents WHERE animal_id = ?').all(animal.id)

      // animal.json (ohne sensitive DB-Felder)
      const parsedDocs = docs.map(d => ({
        ...d,
        extracted_json: (() => { try { return JSON.parse(d.extracted_json) } catch { return {} } })()
      }))
      archive.append(JSON.stringify({ ...animal, documents: parsedDocs }, null, 2), { name: `${prefix}animal.json` })

      // Avatar
      if (animal.avatar_path) {
        const avatarPath = resolve(UPLOADS_DIR, animal.avatar_path)
        if (existsSync(avatarPath)) {
          archive.file(avatarPath, { name: `${prefix}avatar.webp` })
        }
      }

      // Dokument-Bilder
      for (const doc of docs) {
        if (doc.image_path) {
          const imgPath = resolve(UPLOADS_DIR, doc.image_path)
          if (existsSync(imgPath)) {
            const ext = doc.image_path.split('.').pop() || 'jpg'
            archive.file(imgPath, { name: `${prefix}documents/${doc.id}.${ext}` })
          }
        }
        // Zusätzliche Seiten
        const pages = db.prepare('SELECT * FROM document_pages WHERE document_id = ?').all(doc.id)
        for (const page of pages) {
          if (page.image_path) {
            const pagePath = resolve(UPLOADS_DIR, page.image_path)
            if (existsSync(pagePath)) {
              archive.file(pagePath, { name: `${prefix}documents/${doc.id}_page${page.page_number}.jpg` })
            }
          }
        }
      }
    }

    logAudit(db, {
      accountId,
      role: req.user.role,
      action: 'data_export',
      resource: 'account',
      resourceId: accountId,
      details: { animals_count: animals.length },
      ip: req.ip
    })

    await archive.finalize()
  })
}
