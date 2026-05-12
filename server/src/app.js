import 'dotenv/config'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyWs from '@fastify/websocket'
import fastifyMultipart from '@fastify/multipart'
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
import tenantRoutes from './routes/tenants.js'
import organizationRoutes from './routes/organizations.js'
import wsDocumentUpload from './ws/documentUpload.js'
import settingsRoutes from './routes/settings.js'
import aiRoutes from './routes/ai.js'
import vetApiRoutes from './routes/vetApi.js'
import reminderRoutes from './routes/reminders.js'
import billingRoutes from './routes/billing.js'
import { setOcrLogger } from './services/ocr/index.js'
import { logAudit } from './services/audit.js'

const __dir = dirname(fileURLToPath(import.meta.url))

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  },
  disableRequestLogging: true,
  trustProxy: true,
  bodyLimit: 10 * 1024 * 1024 // 10MB for image uploads
})

const REDACTED_KEYS = ['password', 'token', 'authorization', 'cookie', 'secret', 'api_key', 'apikey', 'x-api-key', 'jwt']

function shouldSkipHttpAudit(url = '') {
  return (url === '/health' || url === '/api/health' || url.startsWith('/uploads/') || url.startsWith('/documentation'))
}

function isSensitiveKey(key = '') {
  const normalizedKey = String(key).toLowerCase()
  return REDACTED_KEYS.some((sensitiveKey) => normalizedKey.includes(sensitiveKey))
}

function sanitizeForAudit(value, depth = 0) {
  if (value === null || value === undefined) return value
  if (depth > 4) return '[max-depth]'
  if (typeof value === 'string') return value.length > 1500 ? `${value.slice(0, 1500)}...[truncated]` : value
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'function') return '[function]'
  if (Buffer.isBuffer(value)) return `[buffer:${value.length}]`
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeForAudit(item, depth + 1))
  if (typeof value === 'object') {
    const normalized = {}
    for (const [key, nestedValue] of Object.entries(value).slice(0, 40)) {
      normalized[key] = isSensitiveKey(key) ? '[redacted]' : sanitizeForAudit(nestedValue, depth + 1)
    }
    return normalized
  }
  return String(value)
}

function parseAuditPayload(payload) {
  if (payload === null || payload === undefined) return null
  if (typeof payload === 'string') {
    try {
      return sanitizeForAudit(JSON.parse(payload))
    } catch {
      return sanitizeForAudit(payload)
    }
  }
  return sanitizeForAudit(payload)
}

// Inject structured logger into OCR service
setOcrLogger(fastify.log.child({ name: 'ocr' }))

// JWT Secret Guard
const jwtSecret = process.env.JWT_SECRET
const INSECURE_DEFAULTS = ['changeme', 'change-this-in-production', '']
if (!jwtSecret || INSECURE_DEFAULTS.includes(jwtSecret)) {
  fastify.log.error('FATAL: JWT_SECRET env var missing or insecure. Server will not start.')
  process.exit(1)
}

// Plugins - CORS origins can be configured
const defaultCorsOrigins = ['https://paw.oxs.at', 'https://vetsucht.oxs.at', 'https://pawapi.oxs.at', 'http://localhost:5173', 'http://localhost:3000']
await fastify.register(fastifyCors, {
  origin: (origin, cb) => {
    // Allow requests from configured origins or localhost
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      cb(null, true)
    } else if (defaultCorsOrigins.includes(origin)) {
      cb(null, true)
    } else {
      // Strictly deny unknown origins in production-ready setup
      fastify.log.warn({ origin }, 'CORS origin denied')
      cb(new Error('Not allowed by CORS'), false)
    }
  },
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
  timeWindow: '1 minute',
  allowList: ['127.0.0.1', '::1', '::ffff:127.0.0.1']
})
await fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
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

// Also expose docs at /api/docs for convenience
fastify.get('/api/docs', (req, reply) => {
  reply.redirect('/documentation')
})

// Fastify v5: Allow empty JSON body (e.g. DELETE requests with Content-Type: application/json but no body)
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  if (!body || body.trim() === '') {
    done(null, undefined)
    return
  }
  try {
    done(null, JSON.parse(body))
  } catch (err) {
    err.statusCode = 400
    done(err, undefined)
  }
})

// JWT authenticate decorator for protected routes
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
    const { rows: [blacklisted] } = await db.query('SELECT jti FROM jwt_blacklist WHERE jti = $1', [req.user.jti])
    if (blacklisted) {
      return reply.code(401).send({ error: 'Token has been revoked' })
    }
  }
})

