import 'dotenv/config'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyWs from '@fastify/websocket'
import fastifyCors from '@fastify/cors'
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

// Plugins
await fastify.register(fastifyCors, { origin: true })
await fastify.register(fastifyJwt, { secret: process.env.JWT_SECRET ?? 'changeme' })
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
