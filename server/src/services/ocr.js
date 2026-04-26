import { createWorker } from 'tesseract.js'
import { readFileSync } from 'fs'

const GEMINI_KEY = process.env.GEMINI_API_KEY

const GEMINI_PROMPT = `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere das folgende Tierdokument (Impfpass, Medikament, etc.)
und gib die Daten strukturiert als JSON zurück.

WICHTIGE REGELN:
1. Prüfe doppelt, ob der gewählte Dokumenten-Typ ("type") wirklich exakt zum Bild passt (z.B. wirklich eine Impfung/Vaccine und nicht nur eine normale Rechnung).
2. Lies alle vorhandenen Daten (Datum) extrem sorgfältig heraus (z.B. Ausstellungsdatum, Impfdatum, Ablaufdatum).
3. Generiere unter "suggested_tags" passende, aussagekräftige Tags zum Dokument (z.B. "Tollwut", "Rezept", "Laborbericht").
4. Generiere unter "document_date" das erkannte Hauptdatum des Dokuments im Format YYYY-MM-DD, falls eines auffindbar ist.
5. Generiere unter "summary" eine kurze, gut lesbare Zusammenfassung bzw. Beschreibung des Dokuments.
6. Bei Medikamenten (medication): Recherchiere und inkludiere zusätzliche Hintergrundinfos (z.B. Wirkstoff, Anwendung) sowie nach Möglichkeit einen Link zum Hersteller.

Für Impfdokumente verwende:
{
  "type": "vaccination",
  "document_date": "...",
  "summary": "...",
  "animal": { "name": "...", "species": "...", "breed": "...", "birthdate": "..." },
  "vaccinations": [{ "vaccine": "...", "date": "...", "nextDue": "...", "vet": "..." }],
  "suggested_tags": ["tag1", "tag2"]
}

Für Medikamentendokumente verwende:
{
  "type": "medication",
  "document_date": "...",
  "summary": "...",
  "medications": [{ "name": "...", "dosage": "...", "frequency": "...", "startDate": "...", "endDate": "...", "details": "...", "manufacturer_link": "..." }],
  "suggested_tags": ["tag1", "tag2"]
}

Für unbekannte Dokumente:
{
  "type": "other",
  "document_date": "...",
  "summary": "...",
  "rawText": "...",
  "suggested_tags": ["tag1", "tag2"]
}

Antworte NUR mit dem JSON-Objekt, kein erklärender Text.
`.trim()

export async function analyzeDocument(imagePath, userGeminiKey = null, onProgress = null) {
  const geminiKey = userGeminiKey || GEMINI_KEY
  if (geminiKey) {
    if (onProgress) onProgress('Technologie: Gemini 3.1 Flash-Lite wird initialisiert...')
    try {
      return await analyzeWithGemini(imagePath, geminiKey, onProgress)
    } catch (err) {
      console.warn('Gemini OCR fehlgeschlagen:', err.message)
      if (userGeminiKey) {
        throw new Error(`Gemini Analyse fehlgeschlagen. Bitte prüfe deinen API-Schlüssel. (${err.message})`)
      }
      if (onProgress) onProgress(`Google API Fehler: ${err.message}. Lade lokales Tesseract OCR (Fallback)...`)
    }
  } else {
    if (onProgress) onProgress('Kein Gemini-Key vorhanden. Technologie: Lokales Tesseract OCR wird gestartet...')
  }
  return analyzeWithTesseract(imagePath, onProgress)
}

async function analyzeWithGemini(imagePath, geminiKey, onProgress) {
  if (onProgress) onProgress('Bild wird für Gemini API verarbeitet...')
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'

  if (onProgress) onProgress(`Sende POST Request an Gemini 3.1 Flash-Lite API...`)
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${geminiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: GEMINI_PROMPT },
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
    throw new Error(`API Auth/Request fehlgeschlagen (${response.status}): ${errorText}`);
  }

  if (onProgress) onProgress('Anmeldung bei Google API erfolgreich! Verarbeite JSON-Antwort...')
  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Kein JSON in Gemini-Antwort')

  return { provider: 'gemini', data: JSON.parse(jsonMatch[0]) }
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

function parseTesseractText(text) {
  const lower = text.toLowerCase()

  if (lower.includes('impf') || lower.includes('vaccin') || lower.includes('rabies')) {
    return { type: 'vaccination', rawText: text, vaccinations: [] }
  }
  if (lower.includes('medikament') || lower.includes('tablette') || lower.includes('dosierung')) {
    return { type: 'medication', rawText: text, medications: [] }
  }
  return { type: 'other', rawText: text }
}
