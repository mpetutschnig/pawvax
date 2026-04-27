import 'dotenv/config'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyWs from '@fastify/websocket'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { initDb, getDb } from './db/index.js'
import authRoutes from './routes/auth.js'
import animalRoutes from './routes/animals.js'
import documentRoutes from './routes/documents.js'
import adminRoutes from './routes/admin.js'
import wsDocumentUpload from './ws/documentUpload.js'

const __dir = dirname(fileURLToPath(import.meta.url))

const fastify = Fastify({ logger: true })

// JWT Secret Guard
const jwtSecret = process.env.JWT_SECRET
const INSECURE_DEFAULTS = ['changeme', 'change-this-in-production', '']
if (!jwtSecret || INSECURE_DEFAULTS.includes(jwtSecret)) {
  console.error('FATAL: JWT_SECRET env var missing or insecure. Server will not start.')
  process.exit(1)
}

// Plugins
await fastify.register(fastifyCors, {
  origin: ['https://paw.oxs.at', 'http://localhost:5173', 'http://localhost:3000'],
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
  timeWindow: '15 minutes'
})
await fastify.register(fastifyWs)
await fastify.register(fastifyStatic, {
  root: join(__dir, '..', process.env.UPLOADS_DIR ?? 'uploads'),
  prefix: '/uploads/'
})

// JWT-Authenticate Decorator für geschützte Routen
fastify.decorate('authenticate', async function (req, reply) {
  try {
    await req.jwtVerify()
  } catch {
    reply.code(401).send({ error: 'Nicht autorisiert' })
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
await fastify.register(wsDocumentUpload)

// Healthcheck
fastify.get('/health', async () => ({ status: 'ok' }))

// Start
const port = parseInt(process.env.PORT ?? '3000')
initDb(process.env.DB_PATH ?? './paw.db')

// Bootstrap: ADMIN_EMAIL aus .env als Admin setzen
if (process.env.ADMIN_EMAIL) {
  const db = getDb()
  db.prepare('UPDATE accounts SET role = ?, verified = 1 WHERE email = ?')
    .run('admin', process.env.ADMIN_EMAIL)
  console.log(`✓ Admin-Rolle für ${process.env.ADMIN_EMAIL} gesetzt`)
}

try {
  await fastify.listen({ port, host: '0.0.0.0' })
  console.log(`Server läuft auf http://0.0.0.0:${port}`)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
