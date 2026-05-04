import { createWorker } from 'tesseract.js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Module-level logger — replaced by setOcrLogger() on startup
let _log = {
  debug: () => {},
  info: () => {},
  warn: (data, msg) => process.stderr.write(JSON.stringify({ level: 'warn', name: 'ocr', ...data, msg }) + '\n'),
  error: (data, msg) => process.stderr.write(JSON.stringify({ level: 'error', name: 'ocr', ...data, msg }) + '\n'),
}
export function setOcrLogger(log) { _log = log }

// Document type-specific extraction prompts
const CLASSIFICATION_PROMPT = `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere das folgende Tierdokument und klassifiziere es genau.

DOKUMENTTYPEN (exakte Beschreibung):

1. "vaccination" — Impfpass, Impfbescheinigung, Impfprotokoll
   - Zeigt: Tierart, Name, Geburtsdatum, Impfstoff(e), Impfdatum(e), nächste Auffrischung, Unterschrift Tierarzt
   - NICHT: allgemeine Gesundheitsberichte, Medikamentenrechnungen, Behandlungsberichte ohne Impfinformationen

2. "pedigree" — Stammbaum, Urkunde, Zuchtdokument, Registrierung
   - Zeigt: Zuchtverband-Logo, Pedigree-/Stammbaum-Grafik, Eltern/Vorfahren, Registrierungsnummer, Zuchtqualifikationen
   - NICHT: einfache Geburtsurkunden ohne Zuchtverbandsstempel, Impfpässe

3. "dog_certificate" — Hundeführerschein, Sachkundenachweis, Prüfzertifikat
   - Zeigt: "Hundeführerschein" oder "Sachkundenachweis" Titel, Prüfbewertung, Bestätigung absolviert, Ausstellungsdatum
   - NICHT: Zuchtdokumente, Impfpässe, allgemeine Gesundheitsdokumente

4. "medical_product" — Medikamentenbeschreibung, Packungsbeilage, Produktdatenblatt
   - Zeigt: Medikamentename, Wirkstoff, Dosierung/Einheit, Packungsgröße, Anwendungshinweise, Hersteller/Chargennummer
   - NICHT: Impfbescheinigungen, Veterinärbehandlungsberichte, Verschreibungen ohne Produktdetails

5. "general" — allgemeines Tierdokument, Gesundheitsbericht, Behandlung, Laborbefund
   - Zeigt: Text und Informationen zum Tier, die keinem anderen Typ genau entsprechen

Antworte NUR mit dem Dokumenttyp (z.B. "vaccination"), KEINE anderen Worte.
`.trim()