fastify.addHook('onRequest', async (req) => {
  if (shouldSkipHttpAudit(req.url)) {
    return
  }
  req.log.info({ method: req.method, url: req.url, ip: req.ip, requestId: req.id }, 'request_started')
})

// Capture response body for structured logging and admin debugging
fastify.addHook('onSend', async (req, reply, payload) => {
  req.auditResponseBody = parseAuditPayload(payload)
  if (reply.statusCode >= 400) {
    try {
      const body = typeof payload === 'string' ? JSON.parse(payload) : payload
      req.errorMessage = body?.error ?? null
    } catch { /* non-JSON payload */ }
  }
  return payload
})

// Structured request/response logging for every REST call
fastify.addHook('onResponse', async (req, reply) => {
  const statusCode = reply.statusCode
  if (shouldSkipHttpAudit(req.url)) {
    return
  }
  const requestPath = req.url.split('?')[0]
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'
  const entry = {
    method: req.method,
    url: req.url,
    statusCode,
    responseTime: Math.round(reply.elapsedTime),
    ip: req.ip,
    userId: req.user?.accountId ?? null,
    role: req.user?.role ?? null,
    requestId: req.id,
  }
  if (statusCode >= 400 && req.errorMessage) entry.errorMessage = req.errorMessage
  req.log[level](entry, 'request')

  try {
    const db = getDb()
    await logAudit(db, {
      accountId: req.user?.accountId ?? null,
      role: req.user?.role ?? null,
      action: 'http_request',
      resource: `${req.method} ${requestPath}`,
      resourceId: req.id,
      details: {
        method: req.method,
        url: req.url,
        route: requestPath,
        statusCode,
        responseTimeMs: Math.round(reply.elapsedTime),
        request: {
          headers: sanitizeForAudit(req.headers),
          query: sanitizeForAudit(req.query),
          params: sanitizeForAudit(req.params),
          body: sanitizeForAudit(req.body)
        },
        response: req.auditResponseBody,
        errorMessage: req.errorMessage ?? null
      },
      ip: req.ip
    })
  } catch { /* audit logging failed, continue */ }

  if (statusCode >= 400 && req.user?.accountId) {
    try {
      const db = getDb()
      await logAudit(db, {
        accountId: req.user.accountId,
        role: req.user.role ?? null,
        action: 'http_error',
        resource: `${req.method} ${requestPath}`,
        resourceId: req.id,
        details: {
          statusCode,
          errorMessage: req.errorMessage,
          method: req.method,
          url: req.url
        },
        ip: req.ip
      })
    } catch { /* audit logging failed, continue */ }
  }
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
await fastify.register(tenantRoutes)
await fastify.register(organizationRoutes)
await fastify.register(wsDocumentUpload)
await fastify.register(settingsRoutes)
await fastify.register(aiRoutes)
await fastify.register(vetApiRoutes)
await fastify.register(reminderRoutes)
await fastify.register(billingRoutes)

// Healthcheck
fastify.get('/health', async () => ({ status: 'ok' }))
fastify.get('/api/health', async () => ({ status: 'ok' }))

// Start
const port = parseInt(process.env.PORT ?? '3000')
await initDb(process.env.DATABASE_URL ?? 'postgresql://pawvax:pawvax@localhost:5432/pawvax')

// Bootstrap: ADMIN_EMAIL aus .env als Admin setzen
if (process.env.ADMIN_EMAIL) {
  const db = getDb()
  await db.query('UPDATE accounts SET role = $1, verified = 1 WHERE email = $2', ['admin', process.env.ADMIN_EMAIL])
  fastify.log.info({ email: process.env.ADMIN_EMAIL }, 'Admin-Rolle gesetzt')
}

// Dynamic audit log retention policy (daily cleanup based on settings)
setInterval(async () => {
  try {
    const db = getDb()
    const { rows: [setting] } = await db.query("SELECT value FROM settings WHERE key = 'audit_retention_days'")
    const retentionDays = parseInt(setting?.value || '365')
    
    const result = await db.query(`DELETE FROM audit_log WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '$1 days'`, [retentionDays])
    if (result.rowCount > 0) {
      fastify.log.info(`Retention: ${result.rowCount} alte Audit-Logs gelöscht (> ${retentionDays} Tage)`)
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
