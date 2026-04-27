import { v4 as uuid } from 'uuid'
import { getDb } from '../db/index.js'
import { analyzeDocument } from '../services/ocr.js'
import { saveImageChunks } from '../services/storage.js'
import { decrypt } from '../utils/crypto.js'

export default async function wsDocumentUpload(fastify) {
  fastify.get('/ws', { websocket: true }, async (socket, req) => {
    let accountId, userRole, userGeminiKey = null
    let authenticated = false
    let uploadState = null

    socket.on('message', async (raw, isBinary) => {
      // Skip binary chunks until authenticated
      if (isBinary) {
        if (!authenticated) {
          send(socket, { type: 'error', message: 'Not authenticated' })
          return
        }
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

      // Handle auth before anything else
      if (msg.type === 'auth') {
        const { token } = msg
        if (!token) {
          send(socket, { type: 'error', message: 'Kein Token' })
          socket.close()
          return
        }
        try {
          const payload = fastify.jwt.verify(token)
          accountId = payload.accountId
          const userRoles = payload.roles ?? [payload.role ?? 'user']
          userRole = userRoles.includes('vet') ? 'vet'
                   : userRoles.includes('authority') ? 'authority'
                   : userRoles.includes('admin') ? 'admin'
                   : 'user'

          const db = getDb()
          const acc = db.prepare('SELECT gemini_token FROM accounts WHERE id = ?').get(accountId)
          userGeminiKey = acc?.gemini_token ? decrypt(acc.gemini_token) : null

          authenticated = true
          console.log(`[WS] Client authenticated: ${accountId} (${userRole}, has_gemini_key: ${!!userGeminiKey})`)
          send(socket, { type: 'auth_ok' })
        } catch (err) {
          console.error('[WS] Auth error:', err.message)
          send(socket, { type: 'error', message: 'Authentifizierung fehlgeschlagen' })
          socket.close()
        }
        return
      }

      // Require authentication for all other messages
      if (!authenticated) {
        send(socket, { type: 'error', message: 'Not authenticated' })
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
