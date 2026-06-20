import { randomUUID } from 'node:crypto'
import { decrypt } from '../utils/crypto.js'
import { getSystemAiKeys, getSettingsMap } from './appSettings.js'
import { resolveModel } from '../utils/aiModels.js'

function buildPrompt(transcriptionText, languageMode) {
  const langInstruction = {
    de: 'Antworte ausschließlich auf Deutsch.',
    en: 'Reply exclusively in English.',
    both: 'Provide title_de, summary_de, content_de in German AND title_en, summary_en, content_en in English. For the details object use the language of the transcription.'
  }[languageMode] || 'Antworte ausschließlich auf Deutsch.'

  const detailsBlock = `"details": {
    "diagnose": "Diagnose oder Verdachtsdiagnose (null falls nicht genannt)",
    "befunde": "Klinische Befunde und Untersuchungsergebnisse (null falls nicht genannt)",
    "vorgehen": ["Durchgeführte Maßnahmen und Behandlungsschritte"],
    "medikamente": ["Medikament + Dosierung + Dauer, falls genannt"],
    "termine": ["z.B. Wiedervorstellung in 2 Tagen, nächster Kontrolltermin"]
  }`

  const schema = languageMode === 'both'
    ? `{
  "title_de": "Kurzer Titel auf Deutsch (max 50 Zeichen)",
  "title_en": "Short title in English (max 50 chars)",
  "summary_de": "Kurzzusammenfassung auf Deutsch (1-2 Sätze)",
  "summary_en": "Short summary in English (1-2 sentences)",
  "content_de": "Vollständiger Fließtext auf Deutsch",
  "content_en": "Full text in English",
  ${detailsBlock},
  "tags": ["tag1"],
  "action_items": ["Nächster konkreter Schritt"],
  "date_mentioned": null
}`
    : `{
  "title": "Kurzer Titel (max 50 Zeichen)",
  "summary": "Kurzzusammenfassung in 1-2 Sätzen",
  "content": "Vollständiger Fließtext des Memos",
  ${detailsBlock},
  "tags": ["tag1"],
  "action_items": ["Nächster konkreter Schritt"],
  "date_mentioned": null
}`

  return `Du bist ein Veterinär-Assistent. Analysiere diese Sprachnotiz eines Tierarztes und erstelle ein strukturiertes Memo als valides JSON.
${langInstruction}
Gib NUR das JSON zurück, keinen anderen Text.

Schema:
${schema}

Transkription:
${transcriptionText}`
}

async function callProvider(provider, key, model, prompt) {
  if (provider === 'google') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: { responseMimeType: 'application/json' },
        contents: [{ parts: [{ text: prompt }] }]
      })
    })
    const body = await res.text()
    let data
    try { data = JSON.parse(body) } catch { data = { raw: body } }
    if (!res.ok) {
      const err = Object.assign(new Error(`Gemini memo error (${res.status}): ${body.slice(0, 300)}`), { aiDebug: { provider, status: res.status, model, response: data } })
      throw err
    }
    return { provider: 'google', text: data.candidates?.[0]?.content?.parts?.[0]?.text || '{}' }
  }

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] })
    })
    const body = await res.text()
    let data
    try { data = JSON.parse(body) } catch { data = { raw: body } }
    if (!res.ok) {
      const err = Object.assign(new Error(`Claude memo error (${res.status}): ${body.slice(0, 300)}`), { aiDebug: { provider, status: res.status, model, response: data } })
      throw err
    }
    return { provider: 'anthropic', text: data.content?.[0]?.text || '{}' }
  }

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a veterinary assistant. Always return valid JSON.' },
          { role: 'user', content: prompt }
        ]
      })
    })
    const body = await res.text()
    let data
    try { data = JSON.parse(body) } catch { data = { raw: body } }
    if (!res.ok) {
      const err = Object.assign(new Error(`OpenAI memo error (${res.status}): ${body.slice(0, 300)}`), { aiDebug: { provider, status: res.status, model, response: data } })
      throw err
    }
    return { provider: 'openai', text: data.choices?.[0]?.message?.content || '{}' }
  }

  if (provider === 'mistral') {
    // Mistral exposes an OpenAI-compatible chat completions API
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a veterinary assistant. Always return valid JSON.' },
          { role: 'user', content: prompt }
        ]
      })
    })
    const body = await res.text()
    let data
    try { data = JSON.parse(body) } catch { data = { raw: body } }
    if (!res.ok) {
      const err = Object.assign(new Error(`Mistral memo error (${res.status}): ${body.slice(0, 300)}`), { aiDebug: { provider, status: res.status, model, response: data } })
      throw err
    }
    return { provider: 'mistral', text: data.choices?.[0]?.message?.content || '{}' }
  }

  throw new Error(`Unknown provider: ${provider}`)
}

