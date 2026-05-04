import { v4 as uuid } from 'uuid'
import { getDb } from '../db/index.js'
import { hashApiKey } from '../utils/apikey.js'
import { logAudit } from '../services/audit.js'
import { analyzeDocument, normalizeDocumentType } from '../services/ocr.js'
import { decrypt } from '../utils/crypto.js'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, join, sep } from 'path'
import fastifyMultipart from '@fastify/multipart'

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? resolve(process.env.UPLOADS_DIR)
  : resolve(join(import.meta.dirname, '..', '..', 'uploads'))

function safePath(filename) {
  const full = resolve(UPLOADS_DIR, filename)
  if (!full.startsWith(UPLOADS_DIR + sep)) {
    throw new Error('Path traversal blocked')
  }
  return full
}

/**
 * Middleware: Authenticate via X-Api-Key header.
 * Sets req.apiKeyAccount = { id, accountId, role, permissions, keyName }
 */
async function authenticateApiKey(req, reply) {
  const apiKey = req.headers['x-api-key']
  if (!apiKey) {
    return reply.code(401).send({ error: 'Missing X-Api-Key header' })
  }

  const db = getDb()
  const keyHash = hashApiKey(apiKey)

  const keyRow = db.prepare(
    'SELECT id, account_id, name, permissions, rate_limit, active FROM api_keys WHERE key_hash = ?'
  ).get(keyHash)

  if (!keyRow || !keyRow.active) {
    return reply.code(401).send({ error: 'Invalid or inactive API key' })
  }

  // Live role verification (Plan 6d — Zero Trust)
  const account = db.prepare('SELECT role, verified FROM accounts WHERE id = ?').get(keyRow.account_id)
  if (!account || !account.verified || !account.role.includes('vet')) {
    return reply.code(403).send({ error: 'Associated account is not a verified veterinarian' })
  }

  // Update last_used_at
  db.prepare('UPDATE api_keys SET last_used_at = datetime(\'now\') WHERE id = ?').run(keyRow.id)

  req.apiKeyAccount = {
    id: keyRow.id,
    accountId: keyRow.account_id,
    role: 'vet',
    permissions: JSON.parse(keyRow.permissions || '["read","write"]'),
    keyName: keyRow.name
  }
}

