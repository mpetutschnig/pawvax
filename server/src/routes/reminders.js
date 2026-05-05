import { randomUUID } from 'node:crypto'
import { getDb } from '../db/index.js'

export default async function reminderRoutes(fastify) {
  // GET /api/reminders — active (non-dismissed) reminders for current account
  fastify.get('/api/reminders', { preHandler: fastify.authenticate }, async (req, reply) => {
    const db = getDb()
    const accountId = req.user.accountId

    const { rows: reminders } = await db.query(`
      SELECT r.*, a.name as animal_name
      FROM reminders r
      JOIN animals a ON a.id = r.animal_id
      WHERE r.account_id = $1 AND r.dismissed_at IS NULL
      ORDER BY r.due_date ASC
    `, [accountId])

    return reply.send(reminders)
  })

  // POST /api/reminders — create a reminder
  fastify.post('/api/reminders', { preHandler: fastify.authenticate }, async (req, reply) => {
    const db = getDb()
    const accountId = req.user.accountId
    const { animal_id, document_id, title, due_date, notes } = req.body || {}

    if (!animal_id || !title || !due_date) {
      return reply.code(400).send({ error: 'animal_id, title and due_date are required' })
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
      return reply.code(400).send({ error: 'due_date must be in YYYY-MM-DD format' })
    }

    // Ensure animal belongs to this account
    const { rows: [animal] } = await db.query('SELECT id FROM animals WHERE id = $1 AND account_id = $2', [animal_id, accountId])
    if (!animal) {
      return reply.code(403).send({ error: 'Kein Zugriff auf dieses Tier' })
    }

    // If document_id provided, validate it belongs to this animal
    if (document_id) {
      const { rows: [doc] } = await db.query('SELECT id FROM documents WHERE id = $1 AND animal_id = $2', [document_id, animal_id])
      if (!doc) {
        return reply.code(400).send({ error: 'Dokument nicht gefunden' })
      }
    }

    const id = randomUUID()
    await db.query(`
      INSERT INTO reminders (id, account_id, animal_id, document_id, title, due_date, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [id, accountId, animal_id, document_id || null, title, due_date, notes || null])

    const { rows: [reminder] } = await db.query('SELECT * FROM reminders WHERE id = $1', [id])
    return reply.code(201).send(reminder)
  })

  // PATCH /api/reminders/:id/dismiss — mark a reminder as done
  fastify.patch('/api/reminders/:id/dismiss', { preHandler: fastify.authenticate }, async (req, reply) => {
    const db = getDb()
    const accountId = req.user.accountId
    const { id } = req.params

    const { rows: [reminder] } = await db.query('SELECT * FROM reminders WHERE id = $1', [id])
    if (!reminder) {
      return reply.code(404).send({ error: 'Reminder nicht gefunden' })
    }
    if (reminder.account_id !== accountId) {
      return reply.code(403).send({ error: 'Kein Zugriff' })
    }

    await db.query("UPDATE reminders SET dismissed_at = CURRENT_TIMESTAMP WHERE id = $1", [id])
    return reply.send({ success: true })
  })
}
