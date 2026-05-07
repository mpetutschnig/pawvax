import { v4 as uuid } from 'uuid'
import { createHash } from 'node:crypto'
import { getDb } from '../db/index.js'
import { analyzeDocument, buildExtractedDocumentData, normalizeDocumentType, classifyDocumentType } from '../services/ocr.js'
import { saveImageChunks } from '../services/storage.js'
import { decrypt } from '../utils/crypto.js'
import { logAudit } from '../services/audit.js'
import { flagDuplicates } from '../services/dedup.js'
import { resolveModel } from '../utils/aiModels.js'
import { getSettingsMap } from '../services/appSettings.js'

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

async function syncChipTagFromDocument(db, animalId, extractedData) {
  if (normalizeDocumentType(extractedData?.type) !== 'pet_passport') return

  const chipCode = [
    extractedData?.identification?.chip_code,
    extractedData?.payload?.identification?.chip_code,
    ...(extractedData?.page_results || []).map((page) => page?.identification?.chip_code)
  ].find((value) => typeof value === 'string' && value.trim().length > 0)?.trim()

  if (!chipCode) return

  const { rows: [existing] } = await db.query('SELECT animal_id FROM animal_tags WHERE tag_id = $1', [chipCode])
  if (!existing) {
    await db.query('INSERT INTO animal_tags (tag_id, animal_id, tag_type) VALUES ($1, $2, $3)', [chipCode, animalId, 'chip'])
  }
}