export default async function vetApiRoutes(fastify) {
  // Register multipart only for this plugin scope
  await fastify.register(fastifyMultipart, {
    limits: { fileSize: 15 * 1024 * 1024 } // 15MB
  })

  // Per-key rate limiting for the entire /api/v1/ scope
  fastify.addHook('onRequest', async (req, reply) => {
    await authenticateApiKey(req, reply)
  })

  // Additional rate-limit check per API key (60 req/min default)
  await fastify.register(import('@fastify/rate-limit'), {
    max: (req) => {
      // Look up the key's rate_limit (already authenticated at this point)
      if (req.apiKeyAccount) {
        const db = getDb()
        const keyRow = db.prepare('SELECT rate_limit FROM api_keys WHERE id = ?').get(req.apiKeyAccount.id)
        return keyRow?.rate_limit || 60
      }
      return 60
    },
    timeWindow: '1 minute',
    keyGenerator: (req) => req.apiKeyAccount?.id || req.ip
  })

  // ─────────────────────────────────────────────────
  // GET /api/v1/animals/:animalId — Read animal data
  // ─────────────────────────────────────────────────
  fastify.get('/api/v1/animals/:animalId', {
    schema: {
      description: 'Get animal data by ID',
      tags: ['VET API'],
      params: { type: 'object', properties: { animalId: { type: 'string' } } },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            species: { type: 'string' },
            breed: { type: 'string' },
            birthdate: { type: 'string' },
            avatar_path: { type: 'string' },
            is_archived: { type: 'integer' },
            tags: { type: 'array' }
          }
        }
      }
    }
  }, async (req, reply) => {
    if (!req.apiKeyAccount.permissions.includes('read')) {
      return reply.code(403).send({ error: 'API key does not have read permission' })
    }

    const db = getDb()
    const animal = db.prepare('SELECT id, name, species, breed, birthdate, avatar_path, is_archived FROM animals WHERE id = ?')
      .get(req.params.animalId)

    if (!animal) return reply.code(404).send({ error: 'Animal not found' })

    const tags = db.prepare('SELECT tag_id, tag_type, active FROM animal_tags WHERE animal_id = ?')
      .all(animal.id)

    logAudit(db, {
      accountId: req.apiKeyAccount.accountId,
      role: 'vet_api',
      action: 'read_animal',
      resource: 'animal',
      resourceId: animal.id,
      details: { api_key: req.apiKeyAccount.keyName },
      ip: req.ip
    })

    return { ...animal, tags }
  })

  // ─────────────────────────────────────────────────────────────
  // GET /api/v1/animals/:animalId/documents — List documents
  // ─────────────────────────────────────────────────────────────
  fastify.get('/api/v1/animals/:animalId/documents', {
    schema: {
      description: 'List documents for an animal (vet-visible)',
      tags: ['VET API'],
      params: { type: 'object', properties: { animalId: { type: 'string' } } }
    }
  }, async (req, reply) => {
    if (!req.apiKeyAccount.permissions.includes('read')) {
      return reply.code(403).send({ error: 'API key does not have read permission' })
    }

    const db = getDb()
    const animal = db.prepare('SELECT id FROM animals WHERE id = ?').get(req.params.animalId)
    if (!animal) return reply.code(404).send({ error: 'Animal not found' })

    const docs = db.prepare(`
      SELECT id, doc_type, created_at, ocr_provider, added_by_role, analysis_status, extracted_json, allowed_roles
      FROM documents
      WHERE animal_id = ? AND analysis_status = 'completed'
      ORDER BY created_at DESC
    `).all(animal.id)

    const result = docs
      .filter(d => {
        if (!d.allowed_roles) return true
        try {
          const roles = JSON.parse(d.allowed_roles)
          if (!Array.isArray(roles)) return true
          return roles.includes('vet')
        } catch {
          return true
        }
      })
      .map(d => ({
        ...d,
        extracted_json: (() => { try { return JSON.parse(d.extracted_json) } catch { return {} } })()
      }))

    logAudit(db, {
      accountId: req.apiKeyAccount.accountId,
      role: 'vet_api',
      action: 'list_documents',
      resource: 'animal',
      resourceId: animal.id,
      details: { api_key: req.apiKeyAccount.keyName, count: result.length },
      ip: req.ip
    })

    return result
  })

  // ─────────────────────────────────────────────────────────────
  // GET /api/v1/animals/by-tag/:tagId — Lookup animal by tag
  // ─────────────────────────────────────────────────────────────
  fastify.get('/api/v1/animals/by-tag/:tagId', {
    schema: {
      description: 'Find animal by NFC/barcode tag',
      tags: ['VET API'],
      params: { type: 'object', properties: { tagId: { type: 'string' } } }
    }
  }, async (req, reply) => {
    if (!req.apiKeyAccount.permissions.includes('read')) {
      return reply.code(403).send({ error: 'API key does not have read permission' })
    }

    const db = getDb()
    const row = db.prepare(`
      SELECT a.id, a.name, a.species, a.breed, a.birthdate, a.avatar_path, a.is_archived
      FROM animals a
      JOIN animal_tags t ON t.animal_id = a.id
      WHERE t.tag_id = ? AND t.active = 1
    `).get(req.params.tagId)

    if (!row) return reply.code(404).send({ error: 'No animal found for this tag' })

    logAudit(db, {
      accountId: req.apiKeyAccount.accountId,
      role: 'vet_api',
      action: 'lookup_by_tag',
      resource: 'animal',
      resourceId: row.id,
      details: { api_key: req.apiKeyAccount.keyName, tag_id: req.params.tagId },
      ip: req.ip
    })

    return row
  })

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/v1/animals/:animalId/documents — Upload document (multipart)
  // ──────────────────────────────────────────────────────────────────────────
  fastify.post('/api/v1/animals/:animalId/documents', {
    schema: {
      description: 'Upload a document image for an animal. Multipart: field "file" (image) + field "doc_type" (vaccination|pedigree|dog_certificate|medical_product|general)',
      tags: ['VET API'],
      params: { type: 'object', properties: { animalId: { type: 'string' } } }
    }
  }, async (req, reply) => {
    if (!req.apiKeyAccount.permissions.includes('write')) {
      return reply.code(403).send({ error: 'API key does not have write permission' })
    }

    const db = getDb()
    const animal = db.prepare('SELECT id, is_archived FROM animals WHERE id = ?').get(req.params.animalId)
    if (!animal) return reply.code(404).send({ error: 'Animal not found' })
    if (animal.is_archived) return reply.code(400).send({ error: 'Animal is archived — no new documents allowed' })

    const data = await req.file()
    if (!data) return reply.code(400).send({ error: 'No file uploaded' })

    // Extract fields from multipart
    const fields = {}
    for (const [key, field] of Object.entries(data.fields || {})) {
      fields[key] = field.value
    }

    const docType = normalizeDocumentType(fields.doc_type || 'general')
    if (!['vaccination', 'pedigree', 'dog_certificate', 'medical_product', 'general'].includes(docType)) {
      return reply.code(400).send({ error: 'Invalid doc_type. Must be one of: vaccination, pedigree, dog_certificate, medical_product, general' })
    }

    // Save file
    const docId = uuid()
    const ext = data.filename?.split('.').pop() || 'jpg'
    const filename = `${animal.id}/${docId}.${ext}`
    const dir = resolve(UPLOADS_DIR, animal.id)
    mkdirSync(dir, { recursive: true })

    const filepath = safePath(filename)
    const buffer = await data.toBuffer()
    writeFileSync(filepath, buffer)

    // Insert document record
    db.prepare(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, extracted_json, added_by_account, added_by_role, allowed_roles, analysis_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      docId, animal.id, docType, filename,
      JSON.stringify({}), // placeholder until OCR completes
      req.apiKeyAccount.accountId, 'vet',
      JSON.stringify(['vet', 'authority', 'guest']),
      'pending_analysis'
    )

    // Trigger OCR analysis asynchronously
    setImmediate(async () => {
      try {
        const account = db.prepare('SELECT gemini_token, gemini_model, anthropic_token, claude_model, openai_token, openai_model, ai_provider_priority FROM accounts WHERE id = ?')
          .get(req.apiKeyAccount.accountId)

        let geminiKey = null, anthropicKey = null, openaiKey = null
        try { geminiKey = account?.gemini_token ? decrypt(account.gemini_token) : null } catch {}
        try { anthropicKey = account?.anthropic_token ? decrypt(account.anthropic_token) : null } catch {}
        try { openaiKey = account?.openai_token ? decrypt(account.openai_token) : null } catch {}

        // Fallback to system keys
        if (!geminiKey) geminiKey = process.env.GEMINI_API_KEY || null
        if (!anthropicKey) anthropicKey = process.env.ANTHROPIC_API_KEY || null
        if (!openaiKey) openaiKey = process.env.OPENAI_API_KEY || null

        const priority = account?.ai_provider_priority ? JSON.parse(account.ai_provider_priority) : ['google', 'anthropic', 'openai']

        const result = await analyzeDocument(
          filename,
          geminiKey, account?.gemini_model || 'gemini-1.5-flash',
          null,
          anthropicKey, account?.claude_model || 'claude-3-5-sonnet-20241022',
          openaiKey, account?.openai_model || 'gpt-4o-mini',
          priority
        )

        db.prepare('UPDATE documents SET extracted_json = ?, ocr_provider = ?, analysis_status = ? WHERE id = ?')
          .run(JSON.stringify(result.data), result.provider, 'completed', docId)
      } catch (err) {
        fastify.log.error({ err, docId }, 'VET-API: OCR analysis failed')
        db.prepare('UPDATE documents SET analysis_status = ? WHERE id = ?').run('pending_analysis', docId)
      }
    })

    logAudit(db, {
      accountId: req.apiKeyAccount.accountId,
      role: 'vet_api',
      action: 'upload_document',
      resource: 'document',
      resourceId: docId,
      details: { api_key: req.apiKeyAccount.keyName, doc_type: docType, animal_id: animal.id },
      ip: req.ip
    })

    return reply.code(201).send({
      id: docId,
      animal_id: animal.id,
      doc_type: docType,
      image_path: filename,
      analysis_status: 'pending_analysis',
      message: 'Document uploaded. OCR analysis is processing asynchronously.'
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────────
  // POST /api/v1/animals/:animalId/vaccinations — Structured vaccination data
  // ─────────────────────────────────────────────────────────────────────────────────
  fastify.post('/api/v1/animals/:animalId/vaccinations', {
    schema: {
      description: 'Add a structured vaccination record (no image required)',
      tags: ['VET API'],
      params: { type: 'object', properties: { animalId: { type: 'string' } } },
      body: {
        type: 'object',
        required: ['vaccine_name', 'date'],
        properties: {
          vaccine_name: { type: 'string' },
          date: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
          batch_number: { type: 'string' },
          valid_until: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
          vet_name: { type: 'string' },
          notes: { type: 'string' }
        }
      }
    }
  }, async (req, reply) => {
    if (!req.apiKeyAccount.permissions.includes('write')) {
      return reply.code(403).send({ error: 'API key does not have write permission' })
    }

    const db = getDb()
    const animal = db.prepare('SELECT id, is_archived FROM animals WHERE id = ?').get(req.params.animalId)
    if (!animal) return reply.code(404).send({ error: 'Animal not found' })
    if (animal.is_archived) return reply.code(400).send({ error: 'Animal is archived — no new records allowed' })

    const { vaccine_name, date, batch_number, valid_until, vet_name, notes } = req.body

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'Invalid date format. Use YYYY-MM-DD' })
    }

    const docId = uuid()
    const extractedJson = {
      type: 'vaccination',
      vaccine_name,
      date,
      batch_number: batch_number || null,
      valid_until: valid_until || null,
      vet_name: vet_name || null,
      notes: notes || null,
      suggested_tags: ['vaccination', vaccine_name.toLowerCase()],
      source: 'vet_api_structured'
    }

    db.prepare(`
      INSERT INTO documents (id, animal_id, doc_type, image_path, extracted_json, ocr_provider, added_by_account, added_by_role, allowed_roles, analysis_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      docId, animal.id, 'vaccination', '',
      JSON.stringify(extractedJson), 'vet_api',
      req.apiKeyAccount.accountId, 'vet',
      JSON.stringify(['vet', 'authority', 'guest']),
      'completed'
    )

    logAudit(db, {
      accountId: req.apiKeyAccount.accountId,
      role: 'vet_api',
      action: 'create_vaccination',
      resource: 'document',
      resourceId: docId,
      details: { api_key: req.apiKeyAccount.keyName, vaccine_name, animal_id: animal.id },
      ip: req.ip
    })

    return reply.code(201).send({
      id: docId,
      animal_id: animal.id,
      doc_type: 'vaccination',
      extracted_json: extractedJson,
      analysis_status: 'completed',
      message: 'Vaccination record created successfully.'
    })
  })
}
