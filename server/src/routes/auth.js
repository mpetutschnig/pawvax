import bcrypt from 'bcrypt'
import { v4 as uuid } from 'uuid'
import crypto from 'crypto'
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs'
import { fileTypeFromBuffer } from 'file-type'
import { resolve, dirname, join } from 'path'
import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'
import { saveImageChunks, getUploadPath } from '../services/storage.js'
import { encrypt, decrypt } from '../utils/crypto.js'
import { ALLOWED_CLAUDE_MODELS, ALLOWED_GEMINI_MODELS, ALLOWED_OPENAI_MODELS } from '../utils/aiModels.js'
import { sendAuthEmail, shouldExposeAuthTokens } from '../services/authMail.js'
import { generateApiKey, hashApiKey } from '../utils/apikey.js'
import { createVerify } from 'crypto'
import { getSystemAiKeys } from '../services/appSettings.js'

async function getSupabaseSecret(db) {
  const { rows } = await db.query("SELECT value FROM settings WHERE key = 'supabase_jwt_secret'")
  if (rows[0]?.value) {
    try { return decrypt(rows[0].value) } catch { return rows[0].value }
  }
  return process.env.SUPABASE_JWT_SECRET || null
}

const oauthStates = new Map()

// Purge expired OAuth states every 60 minutes to prevent unbounded memory growth
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000
  for (const [key, value] of oauthStates.entries()) {
    if (value.createdAt < cutoff) oauthStates.delete(key)
  }
}, 60 * 60 * 1000)

const OAUTH_PROVIDERS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scopes: 'openid email profile',
    clientIdEnv: 'OAUTH_GOOGLE_CLIENT_ID',
    clientSecretEnv: 'OAUTH_GOOGLE_CLIENT_SECRET'
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scopes: 'read:user user:email',
    clientIdEnv: 'OAUTH_GITHUB_CLIENT_ID',
    clientSecretEnv: 'OAUTH_GITHUB_CLIENT_SECRET'
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
    scopes: 'openid email profile User.Read',
    clientIdEnv: 'OAUTH_MICROSOFT_CLIENT_ID',
    clientSecretEnv: 'OAUTH_MICROSOFT_CLIENT_SECRET'
  }
}

function decodeJwtPayload(token) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT format')
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
}

function verifyJwtHS256(token, secret) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT')
  const signingInput = `${parts[0]}.${parts[1]}`
  const expectedSig = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url')
  if (expectedSig !== parts[2]) throw new Error('Invalid JWT signature')
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('JWT expired')
  return payload
}

const jwksCache = new Map()

