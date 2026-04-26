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
  "vaccinations": [{ "vaccine": "...", "date": "...", "nextDue": "...", "vet": "..." }]
}

Für Medikamentendokumente verwende:
{
  "type": "medication",
  "medications": [{ "name": "...", "dosage": "...", "frequency": "...", "startDate": "...", "endDate": "..." }]
}

Für unbekannte Dokumente:
{
  "type": "other",
  "rawText": "..."
}

Antworte NUR mit dem JSON-Objekt, kein erklärender Text.
`.trim()

export async function analyzeDocument(imagePath, userGeminiKey = null) {
  const geminiKey = userGeminiKey || GEMINI_KEY
  if (geminiKey) {
    try {
      return await analyzeWithGemini(imagePath, geminiKey)
    } catch (err) {
      console.warn('Gemini OCR fehlgeschlagen, Fallback auf Tesseract:', err.message)
    }
  }
  return analyzeWithTesseract(imagePath)
}

async function analyzeWithGemini(imagePath, geminiKey) {
  const genAI = new GoogleGenerativeAI(geminiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

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

async function analyzeWithTesseract(imagePath) {
  const worker = await createWorker('deu+eng')
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
