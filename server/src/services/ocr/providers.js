import { DEFAULT_MODEL_BY_PROVIDER } from '../../utils/aiModels.js'
import { PROMPTS } from './prompts.js'
import { loadImageAsBase64, parseStructuredModelResponse, extractClassificationConfidence } from './imageUtils.js'
import { getOcrLogger } from './logger.js'
import { normalizeDocumentType } from './prompts.js'

export async function analyzeImageWithProvider(provider, key, model, imagePath, prompt, documentType, typeConfidence, onProgress) {
  const log = getOcrLogger()
  const { base64, mimeType } = loadImageAsBase64(imagePath)

  if (provider === 'google') {
    if (onProgress) onProgress('Processing image for Gemini API...')
    if (onProgress) onProgress(`Sending POST request to ${model} API...`)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: { responseMimeType: 'application/json' },
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }]
      })
    })
    if (!response.ok) {
      const errorText = await response.text()
      log.error({ provider: 'gemini', statusCode: response.status, err: errorText }, 'Gemini API error')
      const code = response.status === 429 ? 503 : response.status
      const message = response.status === 429
        ? 'Gemini API quota exceeded - please try again later'
        : `API request failed (${response.status}): ${errorText}`
      throw Object.assign(new Error(message), { code })
    }
    if (onProgress) onProgress('Gemini API response received, processing JSON...')
    const result = await response.json()
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return { provider: 'gemini', data: parseStructuredModelResponse(text, 'Gemini', documentType, typeConfidence) }
  }

  if (provider === 'anthropic') {
    if (onProgress) onProgress('Processing image for Claude API...')
    if (onProgress) onProgress(`Sending POST request to Claude ${model} API...`)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    })
    if (!response.ok) {
      const errorText = await response.text()
      log.error({ provider: 'claude', statusCode: response.status, err: errorText }, 'Claude API error')
      throw Object.assign(new Error(`Claude API error (${response.status}): ${errorText}`), { code: response.status })
    }
    if (onProgress) onProgress('Claude API response received, processing JSON...')
    const result = await response.json()
    const text = result.content?.[0]?.text || ''
    return { provider: 'claude', data: parseStructuredModelResponse(text, 'Claude', documentType, typeConfidence) }
  }

  if (provider === 'openai') {
    if (onProgress) onProgress('Processing image for OpenAI API...')
    if (onProgress) onProgress(`Sending POST request to OpenAI ${model} API...`)
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a veterinary document analyzer. Always return valid JSON.' },
          { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }] }
        ]
      })
    })
    if (!response.ok) {
      const errorText = await response.text()
      log.error({ provider: 'openai', statusCode: response.status, err: errorText }, 'OpenAI API error')
      throw Object.assign(new Error(`OpenAI API error (${response.status}): ${errorText}`), { code: response.status })
    }
    if (onProgress) onProgress('OpenAI response received, processing JSON...')
    const result = await response.json()
    const text = result.choices?.[0]?.message?.content || ''
    return { provider: 'openai', data: parseStructuredModelResponse(text, 'OpenAI', documentType, typeConfidence) }
  }

  throw new Error(`Unknown provider: ${provider}`)
}

export async function classifyImageWithProvider(provider, key, imagePath, language = 'de') {
  const log = getOcrLogger()
  const lang = language === 'en' ? 'en' : 'de'
  const classificationPrompt = PROMPTS[lang].classification
  const { base64, mimeType } = loadImageAsBase64(imagePath)

  let text = ''

  if (provider === 'google') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL_BY_PROVIDER.google}:generateContent?key=${key}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: classificationPrompt }, { inlineData: { mimeType, data: base64 } }] }] })
    })
    if (!response.ok) throw new Error(`Gemini classification failed: ${response.status}`)
    const result = await response.json()
    text = result.candidates?.[0]?.content?.parts?.[0]?.text || ''
  } else if (provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: DEFAULT_MODEL_BY_PROVIDER.anthropic,
        max_tokens: 50,
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } }, { type: 'text', text: classificationPrompt }] }]
      })
    })
    if (!response.ok) throw new Error(`Claude classification failed: ${response.status}`)
    const result = await response.json()
    text = result.content?.[0]?.text || ''
  } else if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 20,
        messages: [{ role: 'user', content: [{ type: 'text', text: classificationPrompt }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }] }]
      })
    })
    if (!response.ok) throw new Error(`OpenAI classification failed: ${response.status}`)
    const result = await response.json()
    text = result.choices?.[0]?.message?.content || ''
  }

  const classified = normalizeDocumentType(text)
  const confidence = extractClassificationConfidence(text) || (provider === 'google' ? 0.85 : provider === 'anthropic' ? 0.82 : 0.80)
  log.debug({ classified, confidence, language: lang }, 'Document classified')
  return { type: classified, confidence }
}
