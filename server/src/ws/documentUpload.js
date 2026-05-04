import { v4 as uuid } from 'uuid'
import { getDb } from '../db/index.js'
import { analyzeDocument } from '../services/ocr.js'
import { saveImageChunks } from '../services/storage.js'
import { decrypt } from '../utils/crypto.js'
import { logAudit } from '../services/audit.js'

function normalizeRole(role) {
  return role === 'readonly' ? 'guest' : role
}

function normalizeAllowedRoles(allowedRoles) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    return ['vet', 'authority', 'guest']
  }
  return [...new Set(allowedRoles.map(normalizeRole))]
}

function canAccessAnimalForUpload(db, animalId, accountId, userRole) {
  // Owner can always access their own animals
  if (db.prepare('SELECT 1 FROM animals WHERE id = ? AND account_id = ?').get(animalId, accountId)) {
    return true
  }
  
  // Vet/Authority can access animals if sharing is configured
  if (userRole === 'vet' || userRole === 'authority') {
    const sharing = db.prepare('SELECT 1 FROM animal_sharing WHERE animal_id = ? AND role = ?')
      .get(animalId, userRole)
    return !!sharing
  }
  
  // Guests cannot upload
  return false
}

export default async function wsDocumentUpload(fastify) {
  fastify.get('/ws', { websocket: true }, async (socket, req) => {
    let accountId, userRole, userGeminiKey = null, userGeminiModel = null, userAnthropicKey = null, userClaudeModel = null
    let authenticated = false
    let uploadState = null
    const MAX_UPLOAD_SIZE = 15 * 1024 * 1024 // 15MB per document

    socket.on('message', async (raw, isBinary) => {
      // Skip binary chunks until authenticated
      if (isBinary) {
        if (!authenticated) {
          send(socket, { type: 'error', message: 'Not authenticated' })
          return
        }
        if (uploadState?.writer) {
          // Check size limit
          uploadState.bytesReceived = (uploadState.bytesReceived || 0) + raw.length
          if (uploadState.bytesReceived > MAX_UPLOAD_SIZE) {
            send(socket, { type: 'error', message: `Datei zu groß (max 15MB)` })
            return
          }

          uploadState.writer.write(raw)
          fastify.log.debug({ bytes: raw.length, total: uploadState.bytesReceived }, 'WS: chunk received')
        }
        return
      }

      let msg
      try {
        msg = JSON.parse(raw.toString())
        fastify.log.debug({ type: msg.type }, 'WS: message received')
      } catch (err) {
        fastify.log.error({ err }, '[WS] Parse error')
        send(socket, { type: 'error', message: 'Ungültige Nachricht' })
        return
      }

      // Handle auth before anything else
      if (msg.type === 'auth') {
        const { token } = msg
        if (!token) {
          send(socket, { type: 'error', message: 'Kein Token' })
          socket.close()
          return
        }
        try {
          const payload = fastify.jwt.verify(token)
          accountId = payload.accountId
          const userRoles = payload.roles ?? [payload.role ?? 'user']
          userRole = userRoles.includes('vet') ? 'vet'
                   : userRoles.includes('authority') ? 'authority'
                   : userRoles.includes('admin') ? 'admin'
                   : 'user'

          const db = getDb()
          const acc = db.prepare('SELECT gemini_token, gemini_model, anthropic_token, claude_model FROM accounts WHERE id = ?').get(accountId)
          try {
            userGeminiKey = acc?.gemini_token ? decrypt(acc.gemini_token) : null
          } catch (decryptErr) {
            fastify.log.warn({ err: decryptErr.message }, 'WS: could not decrypt gemini_token')
            userGeminiKey = null
          }
          try {
            userAnthropicKey = acc?.anthropic_token ? decrypt(acc.anthropic_token) : null
          } catch (decryptErr) {
            fastify.log.warn({ err: decryptErr.message }, 'WS: could not decrypt anthropic_token')
            userAnthropicKey = null
          }
          userGeminiModel = acc?.gemini_model || 'gemini-3.1-flash-lite-preview'
          userClaudeModel = acc?.claude_model || 'claude-haiku-4-5-20251001'

          authenticated = true
          fastify.log.info({ accountId, role: userRole, hasGemini: !!userGeminiKey, hasAnthropic: !!userAnthropicKey }, 'WS: client authenticated')
          send(socket, { type: 'auth_ok' })
        } catch (err) {
          fastify.log.error({ err }, '[WS] Auth error')
          send(socket, { type: 'error', message: 'Authentifizierung fehlgeschlagen' })
          socket.close()
        }
        return
      }

      // Require authentication for all other messages
      if (!authenticated) {
        send(socket, { type: 'error', message: 'Not authenticated' })
        return
      }

      switch (msg.type) {
        case 'upload_start': {
          const { animalId, filename, mimeType, allowedRoles, pageNumber, documentId } = msg
          const pageNum = pageNumber ?? 1
          const normalizedAllowedRoles = normalizeAllowedRoles(allowedRoles)
          fastify.log.debug({ docId, animalId: msg.animalId, filename: msg.filename, page: pageNum }, 'WS: upload start')

          // Insert stub document so document_pages FK is satisfied
          const docId = documentId || uuid()
          const db = getDb()
          const existingCheck = db.prepare('SELECT id FROM documents WHERE id = ?').get(docId)
          if (!existingCheck) {
            db.prepare(`
              INSERT INTO documents (id, animal_id, doc_type, image_path, extracted_json, ocr_provider, added_by_account, added_by_role, allowed_roles)
              VALUES (?, ?, 'other', '', '{}', 'pending', ?, ?, ?)
            `).run(docId, animalId, accountId, userRole, JSON.stringify(normalizedAllowedRoles))
          }

          // sicherstellen, dass der Benutzer (Owner, Vet oder Authority) das Tier uploaden darf
          const db = getDb()
          if (!canAccessAnimalForUpload(db, animalId, accountId, userRole)) {
            fastify.log.error({ animalId, accountId, userRole }, '[WS] Access denied')
            send(socket, { type: 'error', message: 'Zugriff verweigert' })
            return
          }

          const safeFilename = `${uuid()}_${filename.replace(/[^a-z0-9._-]/gi, '_')}`
          uploadState = {
            animalId,
            mimeType,
            allowedRoles: normalizedAllowedRoles,
            filename: safeFilename,
            pageNumber: pageNum,
            documentId: docId,
            writer: saveImageChunks(safeFilename),
            isMultiPage: pageNumber !== undefined && pageNumber > 1
          }

          fastify.log.debug({ docId }, 'WS: ready to receive')
          send(socket, { type: 'ready', documentId: docId })
          break
        }

        case 'upload_end': {
          if (!uploadState) {
            send(socket, { type: 'error', message: 'Kein aktiver Upload' })
            return
          }

          try {
            send(socket, { type: 'status', message: 'Seite empfangen, speichere...' })
            const imagePath = await uploadState.writer.finish()
            const db = getDb()

            // Save page to document_pages table
            db.prepare(`
              INSERT INTO document_pages (document_id, page_number, image_path)
              VALUES (?, ?, ?)
            `).run(uploadState.documentId, uploadState.pageNumber, imagePath)

            const isLast = msg.is_last === true
            if (!isLast) {
              // Multi-page: more pages coming
              send(socket, {
                type: 'page_saved',
                documentId: uploadState.documentId,
                pageNumber: uploadState.pageNumber,
                message: `Seite ${uploadState.pageNumber} gespeichert. Nächste Seite uploaden.`
              })
              uploadState = null
              return
            }

            // Last page: combine all pages, do OCR, and AI analysis
            send(socket, { type: 'status', message: 'Analysiere alle Seiten...' })

            // Get all pages for this document
            const pages = db.prepare(`
              SELECT page_number, image_path FROM document_pages
              WHERE document_id = ?
              ORDER BY page_number ASC
            `).all(uploadState.documentId)

            // Analyze each page and combine text
            let combinedText = ''
            let lastProvider = 'gemini'
            let analysisError = null
            for (const page of pages) {
              try {
                const pageStartTime = Date.now()
                const result = await analyzeDocument(page.image_path, userGeminiKey, userGeminiModel, (progressMsg) => {
                  send(socket, { type: 'status', message: `Seite ${page.page_number}: ${progressMsg}` })
                }, userAnthropicKey, userClaudeModel)
                const pageElapsed = Date.now() - pageStartTime
                fastify.log.debug({ pageNumber: page.page_number, elapsedMs: pageElapsed, provider: result.provider }, 'WS: Page analysis completed')
                combinedText += (combinedText ? '\n---\n' : '') + (result.data.text || '')
                lastProvider = result.provider
              } catch (err) {
                fastify.log.error({ err, pageNumber: page.page_number }, 'WS: Error analyzing page')
                analysisError = err
                // Store error but continue - will save as pending_analysis
                send(socket, { type: 'status', message: `⚠️ ${err.message}` })
              }
            }

            // Use Gemini to suggest type and tags from combined text
            let suggestedType = 'other'
            let suggestedTags = []
            if (combinedText && userGeminiKey) {
              try {
                send(socket, { type: 'status', message: 'Erzeuge Vorschläge mit KI...' })
                const typeGuess = await guessDocumentType(combinedText, userGeminiKey, userGeminiModel)
                suggestedType = typeGuess
              } catch (err) {
                fastify.log.error({ err }, 'WS: Error guessing document type')
              }
            }

            send(socket, { type: 'status', message: 'Speichere Ergebnis...' })

            // Create document with combined pages
            const docId = uploadState.documentId
            const analysisStatus = analysisError ? 'pending_analysis' : 'completed'

            // Check if document already exists
            const existingDoc = db.prepare('SELECT id FROM documents WHERE id = ?').get(docId)

            if (existingDoc) {
              // Update existing document
              db.prepare(`
                UPDATE documents
                SET doc_type = ?, image_path = ?, extracted_json = ?, ocr_provider = ?, added_by_account = ?, added_by_role = ?, allowed_roles = ?, analysis_status = ?
                WHERE id = ?
              `).run(
                suggestedType,
                pages[0].image_path,
                analysisError ? JSON.stringify({ pages: pages.length, error: analysisError.message }) : JSON.stringify({ text: combinedText, type: suggestedType, pages: pages.length }),
                lastProvider,
                accountId,
                userRole,
                JSON.stringify(uploadState.allowedRoles),
                analysisStatus,
                docId
              )
            } else {
              // Insert new document
              db.prepare(`
                INSERT INTO documents (id, animal_id, doc_type, image_path, extracted_json, ocr_provider, added_by_account, added_by_role, allowed_roles, analysis_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                docId,
                uploadState.animalId,
                suggestedType,
                pages[0].image_path,
                analysisError ? JSON.stringify({ pages: pages.length, error: analysisError.message }) : JSON.stringify({ text: combinedText, type: suggestedType, pages: pages.length }),
                lastProvider,
                accountId,
                userRole,
                JSON.stringify(uploadState.allowedRoles),
                analysisStatus
              )
            }

            logAudit(db, {
              accountId, role: userRole, action: 'upload_document', resource: 'document', resourceId: docId,
              details: { doc_type: suggestedType, pages: pages.length, ocr_provider: lastProvider },
              ip: req.ip
            })

            send(socket, {
              type: 'result',
              data: { documentId: docId, docType: suggestedType, pages: pages.length, suggestedType, ocrProvider: lastProvider, analysisStatus }
            })
          } catch (err) {
            fastify.log.error({ err }, 'WS: OCR/Upload error')
            send(socket, { type: 'error', message: err.message })
          } finally {
            uploadState = null
          }
          break
        }

        default:
          send(socket, { type: 'error', message: `Unbekannter Nachrichtentyp: ${msg.type}` })
      }
    })

    socket.on('error', (err) => fastify.log.error({ err }, 'WS socket error'))
  })
}

function send(socket, obj) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(obj))
  }
}

async function guessDocumentType(text, geminiKey, modelId = 'gemini-1.5-flash') {
  if (!geminiKey) return 'other'
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(geminiKey)
    const model = genAI.getGenerativeModel({ model: modelId })

    const prompt = `Based on the following extracted document text, determine what type of veterinary document this is.
Return ONLY one word from this list: vaccination, vet_report, microchip, passport, other

Text: ${text.slice(0, 500)}`

    const result = await model.generateContent(prompt)
    const response = result.response.text().toLowerCase().trim()
    const types = ['vaccination', 'vet_report', 'microchip', 'passport', 'other']
    return types.find(t => response.includes(t)) || 'other'
  } catch (err) {
    fastify.log.error({ err }, 'guessDocumentType error')
    return 'other'
  }
}
