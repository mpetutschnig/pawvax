import { getDb } from '../db/index.js'
import { logAudit } from '../services/audit.js'
import { analyzeDocument } from '../services/ocr.js'
import { decrypt } from '../utils/crypto.js'
import { unlink } from 'fs/promises'
import { resolve } from 'path'

export default async function documentRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate)

  // Einzelnes Dokument abrufen
  fastify.get('/api/documents/:id', async (req, reply) => {
    const db = getDb()
    const { accountId, role, roles, verified } = req.user

    const doc = db.prepare(`
      SELECT d.*, a.account_id AS owner_id FROM documents d
      JOIN animals a ON a.id = d.animal_id
      WHERE d.id = ?
    `).get(req.params.id)

    if (!doc) return reply.code(404).send({ error: 'Dokument nicht gefunden' })

    const isOwner = doc.owner_id === accountId
    let hasAccess = isOwner

    if (!isOwner) {
      const rolesArray = roles ?? [role]
      const requestRole = (rolesArray.includes('vet') && verified) ? 'vet' : rolesArray.includes('authority') ? 'authority' : null
      
      if (requestRole) {
        const sharing = db.prepare('SELECT * FROM animal_sharing WHERE animal_id = ? AND role = ?').get(doc.animal_id, requestRole)
        if (sharing) {
          const typeAllowed = (doc.doc_type === 'vaccination' && sharing.share_vaccination) ||
                              (doc.doc_type === 'medication' && sharing.share_medication) ||
                              (doc.doc_type === 'other' && sharing.share_other_docs)
          
          let roleAllowed = true
          if (doc.allowed_roles) {
            try {
              const parsedRoles = JSON.parse(doc.allowed_roles)
              roleAllowed = parsedRoles.includes(requestRole)
            } catch {}
          }
          hasAccess = typeAllowed && roleAllowed
        }
      }
    }

    if (!hasAccess) return reply.code(403).send({ error: 'Kein Zugriff auf dieses Dokument' })

    const isUploader = doc.added_by_account === accountId

    return {
      ...doc,
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
      SELECT d.*, a.account_id AS owner_id FROM documents d
      JOIN animals a ON a.id = d.animal_id
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
      db.prepare('UPDATE documents SET allowed_roles = ? WHERE id = ?')
        .run(JSON.stringify(allowed_roles), doc.id)
      logAudit(db, { accountId, role, action: 'update_document_sharing', resource: 'document', resourceId: doc.id,
        details: { allowed_roles }, ip: req.ip })
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
      SELECT d.*, a.account_id AS owner_id FROM documents d
      JOIN animals a ON a.id = d.animal_id
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
        console.warn(`[DELETE] Could not delete image file ${doc.image_path}:`, err.message)
      })
    }

    // Delete all page images
    pages.forEach(page => {
      if (page.image_path) {
        unlink(resolve(process.env.UPLOADS_DIR || './uploads', page.image_path)).catch(err => {
          console.warn(`[DELETE] Could not delete page image ${page.image_path}:`, err.message)
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

    // Verify ownership
    const animal = db.prepare('SELECT account_id FROM animals WHERE id = ?').get(animalId)
    if (!animal || animal.account_id !== accountId) {
      return reply.code(403).send({ error: 'Keine Berechtigung' })
    }

    const docs = db.prepare(`
      SELECT * FROM documents
      WHERE animal_id = ? AND analysis_status = 'pending_analysis'
      ORDER BY created_at DESC
    `).all(animalId)

    return reply.send(docs)
  })

  // Retry-Analyse für pending Dokument
  fastify.post('/api/documents/:id/retry-analysis', async (req, reply) => {
    const db = getDb()
    const { accountId, role } = req.user
    const docId = req.params.id

    const doc = db.prepare(`
      SELECT d.*, a.account_id AS owner_id FROM documents d
      JOIN animals a ON a.id = d.animal_id
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
      // Get user's Gemini key
      const acc = db.prepare('SELECT gemini_token FROM accounts WHERE id = ?').get(accountId)
      let userGeminiKey = null
      try {
        userGeminiKey = acc?.gemini_token ? decrypt(acc.gemini_token) : null
      } catch (err) {
        console.warn(`Could not decrypt user gemini_token: ${err.message}`)
      }

      // Setze status auf 'analyzing'
      db.prepare('UPDATE documents SET analysis_status = ? WHERE id = ?').run('analyzing', docId)

      // Analyze the document image
      const result = await analyzeDocument(doc.image_path, userGeminiKey)
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
      console.error('Retry analysis error:', err)
      // Mark as failed, but save for later retry
      if (err.message?.includes('429') || err.message?.includes('Quota')) {
        return reply.code(503).send({ error: 'Gemini API Quota überschritten. Bitte später versuchen.' })
      }
      return reply.code(500).send({ error: err.message || 'Analyse fehlgeschlagen' })
    }
  })
}
