import { existsSync } from 'fs'
import { resolve } from 'path'
import { UPLOADS_DIR } from '../../utils/paths.js'
import { getOcrLogger } from './logger.js'
import { getPromptForDocumentType, withConfidenceInstructions, normalizeDocumentType, normalizeRequestedDocumentType } from './prompts.js'
import { normalizeConfidenceValue, normalizeModelMetadata } from './imageUtils.js'
import { analyzeImageWithProvider, classifyImageWithProvider } from './providers.js'
import { analyzeWithMockOcr } from './mock.js'

export async function analyzeDocument(imagePath, userGeminiKey = null, model = null, onProgress = null, userAnthropicKey = null, claudeModel = null, userOpenAiKey = null, openAiModel = null, priority = ['google', 'anthropic', 'openai'], language = 'de', requestedDocumentType = null) {
  const log = getOcrLogger()
  if (onProgress) onProgress('Initializing OCR analysis...')

  const normalizedLanguage = language === 'en' ? 'en' : 'de'
  const forcedDocumentType = normalizeRequestedDocumentType(requestedDocumentType)

  const absolutePath = resolve(UPLOADS_DIR, imagePath)
  if (!existsSync(absolutePath)) {
    throw Object.assign(new Error(`Document file not found: ${imagePath}`), { code: 404 })
  }

  if (process.env.NODE_ENV === 'test' && process.env.PAW_MOCK_OCR === '1') {
    return analyzeWithMockOcr(absolutePath, onProgress, normalizedLanguage, forcedDocumentType)
  }

  try {
    const classificationResult = forcedDocumentType
      ? { type: forcedDocumentType, confidence: null }
      : await classifyDocumentType(absolutePath, userGeminiKey, userAnthropicKey, userOpenAiKey, priority, normalizedLanguage)

    const documentType = classificationResult.type
    const typeConfidence = classificationResult.confidence
    const prompt = withConfidenceInstructions(getPromptForDocumentType(documentType, normalizedLanguage), normalizedLanguage)

    const providerKeyMap = {
      google: { key: userGeminiKey, model },
      anthropic: { key: userAnthropicKey, model: claudeModel },
      openai: { key: userOpenAiKey, model: openAiModel }
    }

    for (const provider of priority) {
      const { key, model: providerModel } = providerKeyMap[provider] || {}
      if (key) {
        log.info({ provider, model: providerModel, documentType, typeConfidence }, 'OCR analysis starting')
        return await analyzeImageWithProvider(provider, key, providerModel, absolutePath, prompt, documentType, typeConfidence, onProgress)
      }
    }

    // Fallback if priority loop found no match but keys exist
    if (userGeminiKey) return await analyzeImageWithProvider('google', userGeminiKey, model, absolutePath, prompt, documentType, typeConfidence, onProgress)
    if (userAnthropicKey) return await analyzeImageWithProvider('anthropic', userAnthropicKey, claudeModel, absolutePath, prompt, documentType, typeConfidence, onProgress)
    if (userOpenAiKey) return await analyzeImageWithProvider('openai', userOpenAiKey, openAiModel, absolutePath, prompt, documentType, typeConfidence, onProgress)

    throw Object.assign(new Error('Analysis not possible. No API tokens configured.'), { code: 401 })
  } catch (err) {
    log.error({ err: { message: err.message, stack: err.stack } }, 'OCR failed')
    throw err
  }
}

export async function classifyDocumentType(imagePath, userGeminiKey = null, userAnthropicKey = null, userOpenAiKey = null, priority = ['google', 'anthropic', 'openai'], language = 'de') {
  const log = getOcrLogger()
  try {
    const lang = language === 'en' ? 'en' : 'de'
    const providerKeyMap = { google: userGeminiKey, anthropic: userAnthropicKey, openai: userOpenAiKey }
    for (const provider of priority) {
      const key = providerKeyMap[provider]
      if (key) return await classifyImageWithProvider(provider, key, imagePath, lang)
    }
    return { type: 'general', confidence: 0.5 }
  } catch (err) {
    log.warn({ err: err.message }, 'Document classification failed, defaulting to general')
    return { type: 'general', confidence: 0.5 }
  }
}

