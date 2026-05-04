import 'dotenv/config'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyWs from '@fastify/websocket'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { initDb, getDb } from './db/index.js'
import authRoutes from './routes/auth.js'
import animalRoutes from './routes/animals.js'
import documentRoutes from './routes/documents.js'
import adminRoutes from './routes/admin.js'
import organizationRoutes from './routes/organizations.js'
import wsDocumentUpload from './ws/documentUpload.js'
import settingsRoutes from './routes/settings.js'
import aiRoutes from './routes/ai.js'
import vetApiRoutes from './routes/vetApi.js'
import { setOcrLogger } from './services/ocr.js'
import { logAudit } from './services/audit.js'

const __dir = dirname(fileURLToPath(import.meta.url))

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  },
  disableRequestLogging: true,
  trustProxy: true,
  bodyLimit: 10 * 1024 * 1024 // 10MB für Bild-Uploads
})

// Inject structured logger into OCR service
setOcrLogger(fastify.log.child({ name: 'ocr' }))

// JWT Secret Guard
const jwtSecret = process.env.JWT_SECRET
const INSECURE_DEFAULTS = ['changeme', 'change-this-in-production', '']
if (!jwtSecret || INSECURE_DEFAULTS.includes(jwtSecret)) {
  fastify.log.error('FATAL: JWT_SECRET env var missing or insecure. Server will not start.')
  process.exit(1)
}

// Plugins
await fastify.register(fastifyCors, {
  origin: ['https://paw.oxs.at', 'https://pawapi.oxs.at', 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true
})
await fastify.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    }
  }
})
await fastify.register(fastifyJwt, { secret: jwtSecret, sign: { expiresIn: '7d' } })
await fastify.register(fastifyRateLimit, {
  max: 100,
  timeWindow: '1 minute'
})
await fastify.register(fastifyWs)

const uploadsRoot = process.env.UPLOADS_DIR
  ? resolve(process.env.UPLOADS_DIR)
  : join(__dir, '..', 'uploads')
await fastify.register(fastifyStatic, {
  root: uploadsRoot,
  prefix: '/uploads/'
})

