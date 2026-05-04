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

1. "vaccination" — Impfpass, Impfbescheinigung, Impfprotokoll, Impftabellen
   - Zeigt: Tierart, Name, Geburtsdatum, Impfstoff(e), Impfdatum(e), Chargennummer, Gültig bis Datum, Unterschrift Tierarzt
   - Erkennungsmerkmale: Tabellenformat mit Spalten wie "Impfstoff", "Datum", "Chargennummer", "Gültig bis", "Stempel/Unterschrift"
   - Auch: "Impfpass", "Sonstige Impfungen", "Nachimpfungen", "Tollwut", "Staupe", "Parvo", "Leptospirose" in Tabellen
   - NICHT: allgemeine Gesundheitsberichte, Medikamentenrechnungen, Behandlungsberichte ohne strukturierte Impfeinträge

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
Du bist ein Veterinär-Dokumentenanalyst. Analysiere diesen Impfpass gründlich und extrahiere JEDEN Impfeintrag einzeln.

KRITISCHE REGELN:
1. EINE TABELLENZEILE = EIN OBJEKT in vaccinations[]
2. Wenn 5 Impfungen auf der Seite stehen, dann 5 separate Objekte (nicht 1 pro Seite!)
3. ALLE Datumsangaben MÜSSEN YYYY-MM-DD Format sein (z.B. "06.09.2021" → "2021-09-06", "09. NOV. 2021" → "2021-11-09")
4. Extrahiere für JEDEN Eintrag:
   - vaccine_name (Impfstoff-Name, z.B. "Tollwut", "DHLPPi", "Staupe+Parvo")
   - administration_date (Impfdatum, YYYY-MM-DD)
   - valid_until (Gültig bis / Gültigkeitsdauer, YYYY-MM-DD) — oder null wenn nicht lesbar
   - batch_number (Chargennummer / LOT)
   - manufacturer (Hersteller, z.B. "MSD", "Boehringer", "Virbac")
   - active_substances (Array: ["Staupevirus", "Parvovirus", ...]) — oder Wirkstoffgruppe falls einzeln nicht lesbar
   - vet_name (Name des Tierarztes vom Stempel/Unterschrift)
   - target_disease (Zielkrankheit, z.B. "Staupe, Parvo, Leptospirose")
5. Tierinfos: name, species (dog/cat/other), breed, birthdate (YYYY-MM-DD)
6. document_date = frühestes oder Hauptimpfdatum
7. Tags basierend auf Impfstoffen: ["Tollwut", "DHLPPi", "Staupe", "Parvo", "Leptospirose", "Zwingerhusten"]

DATEN-NORMALISIERUNG:
- Alle Daten müssen YYYY-MM-DD sein
- Beispiel: "06. 09. 2021" → "2021-09-06", "Sept. 25, 2023" → "2023-09-25"
- Unlesbare/fehlende Daten → null (NICHT "n.a." oder "")

BEISPIEL STRUKTUR:
{
  "type": "vaccination",
  "title": "Impfpass - Max (DHLPPi + Tollwut)",
  "document_date": "2021-09-06",
  "summary": "Kompletter Impfpass mit 5 Einträgen",
  "animal": { 
    "name": "Max", 
    "species": "dog", 
    "breed": "Labrador Retriever", 
    "birthdate": "2019-03-15" 
  },
  "vaccinations": [
    {
      "vaccine_name": "DHLPPi (Hexadog)",
      "administration_date": "2021-09-06",
      "valid_until": "2024-09-06",
      "batch_number": "ABC12345",
      "manufacturer": "Boehringer Ingelheim",
      "active_substances": ["Canine Distemper", "Canine Adenovirus", "Canine Parvovirus"],
      "vet_name": "Dr. Schmidt",
      "target_disease": "Staupe, Hepatitis, Leptospirose, Parvovirose, Parainfluenza"
    },
    {
      "vaccine_name": "Tollwut",
      "administration_date": "2021-09-06",
      "valid_until": "2024-09-06",
      "batch_number": "XYZ99999",
      "manufacturer": "MSD",
      "active_substances": ["Tollwutvirus"],
      "vet_name": "Dr. Schmidt",
      "target_disease": "Tollwut"
    }
  ],
  "suggested_tags": ["DHLPPi", "Tollwut", "Boehringer", "2021-09-06"]
}

Gib NUR gültiges JSON aus (keine Erklärungen, keine Markdown-Code-Blöcke).
`.trim(),

  treatment: `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere dieses Behandlungsdokument und extrahiere JEDE Behandlung einzeln.

KRITISCHE REGELN:
1. EINE BEHANDLUNG = EIN OBJEKT in treatments[]
2. Wenn 3 Behandlungen dokumentiert sind, dann 3 separate Objekte
3. ALLE Datumsangaben MÜSSEN YYYY-MM-DD Format sein
4. Extrahiere für JEDEN Eintrag:
   - substance (Wirkstoff/Medikament, z.B. "Entwurmung", "Milbemax", "Droncit", "Antiparasitär")
   - administered_at (Behandlungsdatum, YYYY-MM-DD)
   - dosage (Dosierung, z.B. "1 Tablette", "0.5 ml/kg", "eine Spritze")
   - vet_name (Name des Tierarztes)
   - next_due (Nächste Behandlung fällig, YYYY-MM-DD, oder null)
   - notes (optionale Notizen, z.B. "Prophylaxe", "Allergie dokumentiert")
