import { randomUUID } from 'crypto'
import { decrypt } from '../utils/crypto.js'
import { isAllowedModel, resolveModel } from '../utils/aiModels.js'
import { getSettingsMap, getSystemAiKeys } from './appSettings.js'
import { analyzeDocument, buildExtractedDocumentData, normalizeDocumentType } from './ocr.js'
import { flagDuplicates } from './dedup.js'

export async function getDocumentPages(db, documentId) {
  const { rows } = await db.query(`
    SELECT page_number, image_path
    FROM document_pages
    WHERE document_id = $1
    ORDER BY page_number ASC
  `, [documentId])
  return rows
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

export async function runDocumentAnalysis(db, doc, accountId, options, log, reqIp = null) {
  const { provider: requestedProvider, model: requestedModel, language = 'de', requestedDocumentType = null } = options
  const docId = doc.id

  if (requestedProvider && requestedModel && !isAllowedModel(requestedProvider, requestedModel)) {
    throw Object.assign(new Error('Ausgewähltes KI-Modell nicht verfügbar. Bitte ein anderes Modell wählen.'), { code: 400 })
  }

  // Get user's keys and models
  const { rows: [acc] } = await db.query('SELECT gemini_token, gemini_model, anthropic_token, claude_model, openai_token, openai_model, ai_provider_priority, system_fallback_enabled, billing_budget_eur FROM accounts WHERE id = $1', [accountId])

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
      if (Array.isArray(parsed) && parsed.length > 0) priority = parsed
    }
  } catch (parseErr) {
    log.warn({ err: parseErr.message }, 'Analysis: Could not parse ai_provider_priority')
  }

  if (requestedProvider && typeof requestedProvider === 'string') {
    priority = [requestedProvider]
  }

  if (!Array.isArray(priority)) priority = ['system', 'google', 'anthropic', 'openai']

  if (priority.includes('system')) {
    const sysKeys = await getSystemAiKeys(db)
    if (!userGeminiKey) userGeminiKey = sysKeys.geminiKey
    if (!userAnthropicKey) userAnthropicKey = sysKeys.anthropicKey
    if (!userOpenAiKey) userOpenAiKey = sysKeys.openaiKey
  }

  const pages = await getDocumentPages(db, docId)
  const analysisPages = pages.length > 0 ? pages : [{ page_number: 1, image_path: doc.image_path }]

  if (!analysisPages[0]?.image_path) {
    throw new Error('Keine gespeicherten Dokumentseiten für die Analyse gefunden')
  }

  // Budget/fallback check
  const hasOwnKey = !!(acc?.gemini_token || acc?.anthropic_token || acc?.openai_token)
  if (!hasOwnKey) {
    if (!(acc?.system_fallback_enabled ?? 1)) throw Object.assign(new Error('fallback_disabled'), { code: 422 })
    if (acc?.billing_budget_eur != null) {
      const settings = await getSettingsMap(db)
      const pricePerPageCents = Number(settings.billing_price_per_page ?? 0)
      if (pricePerPageCents > 0) {
        const { rows: [usageRow] } = await db.query(
          `SELECT COALESCE(SUM(pages_analyzed), 0) AS used FROM usage_logs WHERE account_id = $1 AND is_system_fallback = 1`,
          [accountId]
        )
        const usedCostEur = (Number(usageRow?.used ?? 0) * pricePerPageCents) / 100
        const newCostEur = (analysisPages.length * pricePerPageCents) / 100
        if (usedCostEur + newCostEur > acc.billing_budget_eur) {
          throw Object.assign(new Error('budget_exceeded'), { code: 422 })
        }
      }
    }
  }

  const result = await analyzeDocumentPages(analysisPages, {
    userGeminiKey, userGeminiModel, userAnthropicKey, userClaudeModel, userOpenAiKey, userOpenAiModel,
    priority, language, requestedDocumentType,
    onProgress: (pageNumber, message) => log.debug({ docId, pageNumber, message }, 'Analysis page progress')
  })

  await flagDuplicates(db, doc.animal_id, docId, result.suggestedType, result.pageResults)

  const extractedData = buildExtractedDocumentData({
    combinedText: result.combinedText,
    suggestedType: result.suggestedType,
    pageResults: result.pageResults,
    pages: analysisPages.length
  })

  const requiresRetry = extractedData?.extraction_quality?.requires_retry === true
  const nextStatus = requiresRetry ? 'pending_analysis' : 'completed'
  await syncChipTagFromDocument(db, doc.animal_id, extractedData)

  await db.query(`
    UPDATE documents
    SET extracted_json = $1, ocr_provider = $2, analysis_status = $3, doc_type = $4, image_path = $5
    WHERE id = $6
  `, [JSON.stringify(extractedData), result.provider, nextStatus, extractedData.type, analysisPages[0].image_path, docId])

  if (nextStatus === 'completed') {
    try {
      await db.query(
        `INSERT INTO usage_logs (id, account_id, document_id, pages_analyzed, ocr_provider, model_used, is_system_fallback, analyzed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [randomUUID(), accountId, docId, analysisPages.length, result.provider, result.provider, hasOwnKey ? 0 : 1]
      )
    } catch (usageErr) {
      log.warn({ err: usageErr }, 'Analysis: Failed to insert usage_log')
    }
  }

  return { extractedData, provider: result.provider, nextStatus, requiresRetry, pagesCount: analysisPages.length, suggestedType: result.suggestedType, pageResults: result.pageResults, combinedText: result.combinedText }
}
