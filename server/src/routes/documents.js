import { getDb } from '../db/index.js'
import { normalizeDocumentType } from '../services/ocr/index.js'
import { logAudit } from '../services/audit.js'
import { unlink } from 'fs/promises'
import { resolve } from 'path'
import { randomUUID } from 'node:crypto'
import { isAllowedModel } from '../utils/aiModels.js'
import { runDocumentAnalysis, getDocumentPages } from '../services/analysisPipeline.js'
import { UPLOADS_DIR } from '../utils/paths.js'

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
  return doc.owner_id === accountId || doc.added_by_account === accountId || role === 'admin'
}

export default async function documentRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate)

  // Einzelnes Dokument abrufen
  fastify.get('/api/documents/:id', async (req, reply) => {
    // Prevent caching — documents can be updated/deleted/re-analyzed
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    reply.header('Pragma', 'no-cache')
    reply.header('Expires', '0')

    const db = getDb()
    const { accountId, role } = req.user

    const { rows: [doc] } = await db.query(`
      SELECT d.*, a.account_id AS owner_id, uploader.name AS added_by_name, uploader.verified AS added_by_verified FROM documents d
      JOIN animals a ON a.id = d.animal_id
      LEFT JOIN accounts uploader ON uploader.id = d.added_by_account
      WHERE d.id = $1
    `, [req.params.id])

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

    const pages = await getDocumentPages(db, doc.id)

    let record_permissions = {}
    try { record_permissions = doc.record_permissions ? JSON.parse(doc.record_permissions) : {} } catch {}

    return {
      ...doc,
      pages: pages.map(p => p.image_path),
      extracted_json: JSON.parse(doc.extracted_json),
      record_permissions,
      added_by_role: doc.added_by_role || 'user',
      isOwner,
      isUploader
    }
  })

  // Per-record role permissions
  fastify.patch('/api/documents/:id/records', async (req, reply) => {
    const db = getDb()
    const { accountId, role } = req.user
    const { key, allowed_roles } = req.body

    if (!key || !Array.isArray(allowed_roles)) {
      return reply.code(400).send({ error: 'key und allowed_roles sind erforderlich' })
    }

    const { rows: [doc] } = await db.query(`
      SELECT d.record_permissions, a.account_id AS owner_id
      FROM documents d
      JOIN animals a ON a.id = d.animal_id
      WHERE d.id = $1
    `, [req.params.id])

    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })

    const isOwner = doc.owner_id === accountId
    if (!isOwner && role !== 'admin') {
      return reply.code(403).send({ error: 'Nur der Besitzer kann Einzel-Freigaben setzen' })
    }

    let current = {}
    try { current = doc.record_permissions ? JSON.parse(doc.record_permissions) : {} } catch {}

    const validRoles = ['guest', 'vet', 'authority']
    const normalized = [...new Set(allowed_roles.map(r => normalizeRole(r)).filter(r => validRoles.includes(r)))]
    current[key] = normalized

    await db.query('UPDATE documents SET record_permissions = $1 WHERE id = $2', [JSON.stringify(current), req.params.id])

    await logAudit(db, {
      accountId, role, action: 'update_record_permissions', resource: 'document',
      resourceId: req.params.id, details: { key, allowed_roles: normalized }, ip: req.ip
    })

    return { success: true, record_permissions: current }
  })

  fastify.get('/api/documents/:id/history', async (req, reply) => {
    // Prevent caching — history can be updated
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    reply.header('Pragma', 'no-cache')
    reply.header('Expires', '0')

    const db = getDb()
    const { accountId, role } = req.user
    const docId = req.params.id

    const { rows: [doc] } = await db.query(`
      SELECT d.id, d.created_at, d.ocr_provider, d.extracted_json, d.added_by_account, a.account_id AS owner_id
      FROM documents d
      JOIN animals a ON a.id = d.animal_id
      WHERE d.id = $1
    `, [docId])

    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })
    if (!canManageReanalysis(doc, accountId, role)) {
      return reply.code(403).send({ error: 'Keine Berechtigung' })
    }

    const { rows: history } = await db.query(`
      SELECT id, document_id, extracted_json, version, ocr_provider, created_at
      FROM analysis_history
      WHERE document_id = $1
      ORDER BY version DESC, created_at DESC
    `, [docId])
    const historyParsed = history.map((entry) => ({
      ...entry,
      extracted_json: JSON.parse(entry.extracted_json)
    }))

    const currentVersion = historyParsed.reduce((max, entry) => Math.max(max, entry.version), 0) + 1

    return {
      documentId: docId,
      current: {
        version: currentVersion,
        ocr_provider: doc.ocr_provider,
        created_at: doc.created_at,
        extracted_json: JSON.parse(doc.extracted_json)
      },
      history: historyParsed
    }
  })

  // Dokument aktualisieren
  fastify.patch('/api/documents/:id', async (req, reply) => {
    const db = getDb()
    const { accountId, role } = req.user
    const { allowed_roles, extracted_json, doc_type, share_image_with_guest } = req.body

    const { rows: [doc] } = await db.query(`
      SELECT d.*, a.account_id AS owner_id, uploader.name AS added_by_name, uploader.verified AS added_by_verified FROM documents d
      JOIN animals a ON a.id = d.animal_id
      LEFT JOIN accounts uploader ON uploader.id = d.added_by_account
      WHERE d.id = $1
    `, [req.params.id])

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
      await db.query('UPDATE documents SET allowed_roles = $1 WHERE id = $2', [JSON.stringify(normalizedRoles), doc.id])
      await logAudit(db, { accountId, role, action: 'update_document_sharing', resource: 'document', resourceId: doc.id,
        details: { allowed_roles: normalizedRoles }, ip: req.ip })
    }

    if (extracted_json !== undefined) {
      if (doc.added_by_role === 'vet' && !isUploader) {
        return reply.code(403).send({ error: 'Dieses verifizierte Dokument kann nur vom Tierarzt geändert werden' })
      }
      await db.query('UPDATE documents SET extracted_json = $1 WHERE id = $2', [JSON.stringify(extracted_json), doc.id])
      await logAudit(db, { accountId, role, action: 'update_document_text', resource: 'document', resourceId: doc.id,
        ip: req.ip })
    }

    if (doc_type !== undefined) {
      const normalizedDocType = normalizeDocumentType(doc_type)
      await db.query('UPDATE documents SET doc_type = $1 WHERE id = $2', [normalizedDocType, doc.id])
      await logAudit(db, { accountId, role, action: 'update_document_type', resource: 'document', resourceId: doc.id,
        details: { doc_type: normalizedDocType }, ip: req.ip })
    }

    if (share_image_with_guest !== undefined) {
      if (!isOwner) return reply.code(403).send({ error: 'Nur der Besitzer kann die Bildfreigabe ändern' })
      const value = share_image_with_guest ? 1 : 0
      await db.query('UPDATE documents SET share_image_with_guest = $1 WHERE id = $2', [value, doc.id])
      await logAudit(db, { accountId, role, action: 'update_document_image_sharing', resource: 'document', resourceId: doc.id,
        details: { share_image_with_guest: value }, ip: req.ip })
    }

    return { success: true }
  })

  // Delete document
  fastify.delete('/api/documents/:id', async (req, reply) => {
    const db = getDb()
    const { accountId, role } = req.user

    const { rows: [doc] } = await db.query(`
      SELECT d.*, a.account_id AS owner_id, uploader.name AS added_by_name, uploader.verified AS added_by_verified FROM documents d
      JOIN animals a ON a.id = d.animal_id
      LEFT JOIN accounts uploader ON uploader.id = d.added_by_account
      WHERE d.id = $1
    `, [req.params.id])

    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })

    const isOwner = doc.owner_id === accountId
    const isUploader = doc.added_by_account === accountId
    const isAdmin = role === 'admin'

    // Vet documents can only be deleted by the vet who uploaded them or admin
    if (doc.added_by_role === 'vet' && !isUploader && !isAdmin) {
      return reply.code(403).send({ error: 'Dieses verifizierte Dokument kann nur vom Tierarzt gelöscht werden' })
    }

    // User documents can be deleted by owner, uploader, or admin
    if (!isOwner && !isUploader && !isAdmin) {
      return reply.code(403).send({ error: 'Keine Berechtigung dieses Dokument zu löschen' })
    }

    // Get all page image paths before deletion
    const { rows: pages } = await db.query('SELECT image_path FROM document_pages WHERE document_id = $1', [doc.id])

    // Delete document pages first (foreign key constraint)
    await db.query('DELETE FROM document_pages WHERE document_id = $1', [doc.id])

    // Delete document from DB
    await db.query('DELETE FROM documents WHERE id = $1', [doc.id])

    // Delete all image files (non-blocking, don't block response on file deletion failure)
    if (doc.image_path) {
      unlink(resolve(UPLOADS_DIR, doc.image_path)).catch(err => {
        req.log.warn({ path: doc.image_path, err: err.message }, 'Could not delete image file')
      })
    }

    // Delete all page images
    pages.forEach(page => {
      if (page.image_path) {
        unlink(resolve(UPLOADS_DIR, page.image_path)).catch(err => {
          req.log.warn({ path: page.image_path, err: err.message }, 'Could not delete page image')
        })
      }
    })

    await logAudit(db, { accountId, role, action: 'delete_document', resource: 'document', resourceId: doc.id,
      details: { doc_type: doc.doc_type, animal_id: doc.animal_id }, ip: req.ip })

    return reply.code(204).send()
  })

  // Nicht analysierte Dokumente abrufen (pending_analysis)
  fastify.get('/api/animals/:animalId/documents/pending', async (req, reply) => {
    // Prevent browser/proxy caching — pending documents are real-time critical
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate')
    reply.header('Pragma', 'no-cache')
    reply.header('Expires', '0')

    const db = getDb()
    const { accountId } = req.user
    const { animalId } = req.params

    const { rows: [animal] } = await db.query('SELECT account_id FROM animals WHERE id = $1', [animalId])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    const { rows: docs } = await db.query(`
      SELECT * FROM documents
      WHERE animal_id = $1 AND analysis_status = 'pending_analysis'
      ORDER BY created_at DESC
    `, [animalId])

    // Vets sehen nur ihre eigenen fehlerhaften OCR Uploads, Besitzer sehen alle
    if (animal.account_id !== accountId) {
      return reply.send(docs.filter(d => d.added_by_account === accountId))
    }

    return reply.send(docs)
  })

  // Retry analysis for pending document
  fastify.post('/api/documents/:id/retry-analysis', async (req, reply) => {
    const db = getDb()
    const { accountId, role } = req.user
    const docId = req.params.id
    const { provider: requestedProvider, model: requestedModel, language = 'de', requestedDocumentType = null } = req.body || {}

    const { rows: [doc] } = await db.query(`
      SELECT d.*, a.account_id AS owner_id, uploader.name AS added_by_name, uploader.verified AS added_by_verified FROM documents d
      JOIN animals a ON a.id = d.animal_id
      LEFT JOIN accounts uploader ON uploader.id = d.added_by_account
      WHERE d.id = $1
    `, [docId])

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
      // Setze status auf 'analyzing'
      await db.query('UPDATE documents SET analysis_status = $1 WHERE id = $2', ['analyzing', docId])

      const result = await runDocumentAnalysis(db, doc, accountId, {
        provider: requestedProvider,
        model: requestedModel,
        language,
        requestedDocumentType
      }, req.log)

      await logAudit(db, {
        accountId, role, action: 'retry_analysis', resource: 'document', resourceId: docId,
        details: { ocr_provider: result.provider, pages: result.pagesCount, requires_retry: result.requiresRetry, retry_reasons: result.extractedData?.extraction_quality?.retry_reasons || [] },
        ip: req.ip
      })

      return reply.send({
        success: !result.requiresRetry,
        message: result.requiresRetry ? 'Analyse unvollständig. Erneuter Versuch empfohlen.' : 'Analyse erfolgreich abgeschlossen',
        documentId: docId,
        extractedData: result.extractedData,
        provider: result.provider,
        analysisStatus: result.nextStatus,
        requiresRetry: result.requiresRetry
      })
    } catch (err) {
      req.log.error({ err: { message: err.message, stack: err.stack }, docId, accountId, requestedProvider, requestedModel, requestedDocumentType, language }, 'Retry analysis failed')
      
      // Log to audit with full error details
      await logAudit(db, {
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
      await db.query('UPDATE documents SET analysis_status = $1 WHERE id = $2', ['pending_analysis', docId])

      if (err.message === 'budget_exceeded') return reply.code(422).send({ error: 'budget_exceeded' })
      if (err.message === 'fallback_disabled') return reply.code(422).send({ error: 'fallback_disabled' })

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
      
      return reply.code(err.code || 500).send({ 
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

    const { rows: [doc] } = await db.query(`
      SELECT d.*, a.account_id AS owner_id, uploader.name AS added_by_name, uploader.verified AS added_by_verified FROM documents d
      JOIN animals a ON a.id = d.animal_id
      LEFT JOIN accounts uploader ON uploader.id = d.added_by_account
      WHERE d.id = $1
    `, [docId])

    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })
    if (!canManageReanalysis(doc, accountId, role)) {
      return reply.code(403).send({ error: 'Keine Berechtigung' })
    }

    if (doc.analysis_status !== 'completed') {
      return reply.code(400).send({ error: 'Dokument muss bereits analysiert sein' })
    }

    req.log.info({ docId, accountId, requestedProvider, requestedModel, requestedDocumentType, language, analysisStatus: doc.analysis_status }, 'Re-analysis requested')

    try {
      // Store old analysis in history (versioning)
      const oldExtractedJson = doc.extracted_json
      const historyId = randomUUID()
      const { rows: [{ maxversion }] } = await db.query(`
        SELECT COALESCE(MAX(version), 0) as maxversion FROM analysis_history WHERE document_id = $1
      `, [docId])

      await db.query(`
        INSERT INTO analysis_history (id, document_id, extracted_json, version, ocr_provider, created_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      `, [historyId, docId, oldExtractedJson, maxversion + 1, doc.ocr_provider])

      const result = await runDocumentAnalysis(db, doc, accountId, {
        provider: requestedProvider,
        model: requestedModel,
        language,
        requestedDocumentType
      }, req.log)

      await logAudit(db, {
        accountId, role, action: 're_analyze', resource: 'document', resourceId: docId,
        details: { ocr_provider: result.provider, pages: result.pagesCount, history_entry: historyId, requires_retry: result.requiresRetry, retry_reasons: result.extractedData?.extraction_quality?.retry_reasons || [] },
        ip: req.ip
      })

      return reply.send({
        success: !result.requiresRetry,
        message: result.requiresRetry ? 'Neu-Analyse unvollständig. Erneuter Versuch empfohlen.' : 'Dokument erfolgreich neu analysiert',
        documentId: docId,
        extractedData: result.extractedData,
        provider: result.provider,
        analysisStatus: result.nextStatus,
        requiresRetry: result.requiresRetry,
        previousVersion: {
          version: maxversion + 1,
          savedAt: new Date().toISOString(),
          historyId
        }
      })
    } catch (err) {
      req.log.error({ err: { message: err.message, stack: err.stack }, docId, accountId, requestedProvider, requestedModel, language }, 'Re-analysis failed')
      
      // Log to audit with full error details
      await logAudit(db, {
        accountId, role, action: 're_analyze_failed', resource: 'document', resourceId: docId,
        details: { 
          error_message: err.message, 
          requested_provider: requestedProvider, 
          requested_model: requestedModel,
          language
        },
        ip: req.ip
      })

      if (err.message === 'budget_exceeded') return reply.code(422).send({ error: 'budget_exceeded' })
      if (err.message === 'fallback_disabled') return reply.code(422).send({ error: 'fallback_disabled' })

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
      
      return reply.code(err.code || 500).send({ 
        error: err.message || 'Analyse fehlgeschlagen',
        details: err.message,
        requestedProvider,
        requestedModel
      })
    }
  })
}