await fastify.register(fastifySwagger, {
  openapi: {
    info: { title: 'PAW API', description: 'Digitaler Tierimpfpass REST API', version: '1.0.0' },
    servers: [
      { url: 'https://pawapi.oxs.at', description: 'Production API Server' },
      { url: 'http://localhost:3000', description: 'Local Development' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    },
    security: [{ bearerAuth: [] }]
  }
})

await fastify.register(fastifySwaggerUi, {
  routePrefix: '/documentation'
})

// JWT-Authenticate Decorator für geschützte Routen
fastify.decorate('authenticate', async function (req, reply) {
  try {
    await req.jwtVerify()
  } catch (err) {
    return reply.code(401).send({ error: 'Nicht autorisiert' })
  }
})

// JWT Blacklist Check — prevent use of logged-out tokens
fastify.addHook('preHandler', async (req, reply) => {
  if (req.user?.jti) {
    const db = getDb()
    const blacklisted = db.prepare('SELECT jti FROM jwt_blacklist WHERE jti = ?').get(req.user.jti)
    if (blacklisted) {
      return reply.code(401).send({ error: 'Token has been revoked' })
    }
  }
})

// Capture error body for structured logging
fastify.addHook('onSend', async (req, reply, payload) => {
  if (reply.statusCode >= 400) {
    try {
      const body = typeof payload === 'string' ? JSON.parse(payload) : payload
      req.errorMessage = body?.error ?? null
    } catch { /* non-JSON payload */ }
  }
  return payload
})

// Structured request/response logging for every REST call
fastify.addHook('onResponse', (req, reply, done) => {
  const statusCode = reply.statusCode
  // Skip health checks and static assets to reduce noise
  if (req.url === '/health' || req.url.startsWith('/uploads/') || req.url.startsWith('/documentation')) {
    done()
    return
  }
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'
  const entry = {
    method: req.method,
    url: req.url,
    statusCode,
    responseTime: Math.round(reply.getResponseTime()),
    ip: req.ip,
    userId: req.user?.accountId ?? null,
    role: req.user?.role ?? null,
  }
  if (statusCode >= 400 && req.errorMessage) entry.errorMessage = req.errorMessage
  req.log[level](entry, 'request')

  // Log significant HTTP errors to audit log for debugging
  if (statusCode >= 400 && req.user?.accountId) {
    try {
      const db = getDb()
      logAudit(db, {
        accountId: req.user.accountId,
        role: req.user.role ?? null,
        action: 'http_error',
        resource: req.method + ' ' + req.url.split('?')[0],
        resourceId: req.url,
        details: { statusCode, errorMessage: req.errorMessage, method: req.method },
        ip: req.ip
      })
    } catch { /* audit logging failed, continue */ }
  }
  done()
})

// Global handler for validation and unhandled errors
fastify.setErrorHandler((error, req, reply) => {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500
  const message = statusCode >= 500 ? 'unhandled server error' : 'request error'
  req.log.error({
    method: req.method,
    url: req.url,
    statusCode,
    ip: req.ip,
    userId: req.user?.accountId ?? null,
    role: req.user?.role ?? null,
    err: { message: error.message, code: error.code },
  }, message)

  const responseError = statusCode >= 500
    ? 'Interner Serverfehler'
    : (error?.message || 'Ungueltige Anfrage')

  reply.code(statusCode).send({ error: responseError })
})

// Routen
await fastify.register(authRoutes)
await fastify.register(animalRoutes)
await fastify.register(documentRoutes)
await fastify.register(adminRoutes)
await fastify.register(organizationRoutes)
await fastify.register(wsDocumentUpload)
await fastify.register(settingsRoutes)
await fastify.register(aiRoutes)
await fastify.register(vetApiRoutes)

// Healthcheck
fastify.get('/health', async () => ({ status: 'ok' }))

// Start
const port = parseInt(process.env.PORT ?? '3000')
initDb(process.env.DB_PATH ?? './paw.db')

// Auto-Migration: Stelle sicher, dass neuere Spalten existieren
try {
  const db = getDb()
  const aCols = db.prepare('PRAGMA table_info(animals)').all().map(c => c.name)
  if (!aCols.includes('address')) db.prepare('ALTER TABLE animals ADD COLUMN address TEXT').run()
  if (!aCols.includes('dynamic_fields')) db.prepare('ALTER TABLE animals ADD COLUMN dynamic_fields TEXT').run()
  if (!aCols.includes('avatar_path')) db.prepare('ALTER TABLE animals ADD COLUMN avatar_path TEXT').run()
  if (!aCols.includes('is_archived')) db.prepare('ALTER TABLE animals ADD COLUMN is_archived INTEGER DEFAULT 0 NOT NULL').run()
  
  const sCols = db.prepare('PRAGMA table_info(animal_sharing)').all().map(c => c.name)
  if (!sCols.includes('share_address')) db.prepare('ALTER TABLE animal_sharing ADD COLUMN share_address INTEGER NOT NULL DEFAULT 0').run()
  if (!sCols.includes('share_dynamic_fields')) db.prepare('ALTER TABLE animal_sharing ADD COLUMN share_dynamic_fields INTEGER NOT NULL DEFAULT 0').run()

  const dCols = db.prepare('PRAGMA table_info(documents)').all().map(c => c.name)
  if (!dCols.includes('added_by_role')) db.prepare('ALTER TABLE documents ADD COLUMN added_by_role TEXT').run()
  if (!dCols.includes('added_by_account')) db.prepare('ALTER TABLE documents ADD COLUMN added_by_account TEXT').run()
  if (!dCols.includes('allowed_roles')) db.prepare('ALTER TABLE documents ADD COLUMN allowed_roles TEXT').run()

  const animalSharingTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'animal_sharing'").get()?.sql || ''
  const supportsGuestRole = animalSharingTableSql.includes("'guest'")
  const publicSharingRole = supportsGuestRole ? 'guest' : 'readonly'

  db.prepare(`
    INSERT OR IGNORE INTO animal_sharing (id, animal_id, role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields)
    SELECT lower(hex(randomblob(16))), a.id, ?, 0, 1, 1, 0, 0
    FROM animals a
    WHERE NOT EXISTS (
      SELECT 1 FROM animal_sharing s WHERE s.animal_id = a.id AND s.role = ?
    )
  `).run(publicSharingRole, publicSharingRole)

  // Role rename migration: readonly -> guest.
  if (supportsGuestRole) {
    db.prepare(`
      INSERT OR IGNORE INTO animal_sharing (id, animal_id, role, share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields)
      SELECT id, animal_id, 'guest', share_contact, share_breed, share_birthdate, share_address, share_dynamic_fields
      FROM animal_sharing
      WHERE role = 'readonly'
    `).run()
    db.prepare("DELETE FROM animal_sharing WHERE role = 'readonly'").run()
  }
  db.prepare("UPDATE documents SET allowed_roles = REPLACE(allowed_roles, '\"readonly\"', '\"guest\"') WHERE allowed_roles IS NOT NULL").run()
} catch (err) {
  console.warn('Migration warnings:', err.message)
}

// Bootstrap: ADMIN_EMAIL aus .env als Admin setzen
if (process.env.ADMIN_EMAIL) {
  const db = getDb()
  db.prepare('UPDATE accounts SET role = ?, verified = 1 WHERE email = ?')
    .run('admin', process.env.ADMIN_EMAIL)
  fastify.log.info({ email: process.env.ADMIN_EMAIL }, 'Admin-Rolle gesetzt')
}

// 90-Tage Audit-Log Retention Policy (täglicher Cleanup)
setInterval(() => {
  try {
    const db = getDb()
    const result = db.prepare("DELETE FROM audit_log WHERE created_at < datetime('now', '-90 days')").run()
    if (result.changes > 0) {
      fastify.log.info(`Retention: ${result.changes} alte Audit-Logs gelöscht (> 90 Tage)`)
    }
  } catch (err) {
    fastify.log.error({ err }, 'Fehler beim Cleanup der Audit-Logs')
  }
}, 1000 * 60 * 60 * 24)

try {
  await fastify.listen({ port, host: '0.0.0.0' })
  fastify.log.info({ port }, 'Server gestartet')
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
