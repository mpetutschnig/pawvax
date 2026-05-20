import { randomUUID } from 'node:crypto'
import { createReadStream, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'fs'
import { getDb } from '../db/index.js'
import { UPLOADS_DIR } from '../utils/paths.js'
import { logAudit } from '../services/audit.js'
import { resolveGladiaToken, submitToGladia, pollGladiaResult } from '../services/gladiaTranscription.js'
import { analyzeMemoWithAI, logVoiceMemoUsage } from '../services/memoAnalysis.js'

const VOICE_DIR = join(UPLOADS_DIR, 'voice')
mkdirSync(VOICE_DIR, { recursive: true })

function parseRoles(val, fallback = []) {
  try { return JSON.parse(val) } catch { return fallback }
}

async function canAccessAnimal(db, animalId, accountId, role) {
  const { rows: [animal] } = await db.query('SELECT account_id FROM animals WHERE id = $1', [animalId])
  if (!animal) return null
  if (animal.account_id === accountId) return { isOwner: true }
  const roleStr = Array.isArray(role) ? role[0] : (role || 'user')
  const { rows: [sharing] } = await db.query(
    'SELECT id FROM animal_sharing WHERE animal_id = $1 AND role = $2',
    [animalId, roleStr]
  )
  return sharing ? { isOwner: false } : null
}

async function processVoiceMemoAsync(db, memoId, audioPath, audioRelPath, accountId, languageMode, log) {
  try {
    await db.query("UPDATE voice_memos SET analysis_status = 'transcribing' WHERE id = $1", [memoId])

    const gladiaToken = await resolveGladiaToken(db, accountId)
    const requestId = await submitToGladia(audioRelPath, gladiaToken)

    await db.query(
      "UPDATE voice_memos SET gladia_request_id = $1 WHERE id = $2",
      [requestId, memoId]
    )

    const { transcriptionText, transcriptionJson } = await pollGladiaResult(requestId, gladiaToken)

    await db.query(
      "UPDATE voice_memos SET transcription_text = $1, transcription_json = $2, analysis_status = 'pending_analysis' WHERE id = $3",
      [transcriptionText, transcriptionJson, memoId]
    )

    if (!transcriptionText || transcriptionText.trim().length === 0) {
      await db.query("UPDATE voice_memos SET analysis_status = 'failed' WHERE id = $1", [memoId])
      return
    }

    await db.query("UPDATE voice_memos SET analysis_status = 'analyzing' WHERE id = $1", [memoId])

    const { extractedJson, aiProvider } = await analyzeMemoWithAI(db, accountId, transcriptionText, languageMode)

    const { rows: [acc] } = await db.query('SELECT gemini_token, anthropic_token, openai_token FROM accounts WHERE id = $1', [accountId])
    const hasOwnKey = !!(acc?.gemini_token || acc?.anthropic_token || acc?.openai_token)

    await db.query(
      "UPDATE voice_memos SET extracted_json = $1, ai_provider = $2, analysis_status = 'completed' WHERE id = $3",
      [JSON.stringify(extractedJson), aiProvider, memoId]
    )

    await logVoiceMemoUsage(db, { accountId, voiceMemoId: memoId, aiProvider, hasOwnKey, languageMode })
  } catch (err) {
    log.error({ err: err.message, memoId }, 'Voice memo processing failed')
    const errorMsg = err.code === 422
      ? 'Kein Gladia-Token konfiguriert. Bitte im Profil oder Admin-Bereich eintragen.'
      : (err.message || 'Transkription fehlgeschlagen')
    await db.query(
      "UPDATE voice_memos SET analysis_status = 'failed', error_message = $2 WHERE id = $1",
      [memoId, errorMsg]
    ).catch(() => {})
  }
}

export default async function voiceMemoRoutes(fastify) {
  // POST /api/animals/:id/voice-memos — vet only, multipart upload
  fastify.post('/api/animals/:id/voice-memos', {
    onRequest: [fastify.authenticate],
    config: { rawBody: false },
    schema: {
      summary: 'Upload voice memo (vet only)',
      description: 'Uploads an audio file and triggers async Gladia transcription + AI analysis. Returns 202 immediately.',
      tags: ['Voice Memos'],
      security: [{ bearerAuth: [] }]
    }
  }, async (req, reply) => {
    const { role, accountId, name: vetName } = req.user
    const roleStr = Array.isArray(role) ? role[0] : (role || 'user')
    if (!roleStr.includes('vet')) return reply.code(403).send({ error: 'Nur Tierärzte können Sprachnotizen erstellen' })

    const animalId = req.params.id
    const db = getDb()

    const access = await canAccessAnimal(db, animalId, accountId, roleStr)
    if (!access) return reply.code(403).send({ error: 'Kein Zugriff auf dieses Tier' })

    const data = await req.file({ limits: { fileSize: 100 * 1024 * 1024 } })
    if (!data) return reply.code(400).send({ error: 'Keine Audiodatei übertragen' })

    const languageMode = data.fields?.language_mode?.value || 'de'
    const allowedLanguageModes = ['de', 'en', 'both']
    const resolvedLangMode = allowedLanguageModes.includes(languageMode) ? languageMode : 'de'

    const memoId = randomUUID()
    const filename = `${memoId}.webm`
    const audioPath = join(VOICE_DIR, filename)
    const relPath = join('voice', filename)

    await pipeline(data.file, createWriteStream(audioPath))

    const { rows: [acc] } = await db.query(
      'SELECT verified FROM accounts WHERE id = $1',
      [accountId]
    )
    const isVerified = acc?.verified === 1 ? 1 : 0

    await db.query(
      `INSERT INTO voice_memos (id, animal_id, account_id, audio_path, language_mode, added_by_role, added_by_name, added_by_verified, analysis_status)
       VALUES ($1, $2, $3, $4, $5, 'vet', $6, $7, 'pending_transcription')`,
      [memoId, animalId, accountId, relPath, resolvedLangMode, vetName || 'Tierarzt', isVerified]
    )

    await logAudit(db, {
      accountId,
      role: roleStr,
      action: 'create_voice_memo',
      resource: 'voice_memo',
      resourceId: memoId,
      details: { animalId, languageMode: resolvedLangMode },
      ip: req.ip
    })

    setImmediate(() => processVoiceMemoAsync(db, memoId, audioPath, relPath, accountId, resolvedLangMode, fastify.log))

    return reply.code(202).send({ id: memoId, status: 'pending_transcription' })
  })

  // GET /api/animals/:id/voice-memos — role-filtered list
  fastify.get('/api/animals/:id/voice-memos', {
    onRequest: [fastify.authenticate],
    schema: {
      summary: 'List voice memos for animal',
      description: 'Returns voice memos visible to the caller based on their role and allowed_roles settings.',
      tags: ['Voice Memos'],
      security: [{ bearerAuth: [] }]
    }
  }, async (req, reply) => {
    const { accountId, role } = req.user
    const animalId = req.params.id
    const db = getDb()
    const roleStr = Array.isArray(role) ? role[0] : (role || 'user')

    const { rows: [animal] } = await db.query('SELECT account_id FROM animals WHERE id = $1', [animalId])
    if (!animal) return reply.code(404).send({ error: 'Tier nicht gefunden' })

    const isOwner = animal.account_id === accountId

    const { rows } = await db.query(
      'SELECT * FROM voice_memos WHERE animal_id = $1 ORDER BY created_at DESC',
      [animalId]
    )

    const filtered = rows.filter(m => {
      if (isOwner) return true
      const allowed = parseRoles(m.allowed_roles, ['vet', 'authority'])
      return allowed.includes(roleStr)
    }).map(m => {
      const extracted = m.extracted_json ? (() => { try { return JSON.parse(m.extracted_json) } catch { return {} } })() : {}
      const summaryRoles = parseRoles(m.summary_roles, ['vet', 'authority', 'guest'])
      const canSeeSummary = isOwner || summaryRoles.includes(roleStr)
      return {
        id: m.id,
        animal_id: m.animal_id,
        created_at: m.created_at,
        analysis_status: m.analysis_status,
        language_mode: m.language_mode,
        added_by_name: m.added_by_name,
        added_by_verified: m.added_by_verified,
        title: canSeeSummary ? (extracted.title || extracted.title_de || null) : null,
        summary: canSeeSummary ? (extracted.summary || extracted.summary_de || null) : null
      }
    })

    return reply.send(filtered)
  })

  // GET /api/voice-memos/:id — full detail (role-filtered)
  fastify.get('/api/voice-memos/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      summary: 'Get voice memo detail',
      description: 'Returns memo detail. transcription_text and extracted_json fields are filtered based on caller role vs transcription_roles/summary_roles.',
      tags: ['Voice Memos'],
      security: [{ bearerAuth: [] }]
    }
  }, async (req, reply) => {
    const { accountId, role } = req.user
    const db = getDb()
    const roleStr = Array.isArray(role) ? role[0] : (role || 'user')

    const { rows: [memo] } = await db.query(
      'SELECT vm.*, a.account_id as owner_id FROM voice_memos vm JOIN animals a ON a.id = vm.animal_id WHERE vm.id = $1',
      [req.params.id]
    )
    if (!memo) return reply.code(404).send({ error: 'Sprachnotiz nicht gefunden' })

    const isOwner = memo.owner_id === accountId
    const allowedRoles = parseRoles(memo.allowed_roles, ['vet', 'authority'])
    if (!isOwner && !allowedRoles.includes(roleStr)) return reply.code(403).send({ error: 'Kein Zugriff' })

    const transcriptionRoles = parseRoles(memo.transcription_roles, ['vet'])
    const summaryRoles = parseRoles(memo.summary_roles, ['vet', 'authority', 'guest'])
    const canSeeTranscription = isOwner || transcriptionRoles.includes(roleStr)
    const canSeeSummary = isOwner || summaryRoles.includes(roleStr)
    const isCreator = memo.account_id === accountId

    const extracted = memo.extracted_json ? (() => { try { return JSON.parse(memo.extracted_json) } catch { return {} } })() : null

    return reply.send({
      id: memo.id,
      animal_id: memo.animal_id,
      created_at: memo.created_at,
      analysis_status: memo.analysis_status,
      language_mode: memo.language_mode,
      audio_duration_seconds: memo.audio_duration_seconds,
      added_by_name: memo.added_by_name,
      added_by_role: memo.added_by_role,
      added_by_verified: memo.added_by_verified,
      ai_provider: memo.ai_provider,
      transcription_text: canSeeTranscription ? memo.transcription_text : null,
      extracted_json: canSeeSummary ? extracted : null,
      allowed_roles: isCreator || isOwner ? parseRoles(memo.allowed_roles) : undefined,
      summary_roles: isCreator || isOwner ? parseRoles(memo.summary_roles) : undefined,
      transcription_roles: isCreator || isOwner ? parseRoles(memo.transcription_roles) : undefined,
      can_delete: isCreator && roleStr.includes('vet')
    })
  })

  // PATCH /api/voice-memos/:id — update role permissions (vet + creator only)
  fastify.patch('/api/voice-memos/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      summary: 'Update voice memo permissions',
      description: 'Vet (creator) can update allowed_roles, summary_roles, transcription_roles.',
      tags: ['Voice Memos'],
      security: [{ bearerAuth: [] }]
    }
  }, async (req, reply) => {
    const { accountId, role } = req.user
    const roleStr = Array.isArray(role) ? role[0] : (role || 'user')
    const db = getDb()

    const { rows: [memo] } = await db.query('SELECT account_id FROM voice_memos WHERE id = $1', [req.params.id])
    if (!memo) return reply.code(404).send({ error: 'Sprachnotiz nicht gefunden' })
    if (memo.account_id !== accountId || !roleStr.includes('vet')) {
      return reply.code(403).send({ error: 'Nur der erstellende Tierarzt kann Freigaben ändern' })
    }

    const updates = []
    const vals = []
    const { allowed_roles, summary_roles, transcription_roles } = req.body || {}

    if (Array.isArray(allowed_roles)) { vals.push(JSON.stringify(allowed_roles)); updates.push(`allowed_roles = $${vals.length}`) }
    if (Array.isArray(summary_roles)) { vals.push(JSON.stringify(summary_roles)); updates.push(`summary_roles = $${vals.length}`) }
    if (Array.isArray(transcription_roles)) { vals.push(JSON.stringify(transcription_roles)); updates.push(`transcription_roles = $${vals.length}`) }

    if (!updates.length) return reply.code(400).send({ error: 'Keine Änderungen' })
    vals.push(req.params.id)
    await db.query(`UPDATE voice_memos SET ${updates.join(', ')} WHERE id = $${vals.length}`, vals)

    return reply.send({ success: true })
  })

  // DELETE /api/voice-memos/:id — vet + creator only
  fastify.delete('/api/voice-memos/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      summary: 'Delete voice memo (vet + creator only)',
      description: 'Deletes the voice memo record and audio file. Only the vet who created it can delete.',
      tags: ['Voice Memos'],
      security: [{ bearerAuth: [] }]
    }
  }, async (req, reply) => {
    const { accountId, role } = req.user
    const roleStr = Array.isArray(role) ? role[0] : (role || 'user')
    if (!roleStr.includes('vet')) return reply.code(403).send({ error: 'Nur Tierärzte können Sprachnotizen löschen' })

    const db = getDb()
    const { rows: [memo] } = await db.query('SELECT account_id, audio_path FROM voice_memos WHERE id = $1', [req.params.id])
    if (!memo) return reply.code(404).send({ error: 'Sprachnotiz nicht gefunden' })
    if (memo.account_id !== accountId) return reply.code(403).send({ error: 'Nur der erstellende Tierarzt kann diese Notiz löschen' })

    await db.query('DELETE FROM voice_memos WHERE id = $1', [req.params.id])

    try {
      if (memo.audio_path) unlinkSync(join(UPLOADS_DIR, memo.audio_path))
    } catch { /* file may not exist */ }

    await logAudit(db, {
      accountId,
      role: roleStr,
      action: 'delete_voice_memo',
      resource: 'voice_memo',
      resourceId: req.params.id,
      details: {},
      ip: req.ip
    })

    return reply.code(204).send()
  })

  // POST /api/voice-memos/:id/retry — re-run analysis
  fastify.post('/api/voice-memos/:id/retry', {
    onRequest: [fastify.authenticate],
    schema: {
      summary: 'Retry voice memo analysis',
      description: 'Re-triggers Gladia transcription (or just AI analysis if transcription exists). Vet + creator only.',
      tags: ['Voice Memos'],
      security: [{ bearerAuth: [] }]
    }
  }, async (req, reply) => {
    const { accountId, role } = req.user
    const roleStr = Array.isArray(role) ? role[0] : (role || 'user')
    if (!roleStr.includes('vet')) return reply.code(403).send({ error: 'Nur Tierärzte können Analysen wiederholen' })

    const db = getDb()
    const { rows: [memo] } = await db.query('SELECT account_id, audio_path, language_mode, transcription_text FROM voice_memos WHERE id = $1', [req.params.id])
    if (!memo) return reply.code(404).send({ error: 'Sprachnotiz nicht gefunden' })
    if (memo.account_id !== accountId) return reply.code(403).send({ error: 'Kein Zugriff' })

    await db.query("UPDATE voice_memos SET analysis_status = 'pending_transcription' WHERE id = $1", [req.params.id])
    const audioPath = join(UPLOADS_DIR, memo.audio_path)
    setImmediate(() => processVoiceMemoAsync(db, req.params.id, audioPath, memo.audio_path, accountId, memo.language_mode || 'de', fastify.log))

    return reply.send({ status: 'pending_transcription' })
  })

  // GET /api/voice-memos/:id/audio — stream audio file
  fastify.get('/api/voice-memos/:id/audio', {
    onRequest: [fastify.authenticate],
    schema: {
      summary: 'Stream voice memo audio',
      description: 'Returns the audio file as a stream. Requires Bearer token (use blob fetch in browser, not direct <audio src>).',
      tags: ['Voice Memos'],
      security: [{ bearerAuth: [] }]
    }
  }, async (req, reply) => {
    const { accountId, role } = req.user
    const db = getDb()
    const roleStr = Array.isArray(role) ? role[0] : (role || 'user')

    const { rows: [memo] } = await db.query(
      'SELECT vm.audio_path, vm.allowed_roles, a.account_id as owner_id FROM voice_memos vm JOIN animals a ON a.id = vm.animal_id WHERE vm.id = $1',
      [req.params.id]
    )
    if (!memo) return reply.code(404).send({ error: 'Sprachnotiz nicht gefunden' })

    const isOwner = memo.owner_id === accountId
    const allowedRoles = parseRoles(memo.allowed_roles, ['vet', 'authority'])
    if (!isOwner && !allowedRoles.includes(roleStr)) return reply.code(403).send({ error: 'Kein Zugriff' })

    const audioPath = join(UPLOADS_DIR, memo.audio_path)
    const stream = createReadStream(audioPath)
    reply.header('Content-Type', 'audio/webm')
    return reply.send(stream)
  })
}
