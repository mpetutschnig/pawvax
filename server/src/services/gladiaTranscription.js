import { readFileSync } from 'fs'
import { decrypt } from '../utils/crypto.js'
import { getSettingsMap } from './appSettings.js'

const GLADIA_UPLOAD_API = 'https://api.gladia.io/v2/upload/'
const GLADIA_TRANSCRIBE_API = 'https://api.gladia.io/v2/pre-recorded/'
const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 40

export async function resolveGladiaToken(db, accountId) {
  const { rows: [acc] } = await db.query('SELECT gladia_token FROM accounts WHERE id = $1', [accountId])
  let token = null
  try { if (acc?.gladia_token) token = decrypt(acc.gladia_token) } catch {}

  if (!token) {
    const settings = await getSettingsMap(db)
    try { if (settings.system_gladia_token) token = decrypt(settings.system_gladia_token) } catch {}
    if (!token && settings.system_gladia_token) token = settings.system_gladia_token
  }

  if (!token) throw Object.assign(new Error('Kein Gladia-Token konfiguriert. Bitte im Profil oder in den Admin-Einstellungen eintragen.'), { code: 422 })
  return token
}

export async function submitToGladia(audioPath, gladiaToken) {
  // Step 1: upload file to Gladia hosting → get Gladia-hosted audio_url
  const audioBuffer = readFileSync(audioPath)
  const audioFile = new File([audioBuffer], 'memo.webm', { type: 'audio/webm' })
  const form = new FormData()
  form.append('audio', audioFile)

  const uploadRes = await fetch(GLADIA_UPLOAD_API, {
    method: 'POST',
    headers: { 'x-gladia-key': gladiaToken, accept: 'application/json' },
    body: form
  })

  if (!uploadRes.ok) {
    const err = await uploadRes.text().catch(() => String(uploadRes.status))
    throw Object.assign(new Error(`Gladia upload failed (${uploadRes.status}): ${err}`), { code: 502 })
  }

  const { audio_url: audioUrl } = await uploadRes.json()
  if (!audioUrl) throw Object.assign(new Error('Gladia upload returned no audio_url'), { code: 502 })

  // Step 2: start transcription with Gladia-hosted URL
  const transcribeRes = await fetch(GLADIA_TRANSCRIBE_API, {
    method: 'POST',
    headers: {
      'x-gladia-key': gladiaToken,
      'Content-Type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      language_config: { languages: ['de', 'en'] }
    })
  })

  if (!transcribeRes.ok) {
    const err = await transcribeRes.text().catch(() => String(transcribeRes.status))
    throw Object.assign(new Error(`Gladia transcription start failed (${transcribeRes.status}): ${err}`), { code: 502 })
  }

  const data = await transcribeRes.json()
  if (!data.id) throw Object.assign(new Error('Gladia returned no request ID'), { code: 502 })
  return data.id
}

export async function pollGladiaResult(requestId, gladiaToken) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS)

    const res = await fetch(`${GLADIA_TRANSCRIBE_API}${requestId}`, {
      headers: { 'x-gladia-key': gladiaToken, accept: 'application/json' }
    })

    if (!res.ok) {
      const err = await res.text().catch(() => String(res.status))
      throw Object.assign(new Error(`Gladia poll failed (${res.status}): ${err}`), { code: 502 })
    }

    const data = await res.json()

    if (data.status === 'done') {
      // Gladia v2 nests transcription under result.result (double result)
      const transcription = data.result?.result?.transcription ?? data.result?.transcription
      const fullTranscript = transcription?.full_transcript
        || transcription?.utterances?.map(u => u.text).join(' ')
        || ''
      return { transcriptionText: fullTranscript, transcriptionJson: JSON.stringify(data.result) }
    }

    if (data.status === 'error') {
      throw Object.assign(new Error(`Gladia transcription error: ${JSON.stringify(data.error || {})}`), { code: 502 })
    }
  }

  throw Object.assign(new Error('Gladia transcription timeout after max polling attempts'), { code: 504 })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