async function fetchJwks(url) {
  const cached = jwksCache.get(url)
  if (cached && Date.now() - cached.fetchedAt < 60 * 60 * 1000) return cached.keys
  const res = await fetch(url)
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`)
  const { keys } = await res.json()
  jwksCache.set(url, { keys, fetchedAt: Date.now() })
  return keys
}

async function verifyJwtRS256(token) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT')
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('JWT expired')
  const jwksUrl = `${payload.iss}/.well-known/jwks.json`
  const keys = await fetchJwks(jwksUrl)
  const jwk = keys.find(k => k.kid === header.kid)
  if (!jwk) throw new Error('JWK not found for kid: ' + header.kid)
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' })
  const signingInput = `${parts[0]}.${parts[1]}`
  const signature = Buffer.from(parts[2], 'base64url')
  const verifier = crypto.createVerify('RSA-SHA256')
  verifier.update(signingInput)
  if (!verifier.verify(publicKey, signature)) throw new Error('Invalid JWT signature')
  return payload
}

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? resolve(process.env.UPLOADS_DIR)
  : resolve('./uploads')

const EMAIL_VERIFICATION_TTL_SECONDS = 24 * 60 * 60
const PASSWORD_RESET_TTL_SECONDS = 60 * 60

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function createRawToken() {
  return crypto.randomBytes(32).toString('hex')
}

async function createEmailVerificationToken(db, accountId) {
  const token = createRawToken()
  const tokenHash = hashToken(token)
  const expiresAt = Math.floor(Date.now() / 1000) + EMAIL_VERIFICATION_TTL_SECONDS

  await db.query('DELETE FROM email_verification_tokens WHERE account_id = $1 AND consumed_at IS NULL', [accountId])
  await db.query(
    'INSERT INTO email_verification_tokens (id, account_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [uuid(), accountId, tokenHash, expiresAt]
  )

  return token
}

async function createPasswordResetToken(db, accountId) {
  const token = createRawToken()
  const tokenHash = hashToken(token)
  const expiresAt = Math.floor(Date.now() / 1000) + PASSWORD_RESET_TTL_SECONDS

  await db.query('DELETE FROM password_reset_tokens WHERE account_id = $1 AND consumed_at IS NULL', [accountId])
  await db.query(
    'INSERT INTO password_reset_tokens (id, account_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [uuid(), accountId, tokenHash, expiresAt]
  )

  return token
}

async function blacklistToken(db, jti) {
  if (!jti) return
  const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
  await db.query('INSERT INTO jwt_blacklist (jti, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING', [jti, expiresAt])
}

export default async function authRoutes(fastify) {
  fastify.post('/api/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email', 'password', 'confirmPassword'],
        properties: {
          name: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          confirmPassword: { type: 'string', minLength: 8 }
        }
      }
    }
  }, async (req, reply) => {
    const { name, email, password, confirmPassword } = req.body
    const db = getDb()

    if (password !== confirmPassword) {
      return reply.code(400).send({ error: 'Passwort und Passwort-Bestaetigung stimmen nicht ueberein' })
    }

    const { rows: [existing] } = await db.query('SELECT id FROM accounts WHERE email = $1', [email])
    if (existing) {
      return reply.code(409).send({ error: 'E-Mail bereits registriert' })
    }

    const password_hash = await bcrypt.hash(password, 10)
    const id = uuid()

    await db.query(
      'INSERT INTO accounts (id, name, email, password_hash, email_verified, email_verification_required) VALUES ($1, $2, $3, $4, 0, 1)',
      [id, name, email, password_hash]
    )

    const verificationToken = await createEmailVerificationToken(db, id)
    const mailResult = await sendAuthEmail({ type: 'verify-email', to: email, name, token: verificationToken, fastify, req })

    await logAudit(db, { accountId: id, role: 'user', action: 'register', resource: 'account', resourceId: id, ip: req.ip })
    await logAudit(db, {
      accountId: id, role: 'system', action: 'mail_delivery', resource: 'mail', resourceId: email,
      details: { type: 'verify-email', to: email, delivered: mailResult.delivered, skipped: mailResult.skipped ?? false, host: mailResult.config?.host, port: mailResult.config?.port, messageId: mailResult.messageId, smtpResponse: mailResult.smtpResponse, error: mailResult.error, smtpCode: mailResult.smtpCode },
      ip: req.ip
    })

    const roles = ['user']
    const response = {
      message: 'Registrierung erfolgreich. Bitte bestaetigen Sie Ihre E-Mail-Adresse.',
      requiresEmailVerification: true,
      account: { id, name, email, role: 'user', roles, verified: 0, email_verified: 0, email_verification_required: 1 }
    }

    if (shouldExposeAuthTokens()) {
      response.verificationToken = verificationToken
    }

    return reply.code(201).send(response)
  })

  fastify.post('/api/auth/verify-email', {
    schema: {
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', minLength: 32 }
        }
      }
    }
  }, async (req, reply) => {
    const { token } = req.body
    const db = getDb()
    const now = Math.floor(Date.now() / 1000)
    const tokenHash = hashToken(token)

    const { rows: [verification] } = await db.query(`
      SELECT evt.id, evt.account_id, a.email, a.pending_email, a.name
      FROM email_verification_tokens evt
      JOIN accounts a ON a.id = evt.account_id
      WHERE evt.token_hash = $1
        AND evt.consumed_at IS NULL
        AND evt.expires_at >= $2
    `, [tokenHash, now])

    if (!verification) {
      return reply.code(400).send({ error: 'Ungueltiger oder abgelaufener Bestaetigungslink' })
    }

    await db.query('UPDATE email_verification_tokens SET consumed_at = $1 WHERE id = $2', [now, verification.id])
    
    if (verification.pending_email) {
      await db.query(
        'UPDATE accounts SET email = pending_email, pending_email = NULL, email_verified = 1, email_verified_at = CURRENT_TIMESTAMP WHERE id = $1',
        [verification.account_id]
      )
    } else {
      await db.query(
        'UPDATE accounts SET email_verified = 1, email_verified_at = CURRENT_TIMESTAMP WHERE id = $1',
        [verification.account_id]
      )
    }

    await logAudit(db, {
      accountId: verification.account_id,
      role: 'user',
      action: 'verify_email',
      resource: 'account',
      resourceId: verification.account_id,
      ip: req.ip
    })

    return { message: 'E-Mail-Adresse bestaetigt' }
  })

  fastify.post('/api/auth/forgot-password', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      }
    },
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes'
      }
    }
  }, async (req) => {
    const { email } = req.body
    const db = getDb()
    const genericResponse = { message: 'Falls ein passender Account existiert, wurde ein Link zum Zuruecksetzen versendet.' }

    const { rows: [account] } = await db.query('SELECT id, name, email FROM accounts WHERE email = $1', [email])
    if (!account) {
      return genericResponse
    }

    const resetToken = await createPasswordResetToken(db, account.id)
    const resetMailResult = await sendAuthEmail({ type: 'reset-password', to: account.email, name: account.name, token: resetToken, fastify, req })
    await logAudit(db, { accountId: account.id, role: 'user', action: 'forgot_password', resource: 'account', resourceId: account.id, ip: req.ip })
    await logAudit(db, {
      accountId: account.id, role: 'system', action: 'mail_delivery', resource: 'mail', resourceId: account.email,
      details: { type: 'reset-password', to: account.email, delivered: resetMailResult.delivered, skipped: resetMailResult.skipped ?? false, host: resetMailResult.config?.host, port: resetMailResult.config?.port, messageId: resetMailResult.messageId, smtpResponse: resetMailResult.smtpResponse, error: resetMailResult.error, smtpCode: resetMailResult.smtpCode },
      ip: req.ip
    })

    if (shouldExposeAuthTokens()) {
      return { ...genericResponse, resetToken }
    }

    return genericResponse
  })

  fastify.post('/api/auth/reset-password', {
    schema: {
      body: {
        type: 'object',
        required: ['token', 'password', 'confirmPassword'],
        properties: {
          token: { type: 'string', minLength: 32 },
          password: { type: 'string', minLength: 8 },
          confirmPassword: { type: 'string', minLength: 8 }
        }
      }
    }
  }, async (req, reply) => {
    const { token, password, confirmPassword } = req.body
    const db = getDb()

    if (password !== confirmPassword) {
      return reply.code(400).send({ error: 'Passwort und Passwort-Bestaetigung stimmen nicht ueberein' })
    }

    const now = Math.floor(Date.now() / 1000)
    const tokenHash = hashToken(token)
    const { rows: [resetRequest] } = await db.query(`
      SELECT prt.id, prt.account_id
      FROM password_reset_tokens prt
      WHERE prt.token_hash = $1
        AND prt.consumed_at IS NULL
        AND prt.expires_at >= $2
    `, [tokenHash, now])

    if (!resetRequest) {
      return reply.code(400).send({ error: 'Ungueltiger oder abgelaufener Reset-Link' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    await db.query('UPDATE password_reset_tokens SET consumed_at = $1 WHERE id = $2', [now, resetRequest.id])
    await db.query('UPDATE accounts SET password_hash = $1 WHERE id = $2', [passwordHash, resetRequest.account_id])

    await logAudit(db, {
      accountId: resetRequest.account_id,
      role: 'user',
      action: 'reset_password',
      resource: 'account',
      resourceId: resetRequest.account_id,
      ip: req.ip
    })

    return { message: 'Passwort erfolgreich aktualisiert' }
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

    if ((account.email_verification_required ?? 0) === 1 && (account.email_verified ?? 0) !== 1) {
      return reply.code(403).send({ error: 'Bitte bestaetigen Sie zuerst Ihre E-Mail-Adresse' })
    }

    const roleStr = account.role ?? 'user'
    const roles = roleStr.split(',').map(r => r.trim())
    const role = roles[0]
    const verified = account.verified ?? 0

    await logAudit(db, { accountId: account.id, role, action: 'login', resource: 'account', resourceId: account.id, ip: req.ip })

    const jti = crypto.randomUUID()
    const token = fastify.jwt.sign({ accountId: account.id, name: account.name, email: account.email, role, roles, verified, jti })
    return { token, account: { id: account.id, name: account.name, email: account.email, role, roles, verified, email_verified: account.email_verified ?? 0 } }
  })

  // Logout — blacklist the JWT token
  fastify.post('/api/auth/logout', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { jti } = req.user
    if (!jti) return reply.code(400).send({ error: 'Invalid token' })

    await blacklistToken(db, jti)

    await logAudit(db, { accountId: req.user.accountId, role: req.user.role, action: 'logout', resource: 'account', resourceId: req.user.accountId, ip: req.ip })
    return reply.code(204).send()
  })

  // Token refresh — issue new JWT with current role from DB
  fastify.post('/api/auth/refresh', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { rows: [account] } = await db.query(
      'SELECT id, name, email, role, verified, email_verified FROM accounts WHERE id = $1',
      [req.user.accountId]
    )
    if (!account) return reply.code(404).send({ error: 'Account nicht gefunden' })
    const roleStr = account.role ?? 'user'
    const roles = roleStr.split(',').map(r => r.trim())
    const role = roles[0]
    const verified = account.verified ?? 0
    const jti = crypto.randomUUID()
    const token = fastify.jwt.sign({ accountId: account.id, name: account.name, email: account.email, role, roles, verified, jti })
    return { token, account: { id: account.id, name: account.name, email: account.email, role, roles, verified } }
  })

  // Vet/authority requests verification with optional document
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
              if (buffer.length > 10 * 1024 * 1024) {
                return reply.code(413).send({ error: 'Datei zu groß (max 10MB)' })
              }
              const fileType = await fileTypeFromBuffer(buffer)
              const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
              if (!fileType || !allowedMimes.includes(fileType.mime)) {
                return reply.code(415).send({ error: 'Ungültiger Dateityp (nur Bilder/PDF erlaubt)' })
              }

              const filepath = getUploadPath(docFilename)
              const dirPath = dirname(filepath)
              mkdirSync(dirPath, { recursive: true })
              writeFileSync(filepath, buffer)
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

  // Read own profile
  fastify.get('/api/accounts/me', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { rows: [account] } = await db.query('SELECT id, name, email, pending_email, role, verified, verification_status, email_verified, email_verification_required, gemini_model, claude_model, created_at, system_fallback_enabled, billing_consent_accepted_at FROM accounts WHERE id = $1', [req.user.accountId])
    if (!account) return reply.code(404).send({ error: 'Account nicht gefunden' })
    const roles = (account.role ?? 'user').split(',').map(r => r.trim())
    const { rows: [fullAccount] } = await db.query('SELECT gemini_token, anthropic_token, openai_token, gladia_token, ai_provider_priority FROM accounts WHERE id = $1', [account.id])
    return { ...account, roles,
      has_gemini_token: !!fullAccount?.gemini_token,
      has_anthropic_token: !!fullAccount?.anthropic_token,
      has_openai_token: !!fullAccount?.openai_token,
      has_gladia_token: !!fullAccount?.gladia_token,
      ai_provider_priority: fullAccount?.ai_provider_priority ?? null,
      has_system_ai: await getSystemAiKeys(db).then(k => !!(k.geminiKey || k.anthropicKey || k.openaiKey)).catch(() => false)
    }
  })

  // Update own profile
  fastify.patch('/api/accounts/me', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { name, email, password, currentPassword, gemini_token, gemini_model, anthropic_token, claude_model, openai_token, openai_model, gladia_token, ai_provider_priority, system_fallback_enabled, billing_consent_accepted_at } = req.body
    const accountId = req.user.accountId
    const updates = []
    const vals = []

    // Name change
    if (name !== undefined) {
      vals.push(name)
      updates.push(`name = $${vals.length}`)
    }

    // Email change
    if (email !== undefined && email !== req.user.email) {
      const lowerEmail = email.toLowerCase()
      // Check if email already exists as primary or pending for someone else
      const { rows: [existing] } = await db.query(
        'SELECT id FROM accounts WHERE (email = $1 OR pending_email = $1) AND id != $2',
        [lowerEmail, accountId]
      )
      if (existing) {
        return reply.code(409).send({ error: 'E-Mail bereits von einem anderen Account verwendet' })
      }
      vals.push(lowerEmail)
      updates.push(`pending_email = $${vals.length}`)
    }

    // Password change
    if (password !== undefined) {
      if (!currentPassword) {
        return reply.code(400).send({ error: 'Aktuelles Passwort erforderlich, um das Passwort zu ändern' })
      }
      const { rows: [account] } = await db.query('SELECT password_hash FROM accounts WHERE id = $1', [accountId])
      const valid = await bcrypt.compare(currentPassword, account.password_hash)
      if (!valid) {
        return reply.code(401).send({ error: 'Aktuelles Passwort ist nicht korrekt' })
      }
      if (password.length < 8) {
        return reply.code(400).send({ error: 'Das neue Passwort muss mindestens 8 Zeichen lang sein' })
      }
      const passwordHash = await bcrypt.hash(password, 10)
      vals.push(passwordHash)
      updates.push(`password_hash = $${vals.length}`)
    }

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
    if (gladia_token !== undefined) {
      vals.push(gladia_token ? encrypt(gladia_token) : null)
      updates.push(`gladia_token = $${vals.length}`)
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
    if (system_fallback_enabled !== undefined) {
      vals.push(system_fallback_enabled ? 1 : 0)
      updates.push(`system_fallback_enabled = $${vals.length}`)
    }
    if (billing_consent_accepted_at !== undefined) {
      vals.push(billing_consent_accepted_at)
      updates.push(`billing_consent_accepted_at = $${vals.length}`)
    }

    if (!updates.length) return reply.code(400).send({ error: 'Keine Änderungen' })

    vals.push(accountId)
    await db.query(`UPDATE accounts SET ${updates.join(', ')} WHERE id = $${vals.length}`, vals)

    let verificationToken = null
    if (email !== undefined && email !== req.user.email) {
      verificationToken = await createEmailVerificationToken(db, accountId)
      await sendAuthEmail({
        type: 'verify-email',
        to: email.toLowerCase(),
        name: name || req.user.name,
        token: verificationToken,
        fastify,
        req
      })
    }

    await logAudit(db, {
      accountId,
      role: req.user.role,
      action: 'update_profile',
      resource: 'account',
      resourceId: accountId,
      details: {
        name_changed: name !== undefined,
        email_changed: email !== undefined && email !== req.user.email,
        password_changed: password !== undefined
      },
      ip: req.ip
    })

    const response = { message: 'Profil aktualisiert' }
    if (email !== undefined && email !== req.user.email) {
      response.emailChanged = true
      if (shouldExposeAuthTokens()) {
        response.verificationToken = verificationToken
      }
    }

    return response
  })

  // Delete account (GDPR Art. 17)
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

    // Blacklist current token if jti is present
    await blacklistToken(db, req.user.jti)

    await db.query('DELETE FROM org_memberships WHERE account_id = $1 OR invited_by = $2', [accountId, accountId])
    await db.query('DELETE FROM organizations WHERE owner_id = $1', [accountId])
    await db.query('UPDATE documents SET added_by_account = NULL WHERE added_by_account = $1', [accountId])
    await db.query('DELETE FROM audit_log WHERE account_id = $1', [accountId])
    await db.query('DELETE FROM accounts WHERE id = $1', [accountId])
    return reply.code(204).send()
  })

  // GDPR data export (takeout) — returns a ZIP with all animal and document data
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
        // Additional pages
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

  // User API Keys Management
  fastify.get('/api/accounts/api-keys', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { accountId } = req.user
    const { rows: keys } = await db.query(`
      SELECT id, description, created_at, last_used_at, key_hash
      FROM api_keys WHERE account_id = $1
      ORDER BY created_at DESC
    `, [accountId])
    // Return masked key hashes (show only first 15 chars)
    return { keys: keys.map(k => ({ ...k, key_prefix: k.key_hash.substring(0, 15) + '***' })) }
  })

  fastify.post('/api/accounts/api-keys', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { accountId } = req.user
    const { description = 'API Key' } = req.body

    const { raw, hash } = generateApiKey()
    const id = uuid()
    await db.query(`
      INSERT INTO api_keys (id, account_id, key_hash, description, rate_limit)
      VALUES ($1, $2, $3, $4, 1000)
    `, [id, accountId, hash, description])

    await logAudit(db, { accountId, role: req.user.role, action: 'create_api_key', resource: 'api_key', resourceId: id, ip: req.ip })

    reply.code(201).send({ id, raw, description, created_at: new Date().toISOString() })
  })

  fastify.delete('/api/accounts/api-keys/:id', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { accountId } = req.user
    const { id } = req.params

    const { rows: [key] } = await db.query('SELECT account_id FROM api_keys WHERE id = $1', [id])
    if (!key) return reply.code(404).send({ error: 'API Key nicht gefunden' })
    if (key.account_id !== accountId) return reply.code(403).send({ error: 'Keine Berechtigung' })

    await db.query('DELETE FROM api_keys WHERE id = $1', [id])
    await logAudit(db, { accountId, role: req.user.role, action: 'delete_api_key', resource: 'api_key', resourceId: id, ip: req.ip })

    return reply.code(204).send()
  })

  // OAuth Provider Status — GET /api/auth/oauth/providers (public)
  fastify.get('/api/auth/oauth/providers', async (_req, reply) => {
    const providers = {}
    for (const [name, config] of Object.entries(OAUTH_PROVIDERS)) {
      providers[name] = !!process.env[config.clientIdEnv]
    }
    const db = getDb()
    const { rows: supabaseUrlRows } = await db.query("SELECT value FROM settings WHERE key = 'supabase_url'")
    providers.supabase = !!(supabaseUrlRows[0]?.value || await getSupabaseSecret(db))
    return reply.send(providers)
  })

  // OAuth Login — GET /api/auth/oauth/:provider
  fastify.get('/api/auth/oauth/:provider', async (req, reply) => {
    const { provider } = req.params
    const config = OAUTH_PROVIDERS[provider]
    if (!config) return reply.code(404).send({ error: 'Unknown provider' })

    const clientId = process.env[config.clientIdEnv]
    if (!clientId) return reply.code(503).send({ error: `OAuth provider '${provider}' not configured` })

    // Clean up stale states older than 10 minutes
    for (const [k, v] of oauthStates.entries()) {
      if (Date.now() - v.createdAt > 10 * 60 * 1000) oauthStates.delete(k)
    }

    const state = crypto.randomBytes(16).toString('hex')
    oauthStates.set(state, { provider, createdAt: Date.now() })

    const serverUrl = process.env.BASE_URL || `${req.protocol}://${req.hostname}`
    const callbackUrl = `${serverUrl}/api/auth/oauth/${provider}/callback`

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: config.scopes,
      state
    })

    return reply.redirect(`${config.authUrl}?${params}`)
  })

  // OAuth Callback — GET /api/auth/oauth/:provider/callback
  fastify.get('/api/auth/oauth/:provider/callback', async (req, reply) => {
    const { provider } = req.params
    const { code, state, error: oauthError } = req.query
    const config = OAUTH_PROVIDERS[provider]
    const pwaBase = process.env.PWA_URL || '/'

    if (!config) return reply.redirect(`${pwaBase}?oauthError=unknown_provider`)
    if (oauthError) return reply.redirect(`${pwaBase}?oauthError=${encodeURIComponent(oauthError)}`)

    const stateData = oauthStates.get(state)
    if (!stateData || stateData.provider !== provider) {
      return reply.redirect(`${pwaBase}?oauthError=invalid_state`)
    }
    oauthStates.delete(state)

    const clientId = process.env[config.clientIdEnv]
    const clientSecret = process.env[config.clientSecretEnv]
    const serverUrl = process.env.BASE_URL || `${req.protocol}://${req.hostname}`
    const callbackUrl = `${serverUrl}/api/auth/oauth/${provider}/callback`

    // Exchange code for access token
    let tokenData
    try {
      const tokenRes = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: callbackUrl, grant_type: 'authorization_code' })
      })
      tokenData = await tokenRes.json()
    } catch {
      return reply.redirect(`${pwaBase}?oauthError=token_exchange_failed`)
    }

    if (tokenData.error || !tokenData.access_token) {
      return reply.redirect(`${pwaBase}?oauthError=${encodeURIComponent(tokenData.error || 'no_token')}`)
    }

    // Fetch user profile
    let userInfo
    try {
      const infoRes = await fetch(config.userInfoUrl, {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' }
      })
      userInfo = await infoRes.json()
    } catch {
      return reply.redirect(`${pwaBase}?oauthError=userinfo_failed`)
    }

    // Extract email, name, providerId
    let email, name, providerId
    if (provider === 'google') {
      email = userInfo.email
      name = userInfo.name
      providerId = userInfo.sub
    } else if (provider === 'github') {
      providerId = String(userInfo.id)
      name = userInfo.name || userInfo.login
      email = userInfo.email
      if (!email) {
        try {
          const emailsRes = await fetch('https://api.github.com/user/emails', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
          })
          const emails = await emailsRes.json()
          const primary = emails.find(e => e.primary && e.verified)
          email = primary?.email
        } catch { /* ignore */ }
      }
    } else if (provider === 'microsoft') {
      email = userInfo.mail || userInfo.userPrincipalName
      name = userInfo.displayName
      providerId = userInfo.id
    }

    if (!email) return reply.redirect(`${pwaBase}?oauthError=no_email`)

    const db = getDb()

    // Find existing OAuth link
    let { rows: [oauthRow] } = await db.query(
      'SELECT account_id FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
      [provider, String(providerId)]
    )

    let accountId
    if (oauthRow) {
      accountId = oauthRow.account_id
    } else {
      // Find or create account by email
      let { rows: [existingAccount] } = await db.query('SELECT id FROM accounts WHERE LOWER(email) = LOWER($1)', [email])

      if (!existingAccount) {
        accountId = uuid()
        const displayName = name || email.split('@')[0]
        await db.query(
          `INSERT INTO accounts (id, name, email, password_hash, role, verified, email_verified, created_at)
           VALUES ($1, $2, $3, '', 'user', 0, 1, NOW())`,
          [accountId, displayName, email.toLowerCase()]
        )
      } else {
        accountId = existingAccount.id
      }

      await db.query(
        'INSERT INTO oauth_accounts (id, account_id, provider, provider_user_id, email) VALUES ($1, $2, $3, $4, $5)',
        [uuid(), accountId, provider, String(providerId), email.toLowerCase()]
      )
    }

    const { rows: [account] } = await db.query('SELECT id, name, email, role, verified FROM accounts WHERE id = $1', [accountId])

    const jti = uuid()
    const token = await fastify.jwt.sign({ accountId: account.id, role: account.role, jti })

    await logAudit(db, { accountId: account.id, role: account.role, action: 'oauth_login', resource: 'account', resourceId: account.id, details: { provider }, ip: req.ip })

    return reply.redirect(`${pwaBase}?oauthToken=${token}`)
  })

  async function createPawSession(db, payload, ip) {
    const email = payload.email
    if (!email) throw new Error('Keine E-Mail im Token')
    let { rows: [account] } = await db.query('SELECT id, name, email, role, verified FROM accounts WHERE LOWER(email) = LOWER($1)', [email])
    if (!account) {
      const accountId = uuid()
      const displayName = payload.user_metadata?.full_name || payload.user_metadata?.name || email.split('@')[0]
      await db.query(
        `INSERT INTO accounts (id, name, email, password_hash, role, verified, email_verified, created_at)
         VALUES ($1, $2, $3, '', 'user', 0, 1, NOW())`,
        [accountId, displayName, email.toLowerCase()]
      )
      account = { id: accountId, name: displayName, email: email.toLowerCase(), role: 'user', verified: 0 }
    }
    const jti = uuid()
    const token = await fastify.jwt.sign({ accountId: account.id, role: account.role, jti })
    await logAudit(db, { accountId: account.id, role: account.role, action: 'supabase_login', resource: 'account', resourceId: account.id, ip })
    return { token, account }
  }

  // Supabase link proxy — prevents email clients from consuming one-time tokens
  fastify.get('/api/auth/confirm', async (req, reply) => {
    const { token, token_hash, type, redirect_to } = req.query
    if (!(token || token_hash) || !type) return reply.code(400).send({ error: 'Token und Type sind erforderlich' })

    const db = getDb()

    const ua = req.headers['user-agent'] || ''
    const isBot = /bot|crawl|spider|google|bing|yahoo|baidu|yandex|facebook|twitter|slack|linkedin|prefetch|preview|scan/i.test(ua)
    logAudit(db, {
      action: 'auth.confirm.visit',
      resource: 'auth',
      ip: req.ip,
      details: { type, redirect_to, user_agent: ua, suspected_bot: isBot }
    }).catch(() => {})

    const { rows: urlRows } = await db.query("SELECT value FROM settings WHERE key = 'supabase_url'")
    const supabaseUrl = urlRows[0]?.value || process.env.SUPABASE_URL
    if (!supabaseUrl) return reply.code(500).send({ error: 'SUPABASE_URL nicht konfiguriert' })

    const dest = new URL(`${supabaseUrl}/auth/v1/verify`)
    
    // Alle relevanten Parameter (wie email, token, token_hash) 1:1 durchschleifen
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 'redirect_to' && value !== undefined) {
        dest.searchParams.set(key, value)
      }
    }

    const defaultRedirect = type === 'recovery'
      ? (process.env.SUPABASE_RECOVERY_REDIRECT_URL || process.env.PWA_URL || '/')
      : (process.env.PWA_URL || '/')
    dest.searchParams.set('redirect_to', redirect_to || defaultRedirect)

    const labels = {
      signup:       'E-Mail-Adresse bestätigen',
      recovery:     'Passwort zurücksetzen',
      email_change: 'Neue E-Mail-Adresse bestätigen',
      invite:       'Einladung annehmen',
    }
    const label = labels[type] ?? 'Fortfahren'
    const href = dest.toString()

    reply.type('text/html').send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vetzsucht</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#000;color:#fff;font-family:'Arial Black',sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{text-align:center;padding:60px 80px;border:1px solid #222;border-radius:24px}
  h1{font-size:clamp(20px,4vw,40px);margin-bottom:.4em;letter-spacing:-.02em}
  p{color:#888;font-size:14px;margin-bottom:2em}
  button{display:inline-block;background:#e8ff00;color:#000;font-weight:900;
    font-size:18px;padding:16px 40px;border-radius:12px;border:none;cursor:pointer;
    text-transform:uppercase;letter-spacing:-.01em;font-family:inherit}
  button:hover{opacity:.85}
</style>
</head>
<body>
  <div class="card">
    <h1>Vetzsucht</h1>
    <p>Klicke auf den Button, um fortzufahren.</p>
    <form method="POST" action="/api/auth/confirm">
      <input type="hidden" name="dest" value="${href}">
      <button type="submit">${label}</button>
    </form>
  </div>
</body>
</html>`)
  })

  fastify.post('/api/auth/confirm', async (req, reply) => {
    const { dest } = req.body || {}
    if (!dest) return reply.code(400).send({ error: 'Ungültige Anfrage' })
    let destUrl
    try { destUrl = new URL(dest) } catch { return reply.code(400).send({ error: 'Ungültige URL' }) }
    const db = getDb()
    const { rows: urlRows } = await db.query("SELECT value FROM settings WHERE key = 'supabase_url'")
    const supabaseUrl = urlRows[0]?.value || process.env.SUPABASE_URL || ''
    const allowedHost = supabaseUrl ? new URL(supabaseUrl).hostname : null
    if (!allowedHost || destUrl.hostname !== allowedHost) {
      return reply.code(400).send({ error: 'Ungültige Zieladresse' })
    }
    return reply.redirect(destUrl.toString())
  })

  // Supabase Auth Handshake — POST /api/auth/supabase
  fastify.post('/api/auth/supabase', async (req, reply) => {
    const { token } = req.body || {}
    if (!token) return reply.code(400).send({ error: 'Token fehlt' })

    const db = getDb()

    let payload
    try {
      const headerRaw = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'))
      if (headerRaw.alg === 'RS256') {
        payload = await verifyJwtRS256(token)
      } else {
        const supabaseSecret = await getSupabaseSecret(db)
        if (!supabaseSecret) return reply.code(503).send({ error: 'Supabase nicht konfiguriert (kein HS256 Secret)' })
        payload = verifyJwtHS256(token, supabaseSecret)
      }
    } catch {
      return reply.code(401).send({ error: 'Ungültiges Supabase-Token' })
    }

    try {
      return await createPawSession(db, payload, req.ip)
    } catch {
      return reply.code(400).send({ error: 'Keine E-Mail im Token' })
    }
  })

  // Supabase Email+Password Login — POST /api/auth/supabase/password
  fastify.post('/api/auth/supabase/password', async (req, reply) => {
    const { email, password } = req.body || {}
    if (!email || !password) return reply.code(400).send({ error: 'E-Mail und Passwort erforderlich' })

    const db = getDb()
    const { rows: urlRows } = await db.query("SELECT value FROM settings WHERE key = 'supabase_url'")
    const { rows: keyRows } = await db.query("SELECT value FROM settings WHERE key = 'supabase_anon_key'")
    const supabaseUrl = urlRows[0]?.value
    const supabaseAnonKey = keyRows[0]?.value
    if (!supabaseUrl || !supabaseAnonKey) return reply.code(503).send({ error: 'Supabase nicht konfiguriert' })

    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
      body: JSON.stringify({ email, password })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return reply.code(401).send({ error: err.error_description || err.msg || 'Supabase-Login fehlgeschlagen' })
    }

    const { access_token } = await res.json()
    let payload
    try {
      const headerRaw = JSON.parse(Buffer.from(access_token.split('.')[0], 'base64url').toString('utf8'))
      payload = headerRaw.alg === 'RS256'
        ? await verifyJwtRS256(access_token)
        : verifyJwtHS256(access_token, await getSupabaseSecret(db))
    } catch {
      return reply.code(401).send({ error: 'Token-Verifikation fehlgeschlagen' })
    }

    return createPawSession(db, payload, req.ip)
  })

  // Supabase Password Reset — POST /api/auth/supabase/reset-password
  fastify.post('/api/auth/supabase/reset-password', async (req, reply) => {
    const { accessToken, password, confirmPassword } = req.body || {}
    if (!accessToken || !password) return reply.code(400).send({ error: 'accessToken und password erforderlich' })
    if (password !== confirmPassword) return reply.code(400).send({ error: 'Passwörter stimmen nicht überein' })
    if (password.length < 8) return reply.code(400).send({ error: 'Passwort muss mindestens 8 Zeichen haben' })

    const db = getDb()
    const { rows: urlRows } = await db.query("SELECT value FROM settings WHERE key = 'supabase_url'")
    const { rows: keyRows } = await db.query("SELECT value FROM settings WHERE key = 'supabase_anon_key'")
    const supabaseUrl = urlRows[0]?.value || process.env.SUPABASE_URL
    const supabaseAnonKey = keyRows[0]?.value
    if (!supabaseUrl) return reply.code(503).send({ error: 'Supabase nicht konfiguriert' })

    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        ...(supabaseAnonKey ? { apikey: supabaseAnonKey } : {}),
      },
      body: JSON.stringify({ password }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return reply.code(400).send({ error: err.message || err.msg || 'Passwort konnte nicht aktualisiert werden' })
    }

    return { message: 'Passwort erfolgreich geändert' }
  })

  // Pending background tasks (documents + voice memos not yet completed/failed)
  fastify.get('/api/accounts/me/pending-tasks', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const db = getDb()
    const { accountId } = req.user

    const { rows } = await db.query(`
      SELECT 'document' AS type, d.id, d.analysis_status, a.name AS animal_name, a.id AS animal_id, d.created_at,
             NULL AS error_message, FALSE AS recently_failed
      FROM documents d JOIN animals a ON a.id = d.animal_id
      WHERE a.account_id = $1
        AND d.analysis_status NOT IN ('completed', 'failed')
      UNION ALL
      SELECT 'voice_memo', v.id, v.analysis_status, a.name, a.id, v.created_at,
             NULL AS error_message, FALSE AS recently_failed
      FROM voice_memos v JOIN animals a ON a.id = v.animal_id
      WHERE v.account_id = $1
        AND v.analysis_status NOT IN ('completed', 'failed')
      UNION ALL
      SELECT 'voice_memo', v.id, v.analysis_status, a.name, a.id, v.created_at,
             v.error_message, TRUE AS recently_failed
      FROM voice_memos v JOIN animals a ON a.id = v.animal_id
      WHERE v.account_id = $1
        AND v.analysis_status = 'failed'
        AND v.created_at::timestamp > (CURRENT_TIMESTAMP - INTERVAL '10 minutes')
      ORDER BY created_at DESC
    `, [accountId])

    return reply.send({ total: rows.length, items: rows })
  })
}