// Type-specific extraction prompts
const PROMPTS_BY_TYPE = {
  vaccination: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere diesen Impfpass und gib strukturierte JSON-Daten zurück.

WICHTIGE REGELN:
1. Lies ALLE Impfeinträge sorgfältig aus (Impfstoff, Datum, nächste Auffrischung, Unterschrift Tierarzt).
2. Extrahiere Tierdaten: Name, Rasse, Geburtsdatum, Chipnummer (falls vorhanden).
3. "document_date": Hauptimpfdatum oder Ausstellungsdatum im Format YYYY-MM-DD.
4. "title": z.B. "Tollwut Impfung 2024" oder "Impfpass komplett".
5. Generiere Tags für jede Impfung: ["Tollwut", "Staupe", "Leptospirose", etc.].

Gib EXAKT diese JSON-Struktur zurück (nur valide JSON, kein Text davor/danach):
{
  "type": "vaccination",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "animal": { "name": "...", "species": "...", "breed": "...", "birthdate": "YYYY-MM-DD" },
  "vaccinations": [
    { "vaccine": "Impfstoff-Name", "date": "YYYY-MM-DD", "nextDue": "YYYY-MM-DD", "vet": "Veterinär" }
  ],
  "suggested_tags": ["tag1", "tag2"]
}
`.trim(),

  pedigree: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere dieses Zuchtdokument/Stammbaum und gib strukturierte JSON-Daten zurück.

WICHTIGE REGELN:
1. Extrahiere Registrierungsnummer und Zuchtverband (z.B. FCI, Züchterverein).
2. Lies Tier-Identität: Name, Rasse, Geburtsdatum, Farbe/Markierungen.
3. Lies Stammbauminfos: Vater, Mutter, Großeltern (falls sichtbar).
4. "document_date": Ausstellungsdatum des Stammbaums im Format YYYY-MM-DD.
5. "title": z.B. "FCI Stammbaum - Max der Labrador".

Gib EXAKT diese JSON-Struktur zurück (nur valide JSON, kein Text davor/danach):
{
  "type": "pedigree",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "animal": { "name": "...", "species": "...", "breed": "...", "birthdate": "YYYY-MM-DD" },
  "pedigree": { "registration_number": "...", "federation": "...", "sire": "...", "dam": "..." },
  "suggested_tags": ["Zucht", "Stammbaum", "FCI"]
}
`.trim(),

  dog_certificate: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere dieses Hundeführerschein-/Sachkundenachweis-Dokument und gib strukturierte JSON-Daten zurück.

WICHTIGE REGELN:
1. Extrahiere Halter-Name und Hundeinfos (Name, Rasse, Chip-Nummer).
2. Lies Prüfbewertung, Ergebnis (bestanden/nicht bestanden), Prüfdatum.
3. "document_date": Ausstellungsdatum im Format YYYY-MM-DD.
4. "title": z.B. "Hundeführerschein 2024 - Max".
5. Tags: ["Hundeführerschein", "Sachkundenachweis", "Prüfung bestanden"].

Gib EXAKT diese JSON-Struktur zurück (nur valide JSON, kein Text davor/danach):
{
  "type": "dog_certificate",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "animal": { "name": "...", "breed": "...", "chip_number": "..." },
  "certificate": { "holder_name": "...", "evaluation": "...", "passed": true/false },
  "suggested_tags": ["Hundeführerschein", "Sachkundenachweis"]
}
`.trim(),

  medical_product: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere diese Medikamenten-/Produktbeschreibung und gib strukturierte JSON-Daten zurück.

WICHTIGE REGELN:
1. Extrahiere: Produktname, Wirkstoff(e), Packungsgröße, Dosierung/Einheit, Anwendungsart.
2. Lies Hersteller, Chargennummer (falls vorhanden), Verfallsdatum.
3. Kurze Anwendungshinweise extrahieren.
4. "document_date": Datum auf dem Dokument oder Verfallsdatum im Format YYYY-MM-DD.
5. "title": z.B. "Amoxicillin 500mg - Packungsbeilage".

Gib EXAKT diese JSON-Struktur zurück (nur valide JSON, kein Text davor/danach):
{
  "type": "medical_product",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "product": {
    "name": "...",
    "active_substance": "...",
    "dosage": "...",
    "package_size": "...",
    "manufacturer": "...",
    "expiry_date": "YYYY-MM-DD"
  },
  "usage": "...",
  "suggested_tags": ["Medikament", "Wirkstoff"]
}
`.trim(),

  general: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere dieses allgemeine Tierdokument und gib strukturierte JSON-Daten zurück.

WICHTIGE REGELN:
1. Extrahiere alle erkannten Informationen: Tiername, Tierart, Daten, Text.
2. "document_date": Hauptdatum auf dem Dokument im Format YYYY-MM-DD (Bericht-Datum, Rechnung-Datum, etc.).
3. "title": Kurze Zusammenfassung des Inhalts (z.B. "Untersuchungsbericht", "Laborergebnis", "Rechnung").
4. "summary": 1-2 Sätze über den Inhalt.
5. Tags basierend auf erkannten Schlüsselworten.

Gib EXAKT diese JSON-Struktur zurück (nur valide JSON, kein Text davor/danach):
{
  "type": "general",
  "title": "...",
  "document_date": "YYYY-MM-DD",
  "summary": "...",
  "raw_text": "...",
  "suggested_tags": ["tag1", "tag2"]
}
`.trim()
}

const GEMINI_PROMPT = PROMPTS_BY_TYPE.general

function getPromptForDocumentType(documentType) {
  return PROMPTS_BY_TYPE[normalizeDocumentType(documentType)] || PROMPTS_BY_TYPE.general
}

export async function analyzeDocument(imagePath, userGeminiKey = null, model = null, onProgress = null, userAnthropicKey = null, claudeModel = null, userOpenAiKey = null, openAiModel = null, priority = ['google', 'anthropic', 'openai']) {
  if (onProgress) onProgress(`Initialisiere OCR-Analyse...`)

  // Check if file exists before attempting analysis
  const absolutePath = resolve(imagePath)
  if (!existsSync(absolutePath)) {
    throw new Error(`Dokumentdatei nicht gefunden: ${imagePath}`)
  }

  try {
    const documentType = await classifyDocumentType(imagePath, userGeminiKey, userAnthropicKey, userOpenAiKey, priority)
    const prompt = getPromptForDocumentType(documentType)

    for (const provider of priority) {
      if (provider === 'google' && userGeminiKey) {
        const effectiveModel = model || 'gemini-1.5-flash'
        _log.info({ provider: 'gemini', model: effectiveModel, documentType }, 'OCR analysis starting')
        return await analyzeWithGemini(imagePath, userGeminiKey, effectiveModel, onProgress, prompt, documentType)
      }
      if (provider === 'anthropic' && userAnthropicKey) {
        const effectiveModel = claudeModel || 'claude-3-5-sonnet-20241022'
        _log.info({ provider: 'claude', model: effectiveModel, documentType }, 'OCR analysis starting')
        return await analyzeWithClaude(imagePath, userAnthropicKey, effectiveModel, onProgress, prompt, documentType)
      }
      if (provider === 'openai' && userOpenAiKey) {
        const effectiveModel = openAiModel || 'gpt-4o-mini'
        _log.info({ provider: 'openai', model: effectiveModel, documentType }, 'OCR analysis starting')
        return await analyzeWithOpenAI(imagePath, userOpenAiKey, effectiveModel, onProgress, prompt, documentType)
      }
    }

    // Fallback falls die Priorisierung keine Treffer ergab, aber Keys existieren
    if (userGeminiKey) return await analyzeWithGemini(imagePath, userGeminiKey, model || 'gemini-1.5-flash', onProgress, prompt, documentType)
    if (userAnthropicKey) return await analyzeWithClaude(imagePath, userAnthropicKey, claudeModel || 'claude-3-5-sonnet-20241022', onProgress, prompt, documentType)
    if (userOpenAiKey) return await analyzeWithOpenAI(imagePath, userOpenAiKey, openAiModel || 'gpt-4o-mini', onProgress, prompt, documentType)

    throw new Error('Analyse nicht möglich. Keine Tokens hinterlegt.')
  } catch (err) {
    _log.error({ err: { message: err.message, stack: err.stack } }, 'OCR fehlgeschlagen')
    throw err // Throw error to be handled by caller (will trigger pending_analysis status)
  }
}

async function analyzeWithClaude(imagePath, anthropicKey, model, onProgress, prompt = GEMINI_PROMPT, documentType = 'general') {
  if (onProgress) onProgress('Bild wird für Claude API verarbeitet...')
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'

  // Magic Bytes Check: Erkennt den wahren Dateityp, unabhängig von der Dateiendung
  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'

  if (onProgress) onProgress(`Sende POST Request an Claude ${model} API...`)
  const url = 'https://api.anthropic.com/v1/messages'

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: base64
            }
          },
          {
            type: 'text',
            text: prompt
          }
        ]
      }]
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    _log.error({ provider: 'claude', statusCode: response.status, err: errorText }, 'Claude API error')
    throw new Error(`Claude API Fehler (${response.status}): ${errorText}`)
  }

  if (onProgress) onProgress('Anmeldung bei Claude API erfolgreich! Verarbeite JSON-Antwort...')
  const result = await response.json()
  const text = result.content?.[0]?.text || ''

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Kein JSON in Claude-Antwort')

  return { provider: 'claude', data: { type: normalizeDocumentType(documentType), ...JSON.parse(jsonMatch[0]) } }
}

async function analyzeWithGemini(imagePath, geminiKey, model, onProgress, prompt = GEMINI_PROMPT, documentType = 'general') {
  if (onProgress) onProgress('Bild wird für Gemini API verarbeitet...')
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'

  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'

  if (onProgress) onProgress(`Sende POST Request an ${model} API...`)
  // Note: URL intentionally not logged to avoid exposing API key
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64
            }
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    _log.error({ provider: 'gemini', statusCode: response.status, err: errorText }, 'Gemini API error')

    if (response.status === 429) {
      throw new Error('Gemini API Quota überschritten - bitte später erneut versuchen')
    }

    throw new Error(`API Auth/Request fehlgeschlagen (${response.status}): ${errorText}`);
  }

  if (onProgress) onProgress('Anmeldung bei Google API erfolgreich! Verarbeite JSON-Antwort...')
  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Kein JSON in Gemini-Antwort')

  return { provider: 'gemini', data: { type: normalizeDocumentType(documentType), ...JSON.parse(jsonMatch[0]) } }
}

async function analyzeWithTesseract(imagePath, onProgress) {
  const worker = await createWorker('deu+eng', 1, {
    logger: m => {
      if (onProgress && m.status === 'recognizing text') {
        onProgress(`Tesseract liest Text... ${Math.round(m.progress * 100)}%`)
      } else if (onProgress) {
        onProgress(`Tesseract: ${m.status}`)
      }
    }
  })
  try {
    const { data: { text } } = await worker.recognize(imagePath)
    const parsed = parseTesseractText(text)
    return { provider: 'tesseract', data: parsed }
  } finally {
    await worker.terminate()
  }
}

// Normalize document type from various sources to canonical types
export function normalizeDocumentType(typeInput) {
  const normalized = (typeInput || '').toLowerCase().trim()
  
  // Handle legacy and variant type names
  const mapping = {
    'vaccination': 'vaccination',
    'vaccin': 'vaccination',
    'vaccine': 'vaccination',
    'impf': 'vaccination',
    'impfpass': 'vaccination',
    'pedigree': 'pedigree',
    'stammbaum': 'pedigree',
    'zucht': 'pedigree',
    'dog_certificate': 'dog_certificate',
    'hundeführerschein': 'dog_certificate',
    'sachkundenachweis': 'dog_certificate',
    'medical_product': 'medical_product',
    'medication': 'medical_product',
    'medikament': 'medical_product',
    'product': 'medical_product',
    'vet_report': 'general',
    'report': 'general',
    'microchip': 'general',
    'passport': 'general',
    'other': 'general',
    'allgemein': 'general',
    '': 'general'
  }
  
  return mapping[normalized] || 'general'
}

// Two-step OCR: first classify document type, then extract with type-specific prompt
export async function classifyDocumentType(imagePath, userGeminiKey = null, userAnthropicKey = null, userOpenAiKey = null, priority = ['google', 'anthropic', 'openai']) {
  try {
    // First pass: classify the document type
    for (const provider of priority) {
      if (provider === 'google' && userGeminiKey) {
        return await classifyWithGemini(imagePath, userGeminiKey)
      }
      if (provider === 'anthropic' && userAnthropicKey) {
        return await classifyWithClaude(imagePath, userAnthropicKey)
      }
      if (provider === 'openai' && userOpenAiKey) {
        return await classifyWithOpenAI(imagePath, userOpenAiKey)
      }
    }
    return 'general'
  } catch (err) {
    _log.warn({ err: err.message }, 'Document classification failed, defaulting to general')
    return 'general'
  }
}

async function classifyWithGemini(imagePath, geminiKey) {
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: CLASSIFICATION_PROMPT },
          { inlineData: { mimeType, data: base64 } }
        ]
      }]
    })
  })

  if (!response.ok) throw new Error(`Gemini classification failed: ${response.status}`)
  const result = await response.json()
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const classified = normalizeDocumentType(text)
  _log.debug({ classified }, 'Document classified')
  return classified
}

async function classifyWithClaude(imagePath, anthropicKey) {
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: CLASSIFICATION_PROMPT }
        ]
      }]
    })
  })

  if (!response.ok) throw new Error(`Claude classification failed: ${response.status}`)
  const result = await response.json()
  const text = result.content?.[0]?.text || ''
  const classified = normalizeDocumentType(text)
  _log.debug({ classified }, 'Document classified')
  return classified
}

async function classifyWithOpenAI(imagePath, openAiKey) {
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openAiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 20,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: CLASSIFICATION_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
        ]
      }]
    })
  })

  if (!response.ok) throw new Error(`OpenAI classification failed: ${response.status}`)
  const result = await response.json()
  const text = result.choices?.[0]?.message?.content || ''
  const classified = normalizeDocumentType(text)
  _log.debug({ classified }, 'Document classified')
  return classified
}

function parseTesseractText(text) {
  const lower = text.toLowerCase()
  const classified = normalizeDocumentType(
    (lower.includes('impf') || lower.includes('vaccin')) ? 'vaccination' :
    (lower.includes('stammbaum') || lower.includes('pedigree') || lower.includes('zucht')) ? 'pedigree' :
    (lower.includes('hundeführerschein') || lower.includes('sachkundenachweis')) ? 'dog_certificate' :
    (lower.includes('medikament') || lower.includes('tablette') || lower.includes('dosierung')) ? 'medical_product' :
    'general'
  )
  return { type: classified, rawText: text }
}

async function analyzeWithOpenAI(imagePath, openAiKey, model, onProgress, prompt = GEMINI_PROMPT, documentType = 'general') {
  if (onProgress) onProgress('Bild wird für OpenAI API verarbeitet...')
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'

  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'

  if (onProgress) onProgress(`Sende POST Request an OpenAI ${model} API...`)
  const url = 'https://api.openai.com/v1/chat/completions'
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openAiKey}`
    },
    body: JSON.stringify({
      model: model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: 'system',
          content: 'You are a veterinary document analyzer. Always return valid JSON.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`
              }
            }
          ]
        }
      ]
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    _log.error({ provider: 'openai', statusCode: response.status, err: errorText }, 'OpenAI API error')
    throw new Error(`OpenAI API Fehler (${response.status}): ${errorText}`)
  }

  if (onProgress) onProgress('Anmeldung bei OpenAI erfolgreich! Verarbeite JSON-Antwort...')
  const result = await response.json()
  const text = result.choices?.[0]?.message?.content || ''

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Kein JSON in OpenAI-Antwort')

  return { provider: 'openai', data: { type: normalizeDocumentType(documentType), ...JSON.parse(jsonMatch[0]) } }
}
