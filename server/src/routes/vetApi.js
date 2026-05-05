import { v4 as uuid } from 'uuid'
import crypto from 'crypto'
import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'

export default async function vetApiRoutes(fastify) {
  
  // Externe VET-API (REST) — durch Rate-Limit abgesichert
  fastify.post('/api/v1/animals/:animalId/documents', {
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute'
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['doc_type', 'extracted_json'],
        properties: {
          doc_type: { type: 'string', enum: ['vaccination', 'medication', 'other'] },
          extracted_json: { type: 'object' },
          image_path: { type: 'string' }, // Optional
          ocr_provider: { type: 'string' }
        }
      }
    }
  }, async (req, reply) => {
    const db = getDb()
    const apiKey = req.headers['x-api-key']

    if (!apiKey) return reply.code(401).send({ error: 'API Key fehlt (X-Api-Key Header erforderlich)' })

    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
    const { rows: [keyRecord] } = await db.query('SELECT account_id FROM api_keys WHERE key_hash = $1', [keyHash])
    
    if (!keyRecord) return reply.code(401).send({ error: 'Ungültiger API Key' })

    const accountId = keyRecord.account_id
    const { rows: [vetAccount] } = await db.query('SELECT role, verified FROM accounts WHERE id = $1', [accountId])

    if (!vetAccount || !vetAccount.role.includes('vet') || !vetAccount.verified) {
      return reply.code(403).send({ error: 'API Key gehört nicht zu einem verifizierten Tierarzt' })
    }

    const { animalId } = req.params
    const { rows: [animal] } = await db.query('SELECT id, account_id, is_archived FROM animals WHERE id = $1', [animalId])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })
    if (animal.is_archived) return reply.code(403).send({ error: 'Für archivierte Tiere können keine Dokumente hinzugefügt werden' })

    const docId = uuid()
    const { doc_type, extracted_json, image_path, ocr_provider } = req.body

    await db.query('INSERT INTO documents (id, animal_id, doc_type, image_path, extracted_json, ocr_provider, added_by_role, added_by_account, allowed_roles) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [docId, animalId, doc_type, image_path || 'vet_api_import', JSON.stringify(extracted_json), ocr_provider || 'VET-API REST', 'vet', accountId, JSON.stringify(['guest', 'vet', 'authority'])])

    await logAudit(db, { accountId, role: 'vet', action: 'vet_api_upload', resource: 'document', resourceId: docId, ip: req.ip })

    return reply.code(201).send({ success: true, documentId: docId })
  })
}