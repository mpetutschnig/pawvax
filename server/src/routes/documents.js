import { getDb } from '../db/index.js'
import { buildExtractedDocumentData, normalizeDocumentType } from '../services/ocr.js'
import { logAudit } from '../services/audit.js'
import { analyzeDocument } from '../services/ocr.js'
import { decrypt } from '../utils/crypto.js'
import { unlink } from 'fs/promises'
import { resolve } from 'path'
import { flagDuplicates } from '../services/dedup.js'
import { randomUUID } from 'crypto'
import { isAllowedModel, resolveModel } from '../utils/aiModels.js'

function getDocumentPages(db, documentId) {
  return db.prepare(`
    SELECT page_number, image_path
    FROM document_pages
    WHERE document_id = ?
    ORDER BY page_number ASC
  `).all(documentId)
}

async function analyzeDocumentPages(pages, options) {
  const pageResults = []
  const detectedTypes = []
  let combinedText = ''
  let provider = null

  for (const page of pages) {
    const result = await analyzeDocument(
      page.image_path,
      options.userGeminiKey,
      options.userGeminiModel,
      options.onProgress ? (message) => options.onProgress(page.page_number, message) : null,
      options.userAnthropicKey,
      options.userClaudeModel,
      options.userOpenAiKey,
      options.userOpenAiModel,
      options.priority,
      options.language || 'de',
      options.requestedDocumentType || null
    )

    pageResults.push(result.data)
    provider = result.provider

    const normalizedType = normalizeDocumentType(result.data?.type)
    if (normalizedType) {
      detectedTypes.push(normalizedType)
    }

    const pageText = [
      result.data?.raw_text,
      result.data?.rawText,
      result.data?.summary,
      result.data?.title,
      result.data?.text
    ].filter(Boolean).join('\n')

    combinedText += (combinedText && pageText ? '\n---\n' : '') + pageText
  }

  return {
    pageResults,
    combinedText,
    provider,
    suggestedType: detectedTypes[0] || 'general'
  }
}

function normalizeRole(role) {
  return role === 'readonly' ? 'guest' : role
}

function canRoleSeeDocument(rawRoles, requestRole) {
  if (!rawRoles) return true
  let parsedRoles
  try {
    parsedRoles = JSON.parse(rawRoles)
  } catch {
    return false
  }
  if (!Array.isArray(parsedRoles)) return false

  const normalizedRoles = parsedRoles.map(normalizeRole)
  const normalizedRequestRole = normalizeRole(requestRole)
  if (normalizedRoles.includes(normalizedRequestRole)) return true
  if (normalizedRequestRole === 'guest' && normalizedRoles.includes('readonly')) return true
  return false
}

function canManageReanalysis(doc, accountId, role) {
  return doc.owner_id === accountId || role === 'admin'
}

