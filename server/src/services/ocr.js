import { createWorker } from 'tesseract.js'
import { readFileSync } from 'fs'

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

export async function analyzeDocument(imagePath, userGeminiKey = null, model = null, onProgress = null, userAnthropicKey = null, claudeModel = null, userOpenAiKey = null, openAiModel = null, priority = ['google', 'anthropic', 'openai']) {
  if (onProgress) onProgress(`Initialisiere OCR-Analyse...`)
  try {
    for (const provider of priority) {
      if (provider === 'google' && userGeminiKey) {
        const effectiveModel = model || 'gemini-1.5-flash'
        console.log(`[OCR] Versuche Gemini-Analyse mit Key: ${userGeminiKey.substring(0, 10)}... (model: ${effectiveModel})`)
        return await analyzeWithGemini(imagePath, userGeminiKey, effectiveModel, onProgress)
      }
      if (provider === 'anthropic' && userAnthropicKey) {
        const effectiveModel = claudeModel || 'claude-3-5-sonnet-20241022'
        console.log(`[OCR] Versuche Claude-Analyse mit Key: ${userAnthropicKey.substring(0, 10)}... (model: ${effectiveModel})`)
        return await analyzeWithClaude(imagePath, userAnthropicKey, effectiveModel, onProgress)
      }
      if (provider === 'openai' && userOpenAiKey) {
        const effectiveModel = openAiModel || 'gpt-4o-mini'
        console.log(`[OCR] Versuche OpenAI-Analyse mit Key: ${userOpenAiKey.substring(0, 10)}... (model: ${effectiveModel})`)
        return await analyzeWithOpenAI(imagePath, userOpenAiKey, effectiveModel, onProgress)
      }
    }

    // Fallback falls die Priorisierung keine Treffer ergab, aber Keys existieren
    if (userGeminiKey) return await analyzeWithGemini(imagePath, userGeminiKey, model || 'gemini-1.5-flash', onProgress)
    if (userAnthropicKey) return await analyzeWithClaude(imagePath, userAnthropicKey, claudeModel || 'claude-3-5-sonnet-20241022', onProgress)
    if (userOpenAiKey) return await analyzeWithOpenAI(imagePath, userOpenAiKey, openAiModel || 'gpt-4o-mini', onProgress)

    throw new Error('Analyse nicht möglich. Keine Tokens hinterlegt.')
  } catch (err) {
    console.error('OCR fehlgeschlagen:', err.message, err.stack)
    throw err // Throw error to be handled by caller (will trigger pending_analysis status)
  }
}

async function analyzeWithClaude(imagePath, anthropicKey, model, onProgress) {
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
  console.log(`[OCR] Claude API URL: ${url}`)

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
            text: GEMINI_PROMPT
          }
        ]
      }]
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[OCR] Claude API Error (${response.status}):`, errorText)
    throw new Error(`Claude API Fehler (${response.status}): ${errorText}`)
  }

  if (onProgress) onProgress('Anmeldung bei Claude API erfolgreich! Verarbeite JSON-Antwort...')
  const result = await response.json()
  const text = result.content?.[0]?.text || ''

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Kein JSON in Claude-Antwort')

  return { provider: 'claude', data: JSON.parse(jsonMatch[0]) }
}

async function analyzeWithGemini(imagePath, geminiKey, model, onProgress) {
  if (onProgress) onProgress('Bild wird für Gemini API verarbeitet...')
  const imageData = readFileSync(imagePath)
  const base64 = imageData.toString('base64')
  let mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'

  if (base64.startsWith('/9j/')) mimeType = 'image/jpeg'
  else if (base64.startsWith('iVBORw')) mimeType = 'image/png'
  else if (base64.startsWith('UklGRg')) mimeType = 'image/webp'

  if (onProgress) onProgress(`Sende POST Request an ${model} API...`)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`
  console.log(`[OCR] Gemini URL: ${url.substring(0, 80)}...`)
  const response = await fetch(url, {
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
    console.error(`[OCR] Gemini API Error (${response.status}):`, errorText);

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

async function analyzeWithOpenAI(imagePath, openAiKey, model, onProgress) {
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
            { type: 'text', text: GEMINI_PROMPT },
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
    console.error(`[OCR] OpenAI API Error (${response.status}):`, errorText)
    throw new Error(`OpenAI API Fehler (${response.status}): ${errorText}`)
  }

  if (onProgress) onProgress('Anmeldung bei OpenAI erfolgreich! Verarbeite JSON-Antwort...')
  const result = await response.json()
  const text = result.choices?.[0]?.message?.content || ''

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Kein JSON in OpenAI-Antwort')

  return { provider: 'openai', data: JSON.parse(jsonMatch[0]) }
}
