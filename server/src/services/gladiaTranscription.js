import { createReadStream } from 'fs'
import { decrypt } from '../utils/crypto.js'
import { getSettingsMap } from './appSettings.js'

const GLADIA_API = 'https://api.gladia.io/v2/pre-recorded'
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
  const form = new FormData()
  form.append('audio', new Blob([createReadStream(audioPath)]))
  form.append('language_config', JSON.stringify({ languages: ['de', 'en'] }))

  const res = await fetch(GLADIA_API, {
    method: 'POST',
    headers: { 'x-gladia-key': gladiaToken },
    body: form
  })

  if (!res.ok) {
    const err = await res.text().catch(() => String(res.status))
    throw Object.assign(new Error(`Gladia upload failed (${res.status}): ${err}`), { code: 502 })
  }

  const data = await res.json()
  if (!data.id) throw Object.assign(new Error('Gladia returned no request ID'), { code: 502 })
  return data.id
}

export async function pollGladiaResult(requestId, gladiaToken) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS)

    const res = await fetch(`${GLADIA_API}/${requestId}`, {
      headers: { 'x-gladia-key': gladiaToken }
    })

    if (!res.ok) {
      const err = await res.text().catch(() => String(res.status))
      throw Object.assign(new Error(`Gladia poll failed (${res.status}): ${err}`), { code: 502 })
    }

    const data = await res.json()

    if (data.status === 'done') {
      const fullTranscript = data.result?.transcription?.full_transcript
        || data.result?.transcription?.utterances?.map(u => u.text).join(' ')
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