export default async function wsDocumentUpload(fastify) {
  fastify.get('/ws', { websocket: true }, async (socket, req) => {
    let accountId, userRole, userGeminiKey = null, userGeminiModel = null, userAnthropicKey = null, userClaudeModel = null
    let userOpenAiKey = null, userOpenAiModel = null, userPriority = ['system', 'google', 'anthropic', 'openai']
    let userSystemFallbackEnabled = 1, userBillingBudgetEur = null, userPricePerPageCents = 0
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
          try {
            const settingsMap = await getSettingsMap(db)
            userPricePerPageCents = Number(settingsMap.billing_price_per_page ?? 0)
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
            await db.query(`
              INSERT INTO document_pages (document_id, page_number, image_path)
              VALUES ($1, $2, $3)
            `, [uploadState.documentId, uploadState.pageNumber, imagePath])

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
            const { rows: pages } = await db.query(`
              SELECT page_number, image_path FROM document_pages
              WHERE document_id = $1
              ORDER BY page_number ASC
            `, [uploadState.documentId])

            // Check if analysis should be skipped (fallback disabled or budget exceeded)
            const hasOwnKey = !!(userGeminiKey || userAnthropicKey || userOpenAiKey)
            let skipReason = null
            if (!hasOwnKey) {
              if (!userSystemFallbackEnabled) {
                skipReason = 'fallback_disabled'
              } else if (userBillingBudgetEur !== null && userPricePerPageCents > 0) {
                const { rows: [usageRow] } = await db.query(
                  `SELECT COALESCE(SUM(pages_analyzed), 0) AS used FROM usage_logs WHERE account_id = $1 AND is_system_fallback = 1`,
                  [accountId]
                )
                const usedCostEur = (Number(usageRow?.used ?? 0) * userPricePerPageCents) / 100
                const newCostEur = (pages.length * userPricePerPageCents) / 100
                if (usedCostEur + newCostEur > userBillingBudgetEur) {
                  skipReason = 'budget_exceeded'
                }
              }
            }
            if (skipReason) {
              send(socket, { type: 'status', status: 'pending', reason: skipReason })
            }

            // Analyze each page and combine text
            let combinedText = ''
            const pageResults = []
            const detectedTypes = []
            let lastProvider = 'gemini'
            let analysisError = skipReason ? Object.assign(new Error(skipReason), { skipReason }) : null
            if (!skipReason) {
            for (const page of pages) {
              try {
                const pageStartTime = Date.now()
                const result = await analyzeDocument(page.image_path, userGeminiKey, userGeminiModel, (progressMsg) => {
                  send(socket, { type: 'status', message: `Seite ${page.page_number}: ${progressMsg}` })
                }, userAnthropicKey, userClaudeModel, userOpenAiKey, userOpenAiModel, userPriority, uploadState.language, uploadState.requestedDocumentType)
                const pageElapsed = Date.now() - pageStartTime
                fastify.log.debug({ pageNumber: page.page_number, elapsedMs: pageElapsed, provider: result.provider }, 'WS: Page analysis completed')
                pageResults.push(result.data)
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
                lastProvider = result.provider
              } catch (err) {
                const db = getDb()
                fastify.log.error({ err: { message: err.message, stack: err.stack }, pageNumber: page.page_number, documentId: uploadState.documentId }, 'WS: Error analyzing page')
                analysisError = err
                // Store error but continue - will save as pending_analysis
                send(socket, { type: 'status', message: `⚠️ Fehler bei Analyse: ${err.message}` })
                
                // Log to audit with full error details
                try {
                  await logAudit(db, {
                    accountId, role: userRole, action: 'ws_ocr_error', resource: 'document', resourceId: uploadState.documentId,
                    details: { 
                      error_message: err.message,
                      page_number: page.page_number,
                      requested_document_type: uploadState.requestedDocumentType
                    },
                    ip: req.ip
                  })
                } catch (auditErr) {
                  fastify.log.warn({ err: auditErr }, 'Failed to log WS OCR error to audit')
                }
              }
            }
            } // end if (!skipReason)

            // Use Gemini to suggest type and tags from combined text
            let suggestedType = normalizeDocumentType(uploadState.requestedDocumentType) || detectedTypes[0] || 'general'
            if (uploadState.requestedDocumentType === 'auto' && !detectedTypes.length && combinedText && userGeminiKey) {
              try {
                send(socket, { type: 'status', message: 'Erzeuge Vorschläge mit KI...' })
                const typeGuess = await guessDocumentType(combinedText, userGeminiKey, userGeminiModel)
                suggestedType = normalizeDocumentType(typeGuess)
              } catch (err) {
                fastify.log.error({ err }, 'WS: Error guessing document type')
              }
            }

            send(socket, { type: 'status', message: 'Speichere Ergebnis...' })

            // Flag duplicate records across existing documents of the same animal
            if (!analysisError) {
              await flagDuplicates(db, uploadState.animalId, uploadState.documentId, suggestedType, pageResults)
            }

            // Create document with combined pages
            const docId = uploadState.documentId
            const extractedData = analysisError
              ? { pages: pages.length, error: analysisError.message, error_type: analysisError.name || 'unknown', error_details: analysisError.message }
              : buildExtractedDocumentData({ combinedText, suggestedType, pageResults, pages: pages.length })
            const analysisStatus = analysisError ? 'pending_analysis' : (extractedData?.extraction_quality?.requires_retry ? 'pending_analysis' : 'completed')

            if (!analysisError) {
              await syncChipTagFromDocument(db, uploadState.animalId, extractedData)
            }

            // Check if document already exists
            const { rows: [existingDoc] } = await db.query('SELECT id FROM documents WHERE id = $1', [docId])

            if (existingDoc) {
              // Update existing document
              await db.query(`
                UPDATE documents
                SET doc_type = $1, image_path = $2, extracted_json = $3, ocr_provider = $4, added_by_account = $5, added_by_role = $6, allowed_roles = $7, analysis_status = $8
                WHERE id = $9
              `, [
                extractedData.type || suggestedType,
                pages[0].image_path,
                JSON.stringify(extractedData),
                lastProvider,
                accountId,
                userRole,
                JSON.stringify(uploadState.allowedRoles),
                analysisStatus,
                docId
              ])
            } else {
              // Insert new document
              await db.query(`
                INSERT INTO documents (id, animal_id, doc_type, image_path, extracted_json, ocr_provider, added_by_account, added_by_role, allowed_roles, analysis_status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              `, [
                docId,
                uploadState.animalId,
                extractedData.type || suggestedType,
                pages[0].image_path,
                JSON.stringify(extractedData),
                lastProvider,
                accountId,
                userRole,
                JSON.stringify(uploadState.allowedRoles),
                analysisStatus
              ])
            }

            await logAudit(db, {
              accountId, role: userRole, action: 'upload_document', resource: 'document', resourceId: docId,
              details: { doc_type: extractedData.type || suggestedType, pages: pages.length, ocr_provider: lastProvider, requested_document_type: uploadState.requestedDocumentType },
              ip: req.ip
            })

            if (analysisStatus === 'completed') {
              try {
                const isSystemFallback = !userGeminiKey && !userAnthropicKey && !userOpenAiKey ? 1 : 0
                await db.query(
                  `INSERT INTO usage_logs (id, account_id, document_id, pages_analyzed, ocr_provider, model_used, is_system_fallback, analyzed_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
                  [uuid(), accountId, docId, pages.length, lastProvider, lastProvider, isSystemFallback]
                )
              } catch (usageErr) {
                fastify.log.warn({ err: usageErr }, 'WS: Failed to insert usage_log')
              }
            }

            // Track animal scan for vets/authorities
            if ((userRole === 'vet' || userRole === 'authority') && uploadState.animalId) {
              try {
                await db.query(`
                  INSERT INTO animal_scans (id, animal_id, account_id, scanned_at)
                  VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                `, [uuid(), uploadState.animalId, accountId])
              } catch (err) {
                fastify.log.warn({ err }, 'WS: Failed to track animal scan')
              }
            }

            send(socket, {
              type: 'result',
              data: {
                documentId: docId,
                docType: extractedData.type || suggestedType,
                pages: pages.length,
                suggestedType: extractedData.type || suggestedType,
                ocrProvider: lastProvider,
                analysisStatus,
                analysisError: analysisError ? (extractedData.error_details || extractedData.error || analysisError.message) : null
              }
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

    socket.on('close', async () => {
      if (uploadState?.documentId) {
        const db = getDb()
        await db.query(
          "DELETE FROM documents WHERE id = $1 AND analysis_status = 'uploading'",
          [uploadState.documentId]
        ).catch(() => {})
        try { uploadState.writer?.end() } catch {}
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

async function guessDocumentType(text, geminiKey, modelId = 'gemini-3.1-flash-lite-preview') {
  if (!geminiKey) return 'general'
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(geminiKey)
    const model = genAI.getGenerativeModel({ model: modelId })

    const prompt = `Based on the following extracted document text, determine what type of veterinary document this is.
Return ONLY one word from this list: vaccination, pedigree, dog_certificate, medical_product, general

DOCUMENT_TYPES:
- vaccination: Impfpass, Impfbescheinigung, shows Impfstoffe and dates
- pedigree: Stammbaum, Urkunde, Zuchtdokument with Registrierungsnummer
- dog_certificate: Hundeführerschein, Sachkundenachweis with Prüfbewertung
- medical_product: Medikamentenbeschreibung, Packungsbeilage, Wirkstoff/Dosierung
- general: Gesundheitsbericht, Laborbefund, allgemeines Tierdokument

Text: ${text.slice(0, 800)}`

    const result = await model.generateContent(prompt)
    const response = result.response.text().toLowerCase().trim()
    const classified = normalizeDocumentType(response)
    return classified
  } catch (err) {
    fastify.log.error({ err }, 'guessDocumentType error')
    return 'general'
  }
}
