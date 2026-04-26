import { createWorker } from 'tesseract.js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { readFileSync } from 'fs'

const GEMINI_KEY = process.env.GEMINI_API_KEY

const GEMINI_PROMPT = `
Du bist ein Veterinär-Dokumentenanalyst. Analysiere das folgende Tierdokument (Impfpass, Medikament, etc.)
und gib die Daten strukturiert als JSON zurück.

Für Impfdokumente verwende:
{
  "type": "vaccination",
  "animal": { "name": "...", "species": "...", "breed": "...", "birthdate": "..." },
  "vaccinations": [{ "vaccine": "...", "date": "...", "nextDue": "...", "vet": "..." }],
  "suggested_tags": ["tag1", "tag2"]
}

Für Medikamentendokumente verwende:
{
  "type": "medication",
  "medications": [{ "name": "...", "dosage": "...", "frequency": "...", "startDate": "...", "endDate": "..." }],
  "suggested_tags": ["tag1", "tag2"]
}

Für unbekannte Dokumente:
{
  "type": "other",
  "rawText": "...",
  "suggested_tags": ["tag1", "tag2"]
}

Antworte NUR mit dem JSON-Objekt, kein erklärender Text.
`.trim()

export async function analyzeDocument(imagePath, userGeminiKey = null, onProgress = null) {
  const geminiKey = userGeminiKey || GEMINI_KEY
  if (geminiKey) {
    if (onProgress) onProgress('Gemini Vision analysiert...')
    try {
      return await analyzeWithGemini(imagePath, geminiKey)
    } catch (err) {
      console.warn('Gemini OCR fehlgeschlagen:', err.message)
      if (userGeminiKey) {
        throw new Error(`Gemini Analyse fehlgeschlagen. Bitte prüfe deinen API-Schlüssel. (${err.message})`)
      }
      if (onProgress) onProgress('Gemini fehlgeschlagen, lade Tesseract (Fallback)...')
    }
  } else {
    if (onProgress) onProgress('Starte lokales Tesseract OCR...')
  }
  return analyzeWithTesseract(imagePath, onProgress)
}

async function analyzeWithGemini(imagePath, geminiKey) {
  const genAI = new GoogleGenerativeAI(geminiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' })

  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'

  const result = await model.generateContent([
    GEMINI_PROMPT,
    { inlineData: { data: base64, mimeType } }
  ])

  const text = result.response.text().trim()
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
