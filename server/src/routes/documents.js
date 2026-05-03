import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'
import { analyzeDocument } from '../services/ocr.js'
import { decrypt } from '../utils/crypto.js'
import { unlink } from 'fs/promises'
import { resolve } from 'path'

function normalizeRole(role) {
  return role === 'readonly' ? 'guest' : role
}

function canRoleSeeDocument(rawRoles, requestRole) {
  if (!rawRoles) return true
  let parsedRoles
  try {
    parsedRoles = JSON.parse(rawRoles)
  } catch {
    return true
  }
  if (!Array.isArray(parsedRoles)) return true

  const normalizedRoles = parsedRoles.map(normalizeRole)
  const normalizedRequestRole = normalizeRole(requestRole)
  if (normalizedRoles.includes(normalizedRequestRole)) return true
  if (normalizedRequestRole === 'guest' && normalizedRoles.includes('readonly')) return true
  return false
}

export default async function documentRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate)

  // Einzelnes Dokument abrufen
  fastify.get('/api/documents/:id', async (req, reply) => {
    const db = getDb()
    const { accountId, role } = req.user

    const doc = db.prepare(`
      SELECT d.*, a.account_id AS owner_id, uploader.name AS added_by_name, uploader.verified AS added_by_verified FROM documents d
      JOIN animals a ON a.id = d.animal_id
      LEFT JOIN accounts uploader ON uploader.id = d.added_by_account
      WHERE d.id = ?
    `).get(req.params.id)

    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })

    const isOwner = doc.owner_id === accountId
    let hasAccess = isOwner

    if (!isOwner) {
      const userRoles = (role || '').split(',').map(r => r.trim())
      const requestRole = userRoles.includes('vet') ? 'vet' : userRoles.includes('authority') ? 'authority' : null
      
      if (requestRole) {
        hasAccess = canRoleSeeDocument(doc.allowed_roles, requestRole)
      }
    }

    if (!hasAccess) return reply.code(403).send({ error: 'Kein Zugriff auf dieses Dokument' })

    const isUploader = doc.added_by_account === accountId

    const pages = db.prepare('SELECT image_path FROM document_pages WHERE document_id = ? ORDER BY id ASC').all(doc.id)

    return {
      ...doc,
      pages: pages.map(p => p.image_path),
      extracted_json: JSON.parse(doc.extracted_json),
      added_by_role: doc.added_by_role || 'user',
      isOwner,
      isUploader
    }
  })

  // Dokument aktualisieren
  fastify.patch('/api/documents/:id', async (req, reply) => {
    const db = getDb()
    const { accountId, role } = req.user
    const { allowed_roles, extracted_json, doc_type } = req.body

    const doc = db.prepare(`
      SELECT d.*, a.account_id AS owner_id, uploader.name AS added_by_name, uploader.verified AS added_by_verified FROM documents d
      JOIN animals a ON a.id = d.animal_id
      LEFT JOIN accounts uploader ON uploader.id = d.added_by_account
      WHERE d.id = ?
    `).get(req.params.id)

    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })

    const isOwner = doc.owner_id === accountId
    const isUploader = doc.added_by_account === accountId

    if (!isOwner && !isUploader) {
      return reply.code(403).send({ error: 'Keine Berechtigung dieses Dokument zu bearbeiten' })
    }

    if (allowed_roles !== undefined) {
      if (!isOwner) return reply.code(403).send({ error: 'Nur der Besitzer kann die Sichtbarkeit ändern' })
      const normalizedRoles = Array.isArray(allowed_roles)
        ? [...new Set(allowed_roles.map(normalizeRole))]
        : []
      db.prepare('UPDATE documents SET allowed_roles = ? WHERE id = ?')
        .run(JSON.stringify(normalizedRoles), doc.id)
      logAudit(db, { accountId, role, action: 'update_document_sharing', resource: 'document', resourceId: doc.id,
        details: { allowed_roles: normalizedRoles }, ip: req.ip })
    }

    if (extracted_json !== undefined) {
      if (doc.added_by_role === 'vet' && !isUploader) {
        return reply.code(403).send({ error: 'Dieses verifizierte Dokument kann nur vom Tierarzt geändert werden' })
      }
      db.prepare('UPDATE documents SET extracted_json = ? WHERE id = ?')
        .run(JSON.stringify(extracted_json), doc.id)
      logAudit(db, { accountId, role, action: 'update_document_text', resource: 'document', resourceId: doc.id,
        ip: req.ip })
    }

    if (doc_type !== undefined) {
      db.prepare('UPDATE documents SET doc_type = ? WHERE id = ?')
        .run(doc_type, doc.id)
      logAudit(db, { accountId, role, action: 'update_document_type', resource: 'document', resourceId: doc.id,
        details: { doc_type }, ip: req.ip })
    }

    return { success: true }
  })

  // Dokument löschen
  fastify.delete('/api/documents/:id', async (req, reply) => {
    const db = getDb()
    const { accountId, role } = req.user

    const doc = db.prepare(`
      SELECT d.*, a.account_id AS owner_id, uploader.name AS added_by_name, uploader.verified AS added_by_verified FROM documents d
      JOIN animals a ON a.id = d.animal_id
      LEFT JOIN accounts uploader ON uploader.id = d.added_by_account
      WHERE d.id = ?
    `).get(req.params.id)

    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })

    const isOwner = doc.owner_id === accountId
    const isUploader = doc.added_by_account === accountId

    if (doc.added_by_role === 'vet' && !isUploader) {
      return reply.code(403).send({ error: 'Dieses verifizierte Dokument kann nur vom Tierarzt gelöscht werden' })
    }

    if (!isOwner && !isUploader) {
      return reply.code(403).send({ error: 'Keine Berechtigung dieses Dokument zu löschen' })
    }

    // Get all page image paths before deletion
    const pages = db.prepare('SELECT image_path FROM document_pages WHERE document_id = ?').all(doc.id)

    // Delete document pages first (foreign key constraint)
    db.prepare('DELETE FROM document_pages WHERE document_id = ?').run(doc.id)

    // Delete document from DB
    db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id)

    // Delete all image files (non-blocking, don't block response on file deletion failure)
    if (doc.image_path) {
      unlink(resolve(process.env.UPLOADS_DIR || './uploads', doc.image_path)).catch(err => {
        req.log.warn({ path: doc.image_path, err: err.message }, 'Could not delete image file')
      })
    }

    // Delete all page images
    pages.forEach(page => {
      if (page.image_path) {
        unlink(resolve(process.env.UPLOADS_DIR || './uploads', page.image_path)).catch(err => {
          req.log.warn({ path: page.image_path, err: err.message }, 'Could not delete page image')
        })
      }
    })

    logAudit(db, { accountId, role, action: 'delete_document', resource: 'document', resourceId: doc.id,
      details: { doc_type: doc.doc_type, animal_id: doc.animal_id }, ip: req.ip })

    return reply.code(204).send()
  })

  // Nicht analysierte Dokumente abrufen (pending_analysis)
  fastify.get('/api/animals/:animalId/documents/pending', async (req, reply) => {
    const db = getDb()
    const { accountId } = req.user
    const { animalId } = req.params

    const animal = db.prepare('SELECT account_id FROM animals WHERE id = ?').get(animalId)
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    const docs = db.prepare(`
      SELECT * FROM documents
      WHERE animal_id = ? AND analysis_status = 'pending_analysis'
      ORDER BY created_at DESC
    `).all(animalId)

    // Vets sehen nur ihre eigenen fehlerhaften OCR Uploads, Besitzer sehen alle
    if (animal.account_id !== accountId) {
      return reply.send(docs.filter(d => d.added_by_account === accountId))
    }

    return reply.send(docs)
  })

  // Retry-Analyse für pending Dokument
  fastify.post('/api/documents/:id/retry-analysis', async (req, reply) => {
    const db = getDb()
    const { accountId, role } = req.user
    const docId = req.params.id
    const { provider: requestedProvider, model: requestedModel } = req.body || {}

    const doc = db.prepare(`
      SELECT d.*, a.account_id AS owner_id, uploader.name AS added_by_name, uploader.verified AS added_by_verified FROM documents d
      JOIN animals a ON a.id = d.animal_id
      LEFT JOIN accounts uploader ON uploader.id = d.added_by_account
      WHERE d.id = ?
    `).get(docId)

    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })
    if (doc.owner_id !== accountId && doc.added_by_account !== accountId) {
      return reply.code(403).send({ error: 'Keine Berechtigung' })
    }

    if (doc.analysis_status !== 'pending_analysis') {
      return reply.code(400).send({ error: 'Dieses Dokument ist nicht pending' })
    }

    try {
      // Get user's keys and models
      const acc = db.prepare('SELECT gemini_token, gemini_model, anthropic_token, claude_model, openai_token, openai_model, ai_provider_priority FROM accounts WHERE id = ?').get(accountId)
      
      let userGeminiKey = null
      let userAnthropicKey = null
      let userOpenAiKey = null
      
      try { userGeminiKey = acc?.gemini_token ? decrypt(acc.gemini_token) : null } catch {}
      try { userAnthropicKey = acc?.anthropic_token ? decrypt(acc.anthropic_token) : null } catch {}
      try { userOpenAiKey = acc?.openai_token ? decrypt(acc.openai_token) : null } catch {}

      const userGeminiModel = (requestedProvider === 'google' && requestedModel) ? requestedModel : (acc?.gemini_model || 'gemini-1.5-flash')
      const userClaudeModel = (requestedProvider === 'anthropic' && requestedModel) ? requestedModel : (acc?.claude_model || 'claude-3-5-sonnet-20241022')
      const userOpenAiModel = (requestedProvider === 'openai' && requestedModel) ? requestedModel : (acc?.openai_model || 'gpt-4o-mini')

      let priority = acc?.ai_provider_priority ? JSON.parse(acc.ai_provider_priority) : ['system', 'google', 'anthropic', 'openai']
      if (requestedProvider) {
        priority = [requestedProvider]
      }

      const useSystem = priority.includes('system')
      if (useSystem) {
        if (!userGeminiKey) userGeminiKey = process.env.GEMINI_API_KEY || null
        if (!userAnthropicKey) userAnthropicKey = process.env.ANTHROPIC_API_KEY || null
        if (!userOpenAiKey) userOpenAiKey = process.env.OPENAI_API_KEY || null
      }

      // Setze status auf 'analyzing'
      db.prepare('UPDATE documents SET analysis_status = ? WHERE id = ?').run('analyzing', docId)

      // Analyze the document image
      const result = await analyzeDocument(
        doc.image_path, 
        userGeminiKey, userGeminiModel, 
        null, 
        userAnthropicKey, userClaudeModel, 
        userOpenAiKey, userOpenAiModel, 
        priority
      )
      const extractedData = result.data
      const provider = result.provider

      // Update document with analysis results
      db.prepare(`
        UPDATE documents
        SET extracted_json = ?, ocr_provider = ?, analysis_status = ?
        WHERE id = ?
      `).run(JSON.stringify(extractedData), provider, 'completed', docId)

      logAudit(db, {
        accountId, role, action: 'retry_analysis', resource: 'document', resourceId: docId,
        details: { ocr_provider: provider },
        ip: req.ip
      })

      return reply.send({
        success: true,
        message: 'Analyse erfolgreich abgeschlossen',
        documentId: docId,
        extractedData,
        provider
      })
    } catch (err) {
      req.log.error({ err, docId }, 'Retry analysis failed')
      // Reset status back to pending_analysis on error
      db.prepare('UPDATE documents SET analysis_status = ? WHERE id = ?').run('pending_analysis', docId)

      // Mark as failed, but save for later retry
      if (err.message?.includes('429') || err.message?.includes('Quota')) {
        return reply.code(503).send({ error: 'Gemini API Quota überschritten. Bitte später versuchen.' })
      }
      return reply.code(500).send({ error: err.message || 'Analyse fehlgeschlagen' })
    }
  })
}
