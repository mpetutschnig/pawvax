import { v4 as uuid } from 'uuid'
import { unlink } from 'node:fs/promises'
import { fileTypeFromFile } from 'file-type'
import { getDb } from '../db/index.js'
import { saveImageChunks } from '../services/storage.js'
import { logAudit } from '../services/audit.js'
import { decrypt } from '../utils/crypto.js'
import { resolveModel } from '../utils/aiModels.js'
import { getSettingsMap, getSystemAiKeys } from '../services/appSettings.js'
import { runDocumentAnalysis } from '../services/analysisPipeline.js'

// Track active uploads per accountId to prevent DoS/Storage exhaustion
const activeUploadsCount = new Map()
const MAX_PARALLEL_UPLOADS = 5

function normalizeRole(role) {
  return role === 'readonly' ? 'guest' : role
}

function normalizeAllowedRoles(allowedRoles) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    return ['vet', 'authority', 'guest']
  }
  return [...new Set(allowedRoles.map(normalizeRole))]
}

async function canAccessAnimalForUpload(db, animalId, accountId, userRole) {
  // Owner can always access their own animals
  const { rows: [ownerCheck] } = await db.query('SELECT 1 FROM animals WHERE id = $1 AND account_id = $2', [animalId, accountId])
  if (ownerCheck) return true

  // Vet/Authority: scan history OR owner has enabled sharing for this role
  // (sharing-based access covers vets who arrived via a sharing link)
  if (userRole === 'vet' || userRole === 'authority') {
    const { rows: [scanHistory] } = await db.query(
      'SELECT 1 FROM animal_scans WHERE animal_id = $1 AND account_id = $2 LIMIT 1',
      [animalId, accountId]
    )
    if (scanHistory) return true

    const { rows: [sharingRow] } = await db.query(
      'SELECT 1 FROM animal_sharing WHERE animal_id = $1 AND role = $2 LIMIT 1',
      [animalId, userRole]
    )
    return !!sharingRow
  }

  // Guests cannot upload
  return false
}