function syncChipTagFromDocument(db, animalId, extractedData) {
  if (normalizeDocumentType(extractedData?.type) !== 'pet_passport') return

  const chipCode = [
    extractedData?.identification?.chip_code,
    extractedData?.payload?.identification?.chip_code,
    ...(extractedData?.page_results || []).map((page) => page?.identification?.chip_code)
  ].find((value) => typeof value === 'string' && value.trim().length > 0)?.trim()

  if (!chipCode) return

  const existing = db.prepare('SELECT animal_id FROM animal_tags WHERE tag_id = ?').get(chipCode)
  if (!existing) {
    db.prepare('INSERT INTO animal_tags (tag_id, animal_id, tag_type) VALUES (?, ?, ?)')
      .run(chipCode, animalId, 'chip')
  }
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
        // Vet/Authority: check their specific role in the document
        hasAccess = canRoleSeeDocument(doc.allowed_roles, requestRole)
      } else {
        // Regular authenticated user: can see documents marked as 'guest'
        hasAccess = canRoleSeeDocument(doc.allowed_roles, 'guest')
      }
    }

    if (!hasAccess) return reply.code(403).send({ error: 'Kein Zugriff auf dieses Dokument' })

    const isUploader = doc.added_by_account === accountId

    const pages = getDocumentPages(db, doc.id)

    return {
      ...doc,
      pages: pages.map(p => p.image_path),
      extracted_json: JSON.parse(doc.extracted_json),
      added_by_role: doc.added_by_role || 'user',
      isOwner,
      isUploader
    }
  })

  fastify.get('/api/documents/:id/history', async (req, reply) => {
    const db = getDb()
    const { accountId, role } = req.user
    const docId = req.params.id

    const doc = db.prepare(`
      SELECT d.id, d.created_at, d.ocr_provider, d.extracted_json, a.account_id AS owner_id
      FROM documents d
      JOIN animals a ON a.id = d.animal_id
      WHERE d.id = ?
    `).get(docId)

    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })
    if (!canManageReanalysis(doc, accountId, role)) {
      return reply.code(403).send({ error: 'Keine Berechtigung' })
    }

    const history = db.prepare(`
      SELECT id, document_id, extracted_json, version, ocr_provider, created_at
      FROM analysis_history
      WHERE document_id = ?
      ORDER BY version DESC, created_at DESC
    `).all(docId).map((entry) => ({
      ...entry,
      extracted_json: JSON.parse(entry.extracted_json)
    }))

    const currentVersion = history.reduce((max, entry) => Math.max(max, entry.version), 0) + 1

    return {
      documentId: docId,
      current: {
        version: currentVersion,
        ocr_provider: doc.ocr_provider,
        created_at: doc.created_at,
        extracted_json: JSON.parse(doc.extracted_json)
      },
      history
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
      const normalizedDocType = normalizeDocumentType(doc_type)
      db.prepare('UPDATE documents SET doc_type = ? WHERE id = ?')
        .run(normalizedDocType, doc.id)
      logAudit(db, { accountId, role, action: 'update_document_type', resource: 'document', resourceId: doc.id,
        details: { doc_type: normalizedDocType }, ip: req.ip })
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
    const { provider: requestedProvider, model: requestedModel, language = 'de', requestedDocumentType = null } = req.body || {}

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

    if (requestedProvider && requestedModel && !isAllowedModel(requestedProvider, requestedModel)) {
      return reply.code(400).send({
        error: 'Ausgewähltes KI-Modell nicht verfügbar. Bitte ein anderes Modell wählen.',
        requestedProvider,
        requestedModel
      })
    }

    req.log.info({ docId, accountId, requestedProvider, requestedModel, requestedDocumentType, language, analysisStatus: doc.analysis_status }, 'Retry analysis requested')

    try {
      // Get user's keys and models
      const acc = db.prepare('SELECT gemini_token, gemini_model, anthropic_token, claude_model, openai_token, openai_model, ai_provider_priority FROM accounts WHERE id = ?').get(accountId)
      
      let userGeminiKey = null
      let userAnthropicKey = null
      let userOpenAiKey = null
      
      try { userGeminiKey = acc?.gemini_token ? decrypt(acc.gemini_token) : null } catch {}
      try { userAnthropicKey = acc?.anthropic_token ? decrypt(acc.anthropic_token) : null } catch {}
      try { userOpenAiKey = acc?.openai_token ? decrypt(acc.openai_token) : null } catch {}

      const userGeminiModel = requestedProvider === 'google' && requestedModel ? requestedModel : resolveModel('google', acc?.gemini_model)
      const userClaudeModel = requestedProvider === 'anthropic' && requestedModel ? requestedModel : resolveModel('anthropic', acc?.claude_model)
      const userOpenAiModel = requestedProvider === 'openai' && requestedModel ? requestedModel : resolveModel('openai', acc?.openai_model)

      let priority = ['system', 'google', 'anthropic', 'openai']
      try {
        if (acc?.ai_provider_priority) {
          const parsed = JSON.parse(acc.ai_provider_priority)
          if (Array.isArray(parsed) && parsed.length > 0) {
            priority = parsed
          }
        }
      } catch (parseErr) {
        req.log.warn({ err: parseErr.message }, 'Retry: Could not parse ai_provider_priority')
      }
      
      if (requestedProvider && typeof requestedProvider === 'string') {
        priority = [requestedProvider]
      }

      // Ensure priority is always an array for safe iteration
      if (!Array.isArray(priority)) {
        priority = ['system', 'google', 'anthropic', 'openai']
      }

      const useSystem = priority.includes('system')
      if (useSystem) {
        if (!userGeminiKey) userGeminiKey = process.env.GEMINI_API_KEY || null
        if (!userAnthropicKey) userAnthropicKey = process.env.ANTHROPIC_API_KEY || null
        if (!userOpenAiKey) userOpenAiKey = process.env.OPENAI_API_KEY || null
      }

      // Setze status auf 'analyzing'
      db.prepare('UPDATE documents SET analysis_status = ? WHERE id = ?').run('analyzing', docId)

      const pages = getDocumentPages(db, docId)
      const analysisPages = pages.length > 0
        ? pages
        : [{ page_number: 1, image_path: doc.image_path }]

      if (!analysisPages[0]?.image_path) {
        throw new Error('Keine gespeicherten Dokumentseiten für die Analyse gefunden')
      }

      const result = await analyzeDocumentPages(analysisPages, {
        userGeminiKey,
        userGeminiModel,
        userAnthropicKey,
        userClaudeModel,
        userOpenAiKey,
        userOpenAiModel,
        priority,
        language,
        requestedDocumentType,
        onProgress: (pageNumber, message) => {
          req.log.debug({ docId, pageNumber, message }, 'Retry analysis page progress')
        }
      })
      const provider = result.provider

      // Flag duplicate records across existing documents of the same animal
      flagDuplicates(db, doc.animal_id, docId, result.suggestedType, result.pageResults)

      const extractedData = buildExtractedDocumentData({
        combinedText: result.combinedText,
        suggestedType: result.suggestedType,
        pageResults: result.pageResults,
        pages: analysisPages.length
      })
      const requiresRetry = extractedData?.extraction_quality?.requires_retry === true
      const nextStatus = requiresRetry ? 'pending_analysis' : 'completed'
      syncChipTagFromDocument(db, doc.animal_id, extractedData)

      // Update document with analysis results
      db.prepare(`
        UPDATE documents
        SET extracted_json = ?, ocr_provider = ?, analysis_status = ?, doc_type = ?, image_path = ?
        WHERE id = ?
      `).run(
        JSON.stringify(extractedData),
        provider,
        nextStatus,
        extractedData.type,
        analysisPages[0].image_path,
        docId
      )

      logAudit(db, {
        accountId, role, action: 'retry_analysis', resource: 'document', resourceId: docId,
        details: { ocr_provider: provider, pages: analysisPages.length, requires_retry: requiresRetry, retry_reasons: extractedData?.extraction_quality?.retry_reasons || [] },
        ip: req.ip
      })

      return reply.send({
        success: !requiresRetry,
        message: requiresRetry ? 'Analyse unvollständig. Erneuter Versuch empfohlen.' : 'Analyse erfolgreich abgeschlossen',
        documentId: docId,
        extractedData,
        provider,
        analysisStatus: nextStatus,
        requiresRetry
      })
    } catch (err) {
      req.log.error({ err: { message: err.message, stack: err.stack }, docId, accountId, requestedProvider, requestedModel, requestedDocumentType, language }, 'Retry analysis failed')
      
      // Log to audit with full error details
      logAudit(db, {
        accountId, role, action: 'retry_analysis_failed', resource: 'document', resourceId: docId,
        details: { 
          error_message: err.message, 
          requested_provider: requestedProvider, 
          requested_model: requestedModel,
          requested_document_type: requestedDocumentType,
          language
        },
        ip: req.ip
      })
      
      // Reset status back to pending_analysis on error
      db.prepare('UPDATE documents SET analysis_status = ? WHERE id = ?').run('pending_analysis', docId)

      // Mark as failed, but save for later retry
      if (err.message?.includes('429') || err.message?.includes('Quota')) {
        return reply.code(503).send({ 
          error: 'Gemini API Quota überschritten. Bitte später versuchen.',
          details: err.message
        })
      }
      
      // For model not found errors, provide specific message
      if (err.message?.includes('Model not found') || err.message?.includes('model') || err.message?.includes('404')) {
        return reply.code(400).send({ 
          error: 'Ausgewähltes KI-Modell nicht verfügbar. Bitte ein anderes Modell wählen.',
          details: err.message,
          requestedProvider,
          requestedModel
        })
      }
      
      return reply.code(500).send({ 
        error: err.message || 'Analyse fehlgeschlagen',
        details: err.message,
        requestedProvider,
        requestedModel
      })
    }
  })

  // Re-analyze a completed document with new/updated prompts (Phase 4)
  fastify.post('/api/documents/:id/re-analyze', async (req, reply) => {
    const db = getDb()
    const { accountId, role } = req.user
    const docId = req.params.id
    const { provider: requestedProvider, model: requestedModel, language = 'de', requestedDocumentType = null } = req.body || {}

    const doc = db.prepare(`
      SELECT d.*, a.account_id AS owner_id, uploader.name AS added_by_name, uploader.verified AS added_by_verified FROM documents d
      JOIN animals a ON a.id = d.animal_id
      LEFT JOIN accounts uploader ON uploader.id = d.added_by_account
      WHERE d.id = ?
    `).get(docId)

    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })
    if (!canManageReanalysis(doc, accountId, role)) {
      return reply.code(403).send({ error: 'Keine Berechtigung' })
    }

    if (doc.analysis_status !== 'completed') {
      return reply.code(400).send({ error: 'Dokument muss bereits analysiert sein' })
    }

    if (requestedProvider && requestedModel && !isAllowedModel(requestedProvider, requestedModel)) {
      return reply.code(400).send({
        error: 'Ausgewähltes KI-Modell nicht verfügbar. Bitte ein anderes Modell wählen.',
        requestedProvider,
        requestedModel
      })
    }

    req.log.info({ docId, accountId, requestedProvider, requestedModel, requestedDocumentType, language, analysisStatus: doc.analysis_status }, 'Re-analysis requested')

    try {
      // Store old analysis in history (versioning)
      const oldExtractedJson = doc.extracted_json
      const historyId = randomUUID()
      const maxVersion = db.prepare(`
        SELECT COALESCE(MAX(version), 0) as maxVersion FROM analysis_history WHERE document_id = ?
      `).get(docId).maxVersion

      db.prepare(`
        INSERT INTO analysis_history (id, document_id, extracted_json, version, ocr_provider, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(historyId, docId, oldExtractedJson, maxVersion + 1, doc.ocr_provider)

      // Get user's keys and models
      const acc = db.prepare('SELECT gemini_token, gemini_model, anthropic_token, claude_model, openai_token, openai_model, ai_provider_priority FROM accounts WHERE id = ?').get(accountId)
      
      let userGeminiKey = null
      let userAnthropicKey = null
      let userOpenAiKey = null
      
      try { userGeminiKey = acc?.gemini_token ? decrypt(acc.gemini_token) : null } catch {}
      try { userAnthropicKey = acc?.anthropic_token ? decrypt(acc.anthropic_token) : null } catch {}
      try { userOpenAiKey = acc?.openai_token ? decrypt(acc.openai_token) : null } catch {}

      const userGeminiModel = requestedProvider === 'google' && requestedModel ? requestedModel : resolveModel('google', acc?.gemini_model)
      const userClaudeModel = requestedProvider === 'anthropic' && requestedModel ? requestedModel : resolveModel('anthropic', acc?.claude_model)
      const userOpenAiModel = requestedProvider === 'openai' && requestedModel ? requestedModel : resolveModel('openai', acc?.openai_model)

      let priority = ['system', 'google', 'anthropic', 'openai']
      try {
        if (acc?.ai_provider_priority) {
          const parsed = JSON.parse(acc.ai_provider_priority)
          if (Array.isArray(parsed) && parsed.length > 0) {
            priority = parsed
          }
        }
      } catch (parseErr) {
        req.log.warn({ err: parseErr.message }, 'Re-analyze: Could not parse ai_provider_priority')
      }
      
      if (requestedProvider && typeof requestedProvider === 'string') {
        priority = [requestedProvider]
      }

      // Ensure priority is always an array for safe iteration
      if (!Array.isArray(priority)) {
        priority = ['system', 'google', 'anthropic', 'openai']
      }

      const useSystem = priority.includes('system')
      if (useSystem) {
        if (!userGeminiKey) userGeminiKey = process.env.GEMINI_API_KEY || null
        if (!userAnthropicKey) userAnthropicKey = process.env.ANTHROPIC_API_KEY || null
        if (!userOpenAiKey) userOpenAiKey = process.env.OPENAI_API_KEY || null
      }

      const pages = getDocumentPages(db, docId)
      const analysisPages = pages.length > 0
        ? pages
        : [{ page_number: 1, image_path: doc.image_path }]

      if (!analysisPages[0]?.image_path) {
        throw new Error('Keine gespeicherten Dokumentseiten für die Analyse gefunden')
      }

      const result = await analyzeDocumentPages(analysisPages, {
        userGeminiKey,
        userGeminiModel,
        userAnthropicKey,
        userClaudeModel,
        userOpenAiKey,
        userOpenAiModel,
        priority,
        language,
        requestedDocumentType,
        onProgress: (pageNumber, message) => {
          req.log.debug({ docId, pageNumber, message }, 'Re-analysis page progress')
        }
      })
      // Flag duplicate records (re-compute with new analysis)
      flagDuplicates(db, doc.animal_id, docId, result.suggestedType, result.pageResults)

      const extractedData = buildExtractedDocumentData({
        combinedText: result.combinedText,
        suggestedType: result.suggestedType,
        pageResults: result.pageResults,
        pages: analysisPages.length
      })
      const requiresRetry = extractedData?.extraction_quality?.requires_retry === true
      const nextStatus = requiresRetry ? 'pending_analysis' : 'completed'
      syncChipTagFromDocument(db, doc.animal_id, extractedData)

      // Update document with new analysis results
      db.prepare(`
        UPDATE documents
        SET extracted_json = ?, ocr_provider = ?, doc_type = ?, analysis_status = ?
        WHERE id = ?
      `).run(
        JSON.stringify(extractedData),
        result.provider,
        extractedData.type,
        nextStatus,
        docId
      )

      logAudit(db, {
        accountId, role, action: 're_analyze', resource: 'document', resourceId: docId,
        details: { ocr_provider: result.provider, pages: analysisPages.length, history_entry: historyId, requires_retry: requiresRetry, retry_reasons: extractedData?.extraction_quality?.retry_reasons || [] },
        ip: req.ip
      })

      return reply.send({
        success: !requiresRetry,
        message: requiresRetry ? 'Neu-Analyse unvollständig. Erneuter Versuch empfohlen.' : 'Dokument erfolgreich neu analysiert',
        documentId: docId,
        extractedData,
        provider: result.provider,
        analysisStatus: nextStatus,
        requiresRetry,
        previousVersion: {
          version: maxVersion + 1,
          savedAt: new Date().toISOString(),
          historyId
        }
      })
    } catch (err) {
      req.log.error({ err: { message: err.message, stack: err.stack }, docId, accountId, requestedProvider, requestedModel, language }, 'Re-analysis failed')
      
      // Log to audit with full error details
      logAudit(db, {
        accountId, role, action: 're_analyze_failed', resource: 'document', resourceId: docId,
        details: { 
          error_message: err.message, 
          requested_provider: requestedProvider, 
          requested_model: requestedModel,
          language
        },
        ip: req.ip
      })

      if (err.message?.includes('429') || err.message?.includes('Quota')) {
        return reply.code(503).send({ 
          error: 'Gemini API Quota überschritten. Bitte später versuchen.',
          details: err.message
        })
      }
      
      // For model not found errors, provide specific message
      if (err.message?.includes('Model not found') || err.message?.includes('model') || err.message?.includes('404')) {
        return reply.code(400).send({ 
          error: 'Ausgewähltes KI-Modell nicht verfügbar. Bitte ein anderes Modell wählen.',
          details: err.message,
          requestedProvider,
          requestedModel
        })
      }
      
      return reply.code(500).send({ 
        error: err.message || 'Analyse fehlgeschlagen',
        details: err.message,
        requestedProvider,
        requestedModel
      })
    }
  })
}