5. Tierinfos: name, species, breed, birthdate (YYYY-MM-DD)
6. document_date = frühestes oder Hauptbehandlungsdatum
7. Tags basierend auf Substanzen: ["Entwurmung", "Antiparasitär", "Milbemax", etc.]

DATEN-NORMALISIERUNG:
- Alle Daten müssen YYYY-MM-DD sein
- Unlesbare/fehlende Daten → null

BEISPIEL STRUKTUR:
{
  "type": "treatment",
  "title": "Behandlungsprotokoll - Entwurmung & Antiparasitär",
  "document_date": "2024-03-15",
  "summary": "2 Behandlungseinträge dokumentiert",
  "animal": { 
    "name": "Max", 
    "species": "dog", 
    "breed": "Labrador", 
    "birthdate": "2019-03-15" 
  },
  "treatments": [
    {
      "substance": "Milbemax (Entwurmung)",
      "administered_at": "2024-03-15",
      "dosage": "1 Tablette",
      "vet_name": "Dr. Schmidt",
      "next_due": "2024-06-15",
      "notes": "Prophylaxe gegen Rund- und Bandwürmer"
    },
    {
      "substance": "Prazitel (Antiparasitär)",
      "administered_at": "2024-03-15",
      "dosage": "per Schleimhaut",
      "vet_name": "Dr. Schmidt",
      "next_due": null,
      "notes": "Zusätzliche Maßnahme gegen Parasiten"
    }
  ],
  "suggested_tags": ["Entwurmung", "Milbemax", "Prophylaxe"]
}

Gib NUR gültiges JSON aus (keine Erklärungen).
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

// Helper: Parse and normalize date to YYYY-MM-DD
function normalizeDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null
  
  const trimmed = dateStr.trim()
  if (!trimmed) return null
  
  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  
  // Try parsing German/Austrian formats: dd.mm.yyyy, dd. MMM. yyyy, etc.
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
  
  // dd.mm.yyyy
  const match1 = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (match1) {
    const [, day, month, year] = match1
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  
  // dd. MMM. yyyy (e.g., "06. SEP. 2021", "09. NOV. 2021")
  const match2 = trimmed.match(/^(\d{1,2})\.\s*([a-zA-Z]+)\.\s*(\d{4})$/)
  if (match2) {
    const [, day, monthStr, year] = match2
    const monthNum = germanMonths[monthStr.toLowerCase()]
    if (monthNum) {
      return `${year}-${monthNum}-${String(day).padStart(2, '0')}`
    }
  }
  
  // mm/yyyy or mm-yyyy (Month/Year)
  const match3 = trimmed.match(/^(\d{1,2})[\/\-](\d{4})$/)
  if (match3) {
    const [, month, year] = match3
    return `${year}-${String(month).padStart(2, '0')}-01`
  }
  
  // mm/dd/yyyy (US format, less common but possible)
  const match4 = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match4) {
    const [, month, day, year] = match4
    // Heuristic: if month > 12, assume European dd/mm/yyyy
    const m = parseInt(month)
    const d = parseInt(day)
    if (m > 12 && d <= 12) {
      return `${year}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`
    }
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  
  return null
}

// Post-process extracted JSON to normalize all date fields
function normalizeDateFields(obj) {
  if (!obj || typeof obj !== 'object') return obj
  
  if (Array.isArray(obj)) {
    return obj.map(item => normalizeDateFields(item))
  }
  
  const dateFieldNames = [
    'date', 'administration_date', 'administered_at', 'valid_until', 'gueltig_bis',
    'document_date', 'birthdate', 'nextDue', 'next_due', 'expires_at', 'expiry_date',
    'next_due_at'
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

  const parsed = { type: normalizeDocumentType(documentType), ...JSON.parse(jsonMatch[0]) }
  return { provider: 'claude', data: normalizeDateFields(parsed) }
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

  const parsed = { type: normalizeDocumentType(documentType), ...JSON.parse(jsonMatch[0]) }
  return { provider: 'gemini', data: normalizeDateFields(parsed) }
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
    'treatment': 'treatment',
    'behandlung': 'treatment',
    'entwurmung': 'treatment',
    'wurmkur': 'treatment',
    'antiparasitär': 'treatment',
    'antiparasitaer': 'treatment',
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
    (lower.includes('entwurmung') || lower.includes('wurmkur') || lower.includes('antiparasitär') || lower.includes('antiparasitaer') || lower.includes('behandlung') && lower.includes('tierarzt')) ? 'treatment' :
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

  const parsed = { type: normalizeDocumentType(documentType), ...JSON.parse(jsonMatch[0]) }
  return { provider: 'openai', data: normalizeDateFields(parsed) }
}