export default async function wsDocumentUpload(fastify) {
  fastify.get('/ws', { websocket: true }, async (socket, req) => {
    let accountId, userRole, userGeminiKey = null, userGeminiModel = null, userAnthropicKey = null, userClaudeModel = null
    let userOpenAiKey = null, userOpenAiModel = null, userPriority = ['system', 'google', 'anthropic', 'openai']
    let userSystemFallbackEnabled = 1, userBillingBudgetEur = null, userPricePerPageCents = 0
    let hasUserOwnKey = false
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
          const { rows: [acc] } = await db.query('SELECT gemini_token, gemini_model, anthropic_token, claude_model, openai_token, openai_model, ai_provider_priority, system_fallback_enabled, billing_budget_eur FROM accounts WHERE id = $1', [accountId])
          
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
          try {
            userOpenAiKey = acc?.openai_token ? decrypt(acc.openai_token) : null
          } catch (decryptErr) {
            fastify.log.warn({ err: decryptErr.message }, 'WS: could not decrypt openai_token')
            userOpenAiKey = null
          }
          
          userGeminiModel = resolveModel('google', acc?.gemini_model)
          userClaudeModel = resolveModel('anthropic', acc?.claude_model)
          userOpenAiModel = resolveModel('openai', acc?.openai_model)
          
          try {
            if (acc?.ai_provider_priority) {
              const parsed = JSON.parse(acc.ai_provider_priority)
              if (Array.isArray(parsed) && parsed.length > 0) {
                userPriority = parsed
              }
            }
          } catch (parseErr) {
            fastify.log.warn({ err: parseErr.message }, 'WS: could not parse ai_provider_priority')
          }

          userSystemFallbackEnabled = acc?.system_fallback_enabled ?? 1
          userBillingBudgetEur = acc?.billing_budget_eur ?? null

          hasUserOwnKey = !!(userGeminiKey || userAnthropicKey || userOpenAiKey)

          try {
            const settingsMap = await getSettingsMap(db)
            userPricePerPageCents = Number(settingsMap.billing_price_per_page ?? 0)

            // Inject system AI keys for providers where user has no own key
            if (userSystemFallbackEnabled || userPriority.includes('system')) {
              const sysKeys = await getSystemAiKeys(db)
              if (!userGeminiKey) userGeminiKey = sysKeys.geminiKey
              if (!userAnthropicKey) userAnthropicKey = sysKeys.anthropicKey
              if (!userOpenAiKey) userOpenAiKey = sysKeys.openaiKey

              if (!acc?.gemini_model && sysKeys.geminiModel) userGeminiModel = sysKeys.geminiModel
              if (!acc?.claude_model && sysKeys.anthropicModel) userClaudeModel = sysKeys.anthropicModel
              if (!acc?.openai_model && sysKeys.openaiModel) userOpenAiModel = sysKeys.openaiModel
            }
          } catch { /* settings unavailable */ }
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
          const { animalId, filename, mimeType, allowedRoles, pageNumber, documentId, language = 'de', requestedDocumentType = 'auto' } = msg
          const pageNum = pageNumber ?? 1
          const normalizedAllowedRoles = normalizeAllowedRoles(allowedRoles)
          const docId = documentId || uuid()
          fastify.log.debug({ docId, animalId, filename, page: pageNum }, 'WS: upload start')
          const db = getDb()

          // Check parallel upload limits
          const currentCount = activeUploadsCount.get(accountId) || 0
          if (currentCount >= MAX_PARALLEL_UPLOADS) {
            fastify.log.warn({ accountId, currentCount }, '[WS] Parallel upload limit reached')
            send(socket, { type: 'error', message: `Zu viele parallele Uploads (max ${MAX_PARALLEL_UPLOADS})` })
            return
          }

          // Access-Check ZUERST — verhindert DB-Stubs bei jedem gescheiterten Versuch
          if (!await canAccessAnimalForUpload(db, animalId, accountId, userRole)) {
            fastify.log.error({ animalId, accountId, userRole }, '[WS] Access denied')
            send(socket, { type: 'error', message: 'Zugriff verweigert' })
            return
          }

          // Clean up stale uploading stubs from this account before starting a new one
          await db.query(
            "DELETE FROM documents WHERE added_by_account = $1 AND analysis_status = 'uploading'",
            [accountId]
          ).catch(() => {})

          // Insert stub document so document_pages FK is satisfied
          const { rows: [existingCheck] } = await db.query('SELECT id FROM documents WHERE id = $1', [docId])
          if (!existingCheck) {
            // Use 'uploading' status — not 'pending_analysis' — so incomplete stubs
            // never appear in the "pending analysis" list and are auto-cleaned on restart
            await db.query(`
              INSERT INTO documents (id, animal_id, doc_type, image_path, extracted_json, ocr_provider, added_by_account, added_by_role, allowed_roles, analysis_status)
              VALUES ($1, $2, 'general', '', '{}', 'pending', $3, $4, $5, 'uploading')
            `, [docId, animalId, accountId, userRole, JSON.stringify(normalizedAllowedRoles)])
          }

          const safeFilename = `${uuid()}_${filename.replace(/[^a-z0-9._-]/gi, '_')}`
          activeUploadsCount.set(accountId, currentCount + 1)

          uploadState = {
            animalId,
            mimeType,
            allowedRoles: normalizedAllowedRoles,
            filename: safeFilename,
            pageNumber: pageNum,
            documentId: docId,
            language,
            requestedDocumentType,
            writer: saveImageChunks(safeFilename),
            isMultiPage: pageNumber !== undefined && pageNumber > 1,
            trackingAccount: accountId
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

            // Magic Bytes Check (Best Practice: Once after upload finished)
            const type = await fileTypeFromFile(imagePath)
            const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
            if (!type || !allowedMimes.includes(type.mime)) {
              fastify.log.warn({ type, accountId, imagePath }, '[WS] Invalid file type rejected after upload')
              send(socket, { type: 'error', message: 'Ungültiger Dateityp (nur Bilder/PDF erlaubt)' })
              await unlink(imagePath).catch(() => {})
              return
            }

            // Save page to document_pages table
            await db.query(`
              INSERT INTO document_pages (document_id, page_number, image_path)
              VALUES ($1, $2, $3)
            `, [uploadState.documentId, uploadState.pageNumber, imagePath])

            // Update main document thumbnail if it's the first page
            if (uploadState.pageNumber === 1) {
              await db.query('UPDATE documents SET image_path = $1 WHERE id = $2', [imagePath, uploadState.documentId])
            }

            if (msg.is_last !== true) {
              send(socket, { type: 'page_saved', documentId: uploadState.documentId, pageNumber: uploadState.pageNumber, message: `Seite ${uploadState.pageNumber} gespeichert.` })
              return
            }

            // Last page: Run central analysis pipeline
            send(socket, { type: 'status', message: 'Analysiere Dokument...' })
            
            // Get minimal doc object for analysis
            const doc = { id: uploadState.documentId, animal_id: uploadState.animalId, image_path: imagePath }
            
            const result = await runDocumentAnalysis(db, doc, accountId, {
              provider: 'auto',
              model: null,
              language: uploadState.language,
              requestedDocumentType: uploadState.requestedDocumentType
            }, fastify.log, req.ip)

            await logAudit(db, {
              accountId, role: userRole, action: 'upload_document', resource: 'document', resourceId: uploadState.documentId,
              details: { doc_type: result.extractedData.type || result.suggestedType, pages: result.pagesCount, ocr_provider: result.provider, requested_document_type: uploadState.requestedDocumentType },
              ip: req.ip
            })

            // Track animal scan for vets/authorities
            if ((userRole === 'vet' || userRole === 'authority') && uploadState.animalId) {
              await db.query('INSERT INTO animal_scans (id, animal_id, account_id, scanned_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)', [uuid(), uploadState.animalId, accountId]).catch(() => {})
            }

            send(socket, {
              type: 'result',
              data: {
                documentId: uploadState.documentId,
                docType: result.extractedData.type || result.suggestedType,
                pages: result.pagesCount,
                suggestedType: result.extractedData.type || result.suggestedType,
                ocrProvider: result.provider,
                analysisStatus: result.nextStatus,
                analysisError: result.requiresRetry ? 'Analyse unvollständig' : null
              }
            })
          } catch (err) {
            fastify.log.error({ err }, 'WS: Analysis error')
            
            // Map common errors to user-friendly messages
            let errorMsg = err.message
            if (err.message === 'budget_exceeded') errorMsg = 'KI-Budget überschritten'
            if (err.message === 'fallback_disabled') errorMsg = 'KI-System-Fallback deaktiviert'
            
            send(socket, { type: 'error', message: errorMsg })

            // On failure, ensure document stays in pending_analysis
            const db = getDb()
            await db.query("UPDATE documents SET analysis_status = 'pending_analysis' WHERE id = $1", [uploadState?.documentId]).catch(() => {})
          } finally {
            if (uploadState?.trackingAccount) {
              const current = (activeUploadsCount.get(uploadState.trackingAccount) || 1) - 1
              if (current <= 0) {
                activeUploadsCount.delete(uploadState.trackingAccount)
              } else {
                activeUploadsCount.set(uploadState.trackingAccount, current)
              }
            }
            uploadState = null
          }
          break
        }

        default:
          send(socket, { type: 'error', message: `Unbekannter Nachrichtentyp: ${msg.type}` })
      }
    })

    socket.on('error', (err) => fastify.log.error({ err }, 'WS socket error'))

    socket.on('close', () => {
      try { uploadState?.writer?.end() } catch {}
      if (uploadState?.trackingAccount) {
        const current = (activeUploadsCount.get(uploadState.trackingAccount) || 1) - 1
        if (current <= 0) {
          activeUploadsCount.delete(uploadState.trackingAccount)
        } else {
          activeUploadsCount.set(uploadState.trackingAccount, current)
        }
      }
      uploadState = null
    })
  })
}

function send(socket, obj) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(obj))
  }
}