export async function analyzeMemoWithAI(db, accountId, transcriptionText, languageMode = 'de') {
  const { rows: [acc] } = await db.query(
    'SELECT gemini_token, gemini_model, anthropic_token, claude_model, openai_token, openai_model, mistral_token, mistral_model, ai_provider_priority, system_fallback_enabled, billing_budget_eur FROM accounts WHERE id = $1',
    [accountId]
  )

  let userGeminiKey = null
  let userAnthropicKey = null
  let userOpenAiKey = null
  let userMistralKey = null
  try { userGeminiKey = acc?.gemini_token ? decrypt(acc.gemini_token) : null } catch {}
  try { userAnthropicKey = acc?.anthropic_token ? decrypt(acc.anthropic_token) : null } catch {}
  try { userOpenAiKey = acc?.openai_token ? decrypt(acc.openai_token) : null } catch {}
  try { userMistralKey = acc?.mistral_token ? decrypt(acc.mistral_token) : null } catch {}

  const sysFallbackAllowed = (acc?.system_fallback_enabled ?? 1) === 1
  let priority = ['google', 'anthropic', 'openai', 'mistral']
  try { if (acc?.ai_provider_priority) priority = JSON.parse(acc.ai_provider_priority).filter(p => p !== 'system') } catch {}

  if (sysFallbackAllowed) {
    const sysKeys = await getSystemAiKeys(db)
    if (!userGeminiKey) userGeminiKey = sysKeys.geminiKey
    if (!userAnthropicKey) userAnthropicKey = sysKeys.anthropicKey
    if (!userOpenAiKey) userOpenAiKey = sysKeys.openaiKey
    if (!userMistralKey) userMistralKey = sysKeys.mistralKey
  }

  const providerKeys = {
    google: userGeminiKey,
    anthropic: userAnthropicKey,
    openai: userOpenAiKey,
    mistral: userMistralKey
  }
  const providerModels = {
    google: resolveModel('google', acc?.gemini_model),
    anthropic: resolveModel('anthropic', acc?.claude_model),
    openai: resolveModel('openai', acc?.openai_model),
    mistral: resolveModel('mistral', acc?.mistral_model)
  }

  console.log('[memoAnalysis] priority=%s sysFallback=%s keys=%s', priority.join(','), sysFallbackAllowed,
    Object.entries(providerKeys).filter(([, v]) => v).map(([k]) => k).join(',') || 'none')

  const prompt = buildPrompt(transcriptionText, languageMode)
  let lastError = null

  for (const p of priority) {
    const key = providerKeys[p]
    if (!key) { console.log('[memoAnalysis] skip %s — no key', p); continue }
    console.log('[memoAnalysis] trying %s model=%s', p, providerModels[p])
    try {
      const { provider, text } = await callProvider(p, key, providerModels[p], prompt)
      let parsed = {}
      try { parsed = JSON.parse(text) } catch { parsed = { content: text } }
      const aiDebug = { provider, model: providerModels[p], rawResponse: text.slice(0, 3000) }
      console.log('[memoAnalysis] success provider=%s fields=%s', provider, Object.keys(parsed).join(','))
      return { extractedJson: parsed, aiProvider: provider, aiDebug }
    } catch (err) {
      console.error('[memoAnalysis] %s failed: %s', p, err.message)
      lastError = err
    }
  }

  throw Object.assign(new Error(`Memo-Analyse fehlgeschlagen: ${lastError?.message || 'Kein KI-Provider verfügbar'}`), { code: 502, aiDebug: lastError?.aiDebug })
}

export async function logVoiceMemoUsage(db, { accountId, voiceMemoId, aiProvider, hasOwnKey, languageMode }) {
  const settings = await getSettingsMap(db)
  const priceCentKey = languageMode === 'both' ? 'billing_voice_memo_both_cents'
    : languageMode === 'en' ? 'billing_voice_memo_en_cents'
    : 'billing_voice_memo_de_cents'
  const costCents = Number(settings[priceCentKey] ?? 5)

  try {
    await db.query(
      `INSERT INTO usage_logs (id, account_id, voice_memo_id, pages_analyzed, ocr_provider, model_used, is_system_fallback, analyzed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [randomUUID(), accountId, voiceMemoId, 1, aiProvider, aiProvider, hasOwnKey ? 0 : 1]
    )
  } catch { /* non-fatal */ }

  return costCents
}
