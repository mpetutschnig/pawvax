import { getDb } from '../db/index.js'

export default async function documentRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate)

  // Einzelnes Dokument abrufen
  fastify.get('/api/documents/:id', async (req, reply) => {
    const db = getDb()

    const doc = db.prepare(`
      SELECT d.* FROM documents d
      JOIN animals a ON a.id = d.animal_id
      WHERE d.id = ? AND a.account_id = ?
    `).get(req.params.id, req.user.accountId)

    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })

    return {
      ...doc,
      extracted_json: JSON.parse(doc.extracted_json),
      added_by_role: doc.added_by_role || 'user'
    }
  })
}
