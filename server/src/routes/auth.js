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

    const { rows: [existing] } = await db.query('SELECT id FROM accounts WHERE email = $1', [email])
    if (existing) {
      return reply.code(409).send({ error: 'E-Mail bereits registriert' })
    }

    const password_hash = await bcrypt.hash(password, 10)
    const id = uuid()

    await db.query('INSERT INTO accounts (id, name, email, password_hash) VALUES ($1, $2, $3, $4)', [id, name, email, password_hash])

    await logAudit(db, { accountId: id, role: 'user', action: 'register', resource: 'account', resourceId: id, ip: req.ip })

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

    const { rows: [account] } = await db.query('SELECT * FROM accounts WHERE email = $1', [email])
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

    await logAudit(db, { accountId: account.id, role, action: 'login', resource: 'account', resourceId: account.id, ip: req.ip })

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
    await db.query('INSERT INTO jwt_blacklist (jti, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING', [jti, expiresAt])

    await logAudit(db, { accountId: req.user.accountId, role: req.user.role, action: 'logout', resource: 'account', resourceId: req.user.accountId, ip: req.ip })
    return reply.code(204).send()
  })

  // Tierarzt/Behörde beantragt Verifikation mit optionalem Dokument
  fastify.post('/api/accounts/request-verification', async (req, reply) => {
    try { await req.jwtVerify() } catch { return reply.code(401).send({ error: 'Nicht autorisiert' }) }

    const db = getDb()
    const { accountId, role } = req.user

    const { rows: [account] } = await db.query('SELECT * FROM accounts WHERE id = $1', [accountId])
    if (!account) return reply.code(404).send({ error: 'Account nicht gefunden' })

    // Check for existing pending/approved requests
    const { rows: [existingRequest] } = await db.query(`
      SELECT id, status FROM verification_requests 
      WHERE account_id = $1 AND status IN ('pending', 'approved')
    `, [accountId])
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
    await db.query(`
      INSERT INTO verification_requests (id, account_id, type, status, notes, document_path, created_at, updated_at)
      VALUES ($1, $2, $3, 'pending', $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [verificationId, accountId, verType, notes, documentPath])

    // Also update old accounts table for backward compatibility
    await db.query(`UPDATE accounts SET verification_status = 'pending' WHERE id = $1`, [accountId])

    await logAudit(db, { 
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

    const { rows: requests } = await db.query(`
      SELECT id, type, status, notes, document_path, rejection_reason, created_at, updated_at
      FROM verification_requests
      WHERE account_id = $1
      ORDER BY created_at DESC
    `, [accountId])

    return { requests }
  })

  // Eigenes Profil lesen
  fastify.get('/api/accounts/me', { onRequest: [fastify.authenticate] }, async (req) => {
    const db = getDb()
    const { rows: [account] } = await db.query('SELECT id, name, email, role, verified, verification_status, gemini_model, claude_model, created_at FROM accounts WHERE id = $1', [req.user.accountId])
    if (!account) return { error: 'Account nicht gefunden' }
    const roles = (account.role ?? 'user').split(',').map(r => r.trim())
    const { rows: [fullAccount] } = await db.query('SELECT gemini_token, anthropic_token FROM accounts WHERE id = $1', [account.id])
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
    if (name !== undefined) { vals.push(name); updates.push(`name = $${vals.length}`) }
    if (gemini_token !== undefined) {
      vals.push(gemini_token ? encrypt(gemini_token) : null)
      updates.push(`gemini_token = $${vals.length}`)
    }
    if (gemini_model !== undefined) {
      if (!ALLOWED_GEMINI_MODELS.includes(gemini_model)) {
        return reply.code(400).send({ error: 'Ungültiges Gemini-Modell' })
      }
      vals.push(gemini_model)
      updates.push(`gemini_model = $${vals.length}`)
    }
    if (anthropic_token !== undefined) {
      vals.push(anthropic_token ? encrypt(anthropic_token) : null)
      updates.push(`anthropic_token = $${vals.length}`)
    }
    if (claude_model !== undefined) {
      if (!ALLOWED_CLAUDE_MODELS.includes(claude_model)) {
        return reply.code(400).send({ error: 'Ungültiges Claude-Modell' })
      }
      vals.push(claude_model)
      updates.push(`claude_model = $${vals.length}`)
    }
    if (openai_token !== undefined) {
      vals.push(openai_token ? encrypt(openai_token) : null)
      updates.push(`openai_token = $${vals.length}`)
    }
    if (openai_model !== undefined) {
      if (!ALLOWED_OPENAI_MODELS.includes(openai_model)) {
        return reply.code(400).send({ error: 'Ungültiges OpenAI-Modell' })
      }
      vals.push(openai_model)
      updates.push(`openai_model = $${vals.length}`)
    }
    if (ai_provider_priority !== undefined) {
      vals.push(typeof ai_provider_priority === 'string' ? ai_provider_priority : JSON.stringify(ai_provider_priority))
      updates.push(`ai_provider_priority = $${vals.length}`)
    }
    if (!updates.length) return reply.code(400).send({ error: 'Keine Änderungen' })
    vals.push(accountId)
    await db.query(`UPDATE accounts SET ${updates.join(', ')} WHERE id = $${vals.length}`, vals)
    await logAudit(db, { accountId, role: req.user.role, action: 'update_profile', resource: 'account', resourceId: accountId, ip: req.ip })
    return { message: 'Profil aktualisiert' }
  })

  // Account löschen (DSGVO Art. 17)
  fastify.delete('/api/accounts/me', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const accountId = req.user.accountId
    const { role } = req.user

    if (role === 'admin') {
      const { rows: [{ c: otherAdmins }] } = await db.query("SELECT COUNT(*)::int as c FROM accounts WHERE role='admin' AND id != $1", [accountId])
      if (otherAdmins === 0) {
        return reply.code(403).send({ error: 'Cannot delete the last admin account' })
      }
    }

    await db.query('DELETE FROM org_memberships WHERE account_id = $1 OR invited_by = $2', [accountId, accountId])
    await db.query('DELETE FROM organizations WHERE owner_id = $1', [accountId])
    await db.query('UPDATE documents SET added_by_account = NULL WHERE added_by_account = $1', [accountId])
    await db.query('DELETE FROM audit_log WHERE account_id = $1', [accountId])
    await db.query('DELETE FROM accounts WHERE id = $1', [accountId])
    return reply.code(204).send()
  })

  // DSGVO Datenexport (Takeout) — liefert ZIP mit allen Tier- und Dokumentdaten
  fastify.get('/api/accounts/me/export', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { accountId } = req.user

    const { rows: [account] } = await db.query('SELECT id, name, email, created_at FROM accounts WHERE id = $1', [accountId])
    if (!account) return reply.code(404).send({ error: 'Account nicht gefunden' })

    const { rows: animals } = await db.query('SELECT * FROM animals WHERE account_id = $1', [accountId])

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
      const { rows: docs } = await db.query('SELECT * FROM documents WHERE animal_id = $1', [animal.id])

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
        const { rows: pages } = await db.query('SELECT * FROM document_pages WHERE document_id = $1', [doc.id])
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

    await logAudit(db, {
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
