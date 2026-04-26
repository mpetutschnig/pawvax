import { v4 as uuid } from 'uuid'
import { getDb } from '../db/index.js'
import { analyzeDocument } from '../services/ocr.js'
import { saveImageChunks } from '../services/storage.js'

export default async function wsDocumentUpload(fastify) {
  fastify.get('/ws', { websocket: true }, async (socket, req) => {
    // JWT aus Query-Parameter oder Header validieren
    let accountId, userRole, userGeminiKey = null
    try {
      const token = req.query.token ?? req.headers.authorization?.replace('Bearer ', '')
      if (!token) throw new Error('Kein Token')
      const payload = fastify.jwt.verify(token)
      accountId = payload.accountId
      const userRoles = payload.roles ?? [payload.role ?? 'user']
      // Stärkste Rolle: vet > authority > admin > user
      userRole = userRoles.includes('vet') ? 'vet'
               : userRoles.includes('authority') ? 'authority'
               : userRoles.includes('admin') ? 'admin'
               : 'user'
      // User-Gemini-Token aus DB laden
      const db = getDb()
      const acc = db.prepare('SELECT gemini_token FROM accounts WHERE id = ?').get(accountId)
      userGeminiKey = acc?.gemini_token ?? null
      console.log(`[WS] Client connected: ${accountId} (${userRole}, roles: ${userRoles.join(',')}, has_gemini_key: ${!!userGeminiKey})`)
    } catch (err) {
      console.error('[WS] Auth error:', err.message)
      send(socket, { type: 'error', message: 'Nicht autorisiert' })
      socket.close()
      return
    }

    let uploadState = null

    socket.on('message', async (raw, isBinary) => {
      // Binärdaten = Bildchunk
      if (isBinary) {
        if (uploadState?.writer) {
          uploadState.writer.write(raw)
          console.log(`[WS] Chunk erhalten: ${raw.length} bytes`)
        }
        return
      }

      let msg
      try {
        msg = JSON.parse(raw.toString())
        console.log(`[WS] Message: ${msg.type}`)
      } catch (err) {
        console.error('[WS] Parse error:', err.message)
        send(socket, { type: 'error', message: 'Ungültige Nachricht' })
        return
      }

      switch (msg.type) {
        case 'upload_start': {
          const { animalId, filename, mimeType, allowedRoles } = msg
          console.log(`[WS] Upload start: ${filename} für Tier ${animalId}`)

          // sicherstellen, dass das Tier dem Account gehört
          const db = getDb()
          const animal = db.prepare('SELECT id FROM animals WHERE id = ? AND account_id = ?')
            .get(animalId, accountId)

          if (!animal) {
            console.error(`[WS] Animal not found: ${animalId}`)
            send(socket, { type: 'error', message: 'Tier nicht gefunden' })
            return
          }

          const safeFilename = `${uuid()}_${filename.replace(/[^a-z0-9._-]/gi, '_')}`
          uploadState = {
            animalId,
            mimeType,
            allowedRoles: allowedRoles ?? ['vet', 'authority', 'readonly'],
            filename: safeFilename,
            writer: saveImageChunks(safeFilename)
          }

          console.log(`[WS] Ready to receive`)
          send(socket, { type: 'ready' })
          break
        }

        case 'upload_end': {
          if (!uploadState) {
            send(socket, { type: 'error', message: 'Kein aktiver Upload' })
            return
          }

          try {
            send(socket, { type: 'status', message: 'Bild empfangen, starte Analyse...' })
            const imagePath = await uploadState.writer.finish()

            let analyzeResult
            try {
              analyzeResult = await analyzeDocument(imagePath, userGeminiKey, (progressMsg) => {
                send(socket, { type: 'status', message: progressMsg })
              })
            } catch (err) {
              throw err // Will be caught by outer catch block
            }
            const { provider, data } = analyzeResult

            send(socket, { type: 'status', message: 'Speichere Ergebnis...' })

            const db = getDb()
            const docId = uuid()
            db.prepare(`
              INSERT INTO documents (id, animal_id, doc_type, image_path, extracted_json, ocr_provider, added_by_account, added_by_role, allowed_roles)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(docId, uploadState.animalId, data.type ?? 'other', imagePath, JSON.stringify(data), provider, accountId, userRole, JSON.stringify(uploadState.allowedRoles))

            send(socket, {
              type: 'result',
              data: { documentId: docId, docType: data.type, content: data }
            })
          } catch (err) {
            console.error('OCR/Upload Fehler:', err)
            send(socket, { type: 'error', message: err.message })
          } finally {
            uploadState = null
          }
          break
        }

        default:
          send(socket, { type: 'error', message: `Unbekannter Nachrichtentyp: ${msg.type}` })
      }
    })

    socket.on('error', (err) => console.error('WS Fehler:', err))
  })
}

function send(socket, obj) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(obj))
  }
}
