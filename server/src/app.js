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

const __dir = dirname(fileURLToPath(import.meta.url))

const fastify = Fastify({
  logger: true,
  trustProxy: true,
  bodyLimit: 10 * 1024 * 1024 // 10MB für Bild-Uploads
})

// JWT Secret Guard
const jwtSecret = process.env.JWT_SECRET
const INSECURE_DEFAULTS = ['changeme', 'change-this-in-production', '']
if (!jwtSecret || INSECURE_DEFAULTS.includes(jwtSecret)) {
  console.error('FATAL: JWT_SECRET env var missing or insecure. Server will not start.')
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
} catch (err) {
  console.warn('Migration warnings:', err.message)
}

// Bootstrap: ADMIN_EMAIL aus .env als Admin setzen
if (process.env.ADMIN_EMAIL) {
  const db = getDb()
  db.prepare('UPDATE accounts SET role = ?, verified = 1 WHERE email = ?')
    .run('admin', process.env.ADMIN_EMAIL)
  console.log(`✓ Admin-Rolle für ${process.env.ADMIN_EMAIL} gesetzt`)
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
  console.log(`Server läuft auf http://0.0.0.0:${port}`)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