// --- Helpers ---

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '')
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim().length > 0))]
}

function average(values) {
  if (!values.length) return undefined
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
}

function calculateRecordCompleteness(record, keys) {
  if (!record || !keys.length) return 0
  const filled = keys.filter((key) => {
    const value = record[key]
    if (Array.isArray(value)) return value.length > 0
    return value !== null && value !== undefined && value !== ''
  }).length
  return Number((filled / keys.length).toFixed(2))
}

function getNestedArray(source, key) {
  if (!source || typeof source !== 'object') return []
  const direct = source[key]
  if (Array.isArray(direct)) return direct
  const extractedText = source.extracted_text
  if (extractedText && Array.isArray(extractedText[key])) return extractedText[key]
  return []
}

function firstNonEmptyArray(...candidates) {
  return candidates.find((candidate) => Array.isArray(candidate) && candidate.length > 0) || []
}

function collectListRecords(pageResults, primaryKey, fallbackKey = primaryKey) {
  return pageResults.flatMap((page) => {
    if (Array.isArray(page)) return page
    const payload = page?.payload || {}
    return firstNonEmptyArray(
      getNestedArray(payload, primaryKey),
      getNestedArray(page, primaryKey),
      getNestedArray(payload, fallbackKey),
      getNestedArray(page, fallbackKey)
    )
  })
}

function collectTextFragments(pageResults) {
  return pageResults.flatMap((page) => {
    const payload = page?.payload || {}
    const tags = [
      ...(Array.isArray(page?.tags) ? page.tags : []),
      ...(Array.isArray(payload?.tags) ? payload.tags : []),
      ...(Array.isArray(page?.suggested_tags) ? page.suggested_tags : []),
      ...(Array.isArray(payload?.suggested_tags) ? payload.suggested_tags : [])
    ]
    return [page?.title, payload?.title, page?.summary, payload?.summary, page?.text, payload?.text, page?.extracted_text, payload?.extracted_text, ...tags].filter(Boolean)
  })
}

function collectModelConfidences(pageResults) {
  return pageResults
    .flatMap((page) => [page?.confidence, page?.payload?.confidence])
    .map(normalizeConfidenceValue)
    .filter((value) => value !== undefined)
}

function isVaccinationLikeDocument(pageResults) {
  const fragments = collectTextFragments(pageResults)
    .map((value) => typeof value === 'string' ? value : '')
    .join(' ')
    .toLowerCase()

  if (!fragments) return false

  const strongVaccinationSignals = [/impfpass/, /impfungen/, /vaccination/, /vaccine/, /heimtierausweis/, /nobivac/, /eurican/, /boehringer/, /msd animal health/, /virbac/]
  return strongVaccinationSignals.filter((pattern) => pattern.test(fragments)).length >= 2
}

function inferSuggestedType(suggestedType, pageResults) {
  if (suggestedType !== 'general') return suggestedType
  const vaccinations = collectListRecords(pageResults, 'vaccinations')
  if (vaccinations.length > 0) return 'vaccination'
  if (isVaccinationLikeDocument(pageResults)) return 'vaccination'
  const treatments = collectListRecords(pageResults, 'treatments', 'treatment_log')
  if (treatments.length > 0) return 'treatment'
  return suggestedType
}

