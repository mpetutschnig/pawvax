import { readFileSync } from 'fs'
import { decrypt } from '../utils/crypto.js'
import { getSettingsMap } from './appSettings.js'

const GLADIA_UPLOAD_API = 'https://api.gladia.io/v2/upload/'
const GLADIA_TRANSCRIBE_API = 'https://api.gladia.io/v2/pre-recorded/'
const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 40

function tryDecrypt(value) {
  if (!value) return null
  try { return decrypt(value) } catch { return null }
}

export async function resolveGladiaToken(db, accountId) {
  const { rows: [acc] } = await db.query('SELECT gladia_token FROM accounts WHERE id = $1', [accountId])
  const userToken = tryDecrypt(acc?.gladia_token)
  if (userToken) return userToken

  const settings = await getSettingsMap(db)
  const systemToken = tryDecrypt(settings.system_gladia_token)
  if (systemToken) return systemToken

  throw Object.assign(new Error('Kein Gladia-Token konfiguriert. Bitte im Profil oder in den Admin-Einstellungen eintragen.'), { code: 422 })
}

// Returns { resultUrl, debug: { upload, transcription_start } }
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

  const uploadBody = await uploadRes.text()
  let uploadData
  try { uploadData = JSON.parse(uploadBody) } catch { uploadData = { raw: uploadBody } }

  if (!uploadRes.ok) {
    const err = Object.assign(new Error(`Gladia upload failed (${uploadRes.status}): ${uploadBody}`), { code: 502 })
    err.gladiaDebug = { step: 'upload', status: uploadRes.status, response: uploadData }
    throw err
  }

  const audioUrl = uploadData.audio_url
  if (!audioUrl) {
    const err = Object.assign(new Error(`Gladia upload returned no audio_url. Response: ${uploadBody}`), { code: 502 })
    err.gladiaDebug = { step: 'upload', status: uploadRes.status, response: uploadData }
    throw err
  }

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

  const transcribeBody = await transcribeRes.text()
  let transcribeData
  try { transcribeData = JSON.parse(transcribeBody) } catch { transcribeData = { raw: transcribeBody } }

  if (!transcribeRes.ok) {
    const err = Object.assign(new Error(`Gladia transcription start failed (${transcribeRes.status}): ${transcribeBody}`), { code: 502 })
    err.gladiaDebug = { step: 'transcription_start', status: transcribeRes.status, upload: uploadData, response: transcribeData }
    throw err
  }

  const resultUrl = transcribeData.result_url || (transcribeData.id ? `${GLADIA_TRANSCRIBE_API}${transcribeData.id}` : null)
  if (!resultUrl) {
    const err = Object.assign(new Error(`Gladia returned no result_url or id. Response: ${transcribeBody}`), { code: 502 })
    err.gladiaDebug = { step: 'transcription_start', status: transcribeRes.status, upload: uploadData, response: transcribeData }
    throw err
  }

  return {
    resultUrl,
    debug: { upload: uploadData, transcription_start: transcribeData }
  }
}

// Returns { transcriptionText, transcriptionJson, debugData }
export async function pollGladiaResult(resultUrl, gladiaToken) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS)

    const res = await fetch(resultUrl, {
      headers: { 'x-gladia-key': gladiaToken, accept: 'application/json' }
    })

    const body = await res.text()
    let data
    try { data = JSON.parse(body) } catch { data = { raw: body } }

    if (!res.ok) {
      const err = Object.assign(new Error(`Gladia poll failed (${res.status}): ${body}`), { code: 502 })
      err.gladiaDebug = { step: 'poll', attempt, status: res.status, response: data }
      throw err
    }

    if (data.status === 'done') {
      // Gladia v2 nests transcription under result.result (double result)
      const transcription = data.result?.result?.transcription ?? data.result?.transcription
      const fullTranscript = transcription?.full_transcript
        || transcription?.utterances?.map(u => u.text).join(' ')
        || ''
      return {
        transcriptionText: fullTranscript,
        transcriptionJson: JSON.stringify(data.result),
        debugData: data
      }
    }

    if (data.status === 'error') {
      const err = Object.assign(new Error(`Gladia transcription error: ${JSON.stringify(data.error || data)}`), { code: 502 })
      err.gladiaDebug = { step: 'poll', attempt, status: 'error', response: data }
      throw err
    }
  }

  throw Object.assign(new Error('Gladia transcription timeout after max polling attempts'), { code: 504 })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
