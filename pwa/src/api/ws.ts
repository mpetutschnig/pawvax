export type WsMessage =
  | { type: 'ready' }
  | { type: 'status'; message: string }
  | { type: 'result'; data: { documentId: string; docType: string; content: unknown } }
  | { type: 'error'; message: string }

export interface UploadCallbacks {
  onStatus: (msg: string) => void
  onProgress?: (percent: number) => void
  onResult: (data: WsMessage & { type: 'result' }) => void
  onError: (msg: string) => void
  metadata?: { allowedRoles?: string[] }
}

export function uploadDocument(
  animalId: string,
  file: File,
  callbacks: UploadCallbacks
): Promise<void> {
  return new Promise((resolve, reject) => {
    const token = localStorage.getItem('token')
    if (!token) {
      callbacks.onError('Nicht authentifiziert')
      return reject(new Error('Nicht authentifiziert'))
    }

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${protocol}://${location.host}/ws?token=${token}`
    console.debug('[WS] Connecting to:', wsUrl)

    let ws: WebSocket | null = null
    let uploadStarted = false

    const connect = () => {
      ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'

      ws.onopen = () => {
        if (!uploadStarted) {
          uploadStarted = true
          callbacks.onStatus('Verbindung hergestellt, starte Upload...')
          ws!.send(JSON.stringify({
            type: 'upload_start',
            animalId,
            filename: file.name,
            mimeType: file.type,
            allowedRoles: callbacks.metadata?.allowedRoles
          }))
        }
      }

      ws.onmessage = async (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data)

          if (msg.type === 'ready') {
            callbacks.onStatus('Server bereit, sende Datei...')
            const CHUNK = 64 * 1024
            const buffer = await file.arrayBuffer()
            let sent = 0
            for (let offset = 0; offset < buffer.byteLength; offset += CHUNK) {
              ws!.send(buffer.slice(offset, offset + CHUNK))
              sent += CHUNK
              const pct = Math.min(100, Math.round((sent / buffer.byteLength) * 100))
              callbacks.onProgress?.(pct)
              callbacks.onStatus(`Upload: ${pct}%`)
            }
            callbacks.onStatus('Datei vollständig gesendet, warte auf Analyse...')
            ws!.send(JSON.stringify({ type: 'upload_end' }))
            return
          }

          if (msg.type === 'status') {
            callbacks.onStatus(msg.message)
            return
          }

          if (msg.type === 'result') {
            callbacks.onResult(msg)
            if (ws) ws.close()
            resolve()
            return
          }

          if (msg.type === 'error') {
            callbacks.onError(msg.message)
            if (ws) ws.close()
            reject(new Error(msg.message))
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Nachrichtenverarbeitungsfehler'
          callbacks.onError(errMsg)
          if (ws) ws.close()
          reject(new Error(errMsg))
        }
      }

      ws.onerror = (err) => {
        const errMsg = err instanceof Event ? 'WebSocket Fehler' : String(err)
        callbacks.onError(errMsg)
        reject(new Error(errMsg))
      }

      ws.onclose = () => {
        if (!uploadStarted) {
          callbacks.onError('Verbindung geschlossen')
          reject(new Error('Verbindung geschlossen'))
        }
      }
    }

    connect()
  })
}
