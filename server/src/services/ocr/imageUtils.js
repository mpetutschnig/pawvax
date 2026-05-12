import { readFileSync } from 'fs'
import { normalizeDocumentType } from './prompts.js'

export function loadImageAsBase64(imagePath) {
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'
  return { base64, mimeType }
}

// Recursive sanitization to prevent Stored XSS in extracted JSON
export function sanitizeStructuredData(data) {
  if (data === null || data === undefined) return data
  if (typeof data === 'string') {
    return data
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }
  if (Array.isArray(data)) return data.map(item => sanitizeStructuredData(item))
  if (typeof data === 'object') {
    const sanitized = {}
    for (const key in data) sanitized[key] = sanitizeStructuredData(data[key])
    return sanitized
  }
  return data
}

function normalizeDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null
  const trimmed = dateStr.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const germanMonths = {
    'januar': '01', 'jan': '01', 'january': '01',
    'februar': '02', 'feb': '02', 'february': '02',
    'märz': '03', 'mär': '03', 'maerz': '03', 'march': '03',
    'april': '04', 'apr': '04',
    'mai': '05', 'may': '05',
    'juni': '06', 'jun': '06', 'june': '06',
    'juli': '07', 'jul': '07', 'july': '07',
    'august': '08', 'aug': '08',
    'september': '09', 'sep': '09', 'sept': '09',
    'oktober': '10', 'okt': '10', 'october': '10',
    'november': '11', 'nov': '11',
    'dezember': '12', 'dez': '12', 'december': '12'
  }

  const match1 = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (match1) {
    const [, day, month, year] = match1
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const match2 = trimmed.match(/^(\d{1,2})\.\s*([a-zA-Z]+)\.\s*(\d{4})$/)
  if (match2) {
    const [, day, monthStr, year] = match2
    const monthNum = germanMonths[monthStr.toLowerCase()]
    if (monthNum) return `${year}-${monthNum}-${String(day).padStart(2, '0')}`
  }

  const match3 = trimmed.match(/^(\d{1,2})[\/\-](\d{4})$/)
  if (match3) {
    const [, month, year] = match3
    return `${year}-${String(month).padStart(2, '0')}-01`
  }

  const match4 = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match4) {
    const [, month, day, year] = match4
    const m = parseInt(month), d = parseInt(day)
    if (m > 12 && d <= 12) return `${year}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  return null
}

export function normalizeDateFields(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(item => normalizeDateFields(item))

  const dateFieldNames = [
    'date', 'datum', 'administration_date', 'administered_at', 'valid_until', 'gueltig_bis',
    'document_date', 'birthdate', 'nextDue', 'next_due', 'expires_at', 'expiry_date',
    'next_due_at', 'valid_from', 'expiry_date_of_vial', 'chip_date', 'tattoo_date', 'date_issued'
  ]

  const normalized = { ...obj }
  for (const key in normalized) {
    if (dateFieldNames.includes(key) && typeof normalized[key] === 'string') {
      normalized[key] = normalizeDate(normalized[key])
    } else if (typeof normalized[key] === 'object' && normalized[key] !== null) {
      normalized[key] = normalizeDateFields(normalized[key])
    }
  }
  return normalized
}

export function normalizeConfidenceValue(value) {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined
    return Number((value > 1 ? value / 100 : value).toFixed(2))
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number.parseFloat(trimmed.replace('%', '').replace(',', '.'))
    if (!Number.isFinite(parsed)) return undefined
    return Number(((trimmed.includes('%') || parsed > 1 ? parsed / 100 : parsed)).toFixed(2))
  }
  return undefined
}

export function normalizeModelMetadata(record) {
  if (!record || typeof record !== 'object') return record
  const confidence = normalizeConfidenceValue(record.confidence)
  return confidence === undefined ? record : { ...record, confidence }
}

export function extractClassificationConfidence(text) {
  if (!text) return undefined
  const percentMatch = text.match(/(\d+)\s*%/)
  if (percentMatch) {
    const percent = Number(percentMatch[1])
    return Math.min(100, Math.max(0, percent)) / 100
  }
  const decimalMatch = text.match(/confidence[:\s]+([0-9.]+)/i)
  if (decimalMatch) {
    const value = Number(decimalMatch[1])
    if (!Number.isFinite(value)) return undefined
    return value > 1 ? value / 100 : value
  }
  return undefined
}

function extractBalancedJsonCandidate(text) {
  const source = String(text || '')
  let startIndex = -1
  let depth = 0
  let inString = false
  let escaping = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (inString) {
      if (escaping) { escaping = false }
      else if (char === '\\') { escaping = true }
      else if (char === '"') { inString = false }
      continue
    }
    if (char === '"') { inString = true; continue }
    if (char === '{' || char === '[') {
      if (depth === 0) startIndex = index
      depth += 1
      continue
    }
    if (char === '}' || char === ']') {
      if (depth === 0) continue
      depth -= 1
      if (depth === 0 && startIndex >= 0) return source.slice(startIndex, index + 1)
    }
  }
  return null
}

export function parseStructuredModelResponse(text, provider, documentType = 'general', typeConfidence = null) {
  const trimmed = String(text || '').trim()
  const candidates = [trimmed]

  const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
  for (const match of fencedMatches) {
    if (match[1]) candidates.push(match[1].trim())
  }

  const balanced = extractBalancedJsonCandidate(trimmed)
  if (balanced) candidates.push(balanced)

  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const parsed = JSON.parse(candidate)
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') continue
      const sanitized = sanitizeStructuredData(parsed)
      const result = normalizeModelMetadata(normalizeDateFields({ type: normalizeDocumentType(documentType), ...sanitized }))
      if (typeConfidence !== null && typeConfidence !== undefined) {
        result.type_confidence = normalizeConfidenceValue(typeConfidence)
      }
      return result
    } catch {
      continue
    }
  }

  const preview = trimmed.replace(/\s+/g, ' ').slice(0, 240)
  throw Object.assign(new Error(`No JSON in ${provider} response${preview ? `: ${preview}` : ''}`), { code: 422 })
}
