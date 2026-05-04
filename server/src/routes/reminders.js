import { randomUUID } from 'node:crypto'
import { getDb } from '../db/index.js'

export default async function reminderRoutes(fastify) {
  // GET /api/reminders — active (non-dismissed) reminders for current account
  fastify.get('/api/reminders', { preHandler: fastify.authenticate }, async (req, reply) => {
    const db = getDb()
    const accountId = req.user.accountId

    const reminders = db.prepare(`
      SELECT r.*, a.name as animal_name
      FROM reminders r
      JOIN animals a ON a.id = r.animal_id
      WHERE r.account_id = ? AND r.dismissed_at IS NULL
      ORDER BY r.due_date ASC
    `).all(accountId)

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
    const animal = db.prepare('SELECT id FROM animals WHERE id = ? AND account_id = ?').get(animal_id, accountId)
    if (!animal) {
      return reply.code(403).send({ error: 'Kein Zugriff auf dieses Tier' })
    }

    // If document_id provided, validate it belongs to this animal
    if (document_id) {
      const doc = db.prepare('SELECT id FROM documents WHERE id = ? AND animal_id = ?').get(document_id, animal_id)
      if (!doc) {
        return reply.code(400).send({ error: 'Dokument nicht gefunden' })
      }
    }

    const id = randomUUID()
    db.prepare(`
      INSERT INTO reminders (id, account_id, animal_id, document_id, title, due_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, accountId, animal_id, document_id || null, title, due_date, notes || null)

    const reminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id)
    return reply.code(201).send(reminder)
  })

  // PATCH /api/reminders/:id/dismiss — mark a reminder as done
  fastify.patch('/api/reminders/:id/dismiss', { preHandler: fastify.authenticate }, async (req, reply) => {
    const db = getDb()
    const accountId = req.user.accountId
    const { id } = req.params

    const reminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id)
    if (!reminder) {
      return reply.code(404).send({ error: 'Reminder nicht gefunden' })
    }
    if (reminder.account_id !== accountId) {
      return reply.code(403).send({ error: 'Kein Zugriff' })
    }

    db.prepare("UPDATE reminders SET dismissed_at = datetime('now') WHERE id = ?").run(id)
    return reply.send({ success: true })
  })
}