function evaluateExtractionQuality(type, payload, pageResults, typeConfidence = null) {
  const modelConfidence = average(collectModelConfidences(pageResults))

  if (type === 'vaccination') {
    const vaccinations = Array.isArray(payload?.vaccinations) ? payload.vaccinations : []
    const retryReasons = []
    if (!vaccinations.length && isVaccinationLikeDocument(pageResults)) {
      retryReasons.push('vaccination_signals_without_structured_records')
    }
    const completenessScore = vaccinations.length
      ? average(vaccinations.map((record) => calculateRecordCompleteness(record, ['vaccine_name', 'administration_date', 'batch_number', 'valid_until'])))
      : 0
    const quality = { requires_retry: retryReasons.length > 0, retry_reasons: retryReasons, model_confidence: modelConfidence, schema_valid: vaccinations.every((record) => record && typeof record === 'object'), domain_valid: vaccinations.length > 0 || retryReasons.length === 0, completeness_score: completenessScore || 0 }
    if (typeConfidence !== null && typeConfidence !== undefined) quality.type_confidence = normalizeConfidenceValue(typeConfidence)
    return quality
  }

  const quality = { requires_retry: false, retry_reasons: [], model_confidence: modelConfidence, schema_valid: true, domain_valid: true, completeness_score: 1 }
  if (typeConfidence !== null && typeConfidence !== undefined) quality.type_confidence = normalizeConfidenceValue(typeConfidence)
  return quality
}

export function buildExtractedDocumentData({ combinedText, suggestedType, pageResults, pages }) {
  const effectiveSuggestedType = inferSuggestedType(suggestedType, pageResults)
  const firstPage = pageResults[0] || {}
  const animal = firstDefined(...pageResults.map(page => page?.animal).filter(Boolean))
  const title = firstDefined(...pageResults.map(page => page?.title), firstPage.title)
  const documentDate = firstDefined(...pageResults.map(page => page?.document_date), firstPage.document_date)
  const summary = firstDefined(...pageResults.map(page => page?.summary), firstPage.summary)
  const suggestedTags = uniqueStrings(pageResults.flatMap(page => page?.suggested_tags || page?.payload?.suggested_tags || []))
  const confidence = average(collectModelConfidences(pageResults))

  const extracted = {
    type: effectiveSuggestedType,
    text: combinedText,
    pages,
    page_results: pageResults,
    ...(title ? { title } : {}),
    ...(documentDate ? { document_date: documentDate } : {}),
    ...(summary ? { summary } : {}),
    ...(animal ? { animal } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(suggestedTags.length ? { suggested_tags: suggestedTags } : {})
  }

  if (effectiveSuggestedType === 'vaccination') {
    const vaccinations = collectListRecords(pageResults, 'vaccinations')
    const extractionQuality = evaluateExtractionQuality(effectiveSuggestedType, { vaccinations }, pageResults)
    return { ...extracted, extraction_quality: extractionQuality, vaccinations, payload: { type: effectiveSuggestedType, ...(title ? { title } : {}), ...(documentDate ? { document_date: documentDate } : {}), ...(summary ? { summary } : {}), ...(animal ? { animal } : {}), ...(confidence !== undefined ? { confidence } : {}), ...(suggestedTags.length ? { suggested_tags: suggestedTags } : {}), vaccinations } }
  }

  if (effectiveSuggestedType === 'treatment') {
    const treatments = collectListRecords(pageResults, 'treatments', 'treatment_log')
    const extractionQuality = evaluateExtractionQuality(effectiveSuggestedType, { treatments }, pageResults)
    return { ...extracted, extraction_quality: extractionQuality, treatments, payload: { type: effectiveSuggestedType, ...(title ? { title } : {}), ...(documentDate ? { document_date: documentDate } : {}), ...(summary ? { summary } : {}), ...(animal ? { animal } : {}), ...(confidence !== undefined ? { confidence } : {}), ...(suggestedTags.length ? { suggested_tags: suggestedTags } : {}), treatments } }
  }

  const extractionQuality = evaluateExtractionQuality(effectiveSuggestedType, firstPage, pageResults)
  return {
    ...firstPage,
    ...extracted,
    extraction_quality: extractionQuality,
    payload: { ...firstPage, ...(title ? { title } : {}), ...(documentDate ? { document_date: documentDate } : {}), ...(summary ? { summary } : {}), ...(animal ? { animal } : {}), ...(confidence !== undefined ? { confidence } : {}), ...(suggestedTags.length ? { suggested_tags: suggestedTags } : {}) }
  }
}
