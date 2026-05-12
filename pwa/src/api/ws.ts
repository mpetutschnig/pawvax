export type WsMessage =
  | { type: 'auth_ok' }
  | { type: 'ready'; documentId?: string }
  | { type: 'page_saved'; documentId: string; pageNumber: number; message: string }
  | { type: 'status'; message: string }
  | { type: 'result'; data: { documentId: string; docType: string; pages?: number; suggestedType?: string; content?: unknown; analysisStatus?: string; ocrProvider?: string; analysisError?: string | null } }
  | { type: 'error'; message: string; details?: string }

export interface UploadCallbacks {
  onStatus: (msg: string) => void
  onProgress?: (percent: number) => void
  onResult: (data: WsMessage & { type: 'result' }) => void
  onError: (msg: string, details?: string) => void
  metadata?: { 
    allowedRoles?: string[]
    language?: string
    requestedDocumentType?: string
    provider?: string | null
    model?: string | null
  }
}

// Upload single or multiple pages as one document
export function uploadMultiPageDocument(
  animalId: string,
  files: File[],
  callbacks: UploadCallbacks
): Promise<void> {
  return new Promise((resolve, reject) => {
    const token = localStorage.getItem('token')
    if (!token) {
      callbacks.onError('Nicht authentifiziert')
      return reject(new Error('Nicht authentifiziert'))
    }

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${protocol}://${location.host}/ws`

    let ws: WebSocket | null = null
    let authenticated = false
    let documentId: string | null = null
    let currentPageIndex = 0

    const connect = () => {
      ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'

      ws.onopen = () => {
        callbacks.onStatus('Verbindung hergestellt, authentifiziere...')
        ws!.send(JSON.stringify({ type: 'auth', token }))
      }

      ws.onmessage = async (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data)

          if (msg.type === 'auth_ok') {
            authenticated = true
            callbacks.onStatus('Authentifizierung erfolgreich')
            uploadNextPage(0)
            return
          }

          if (msg.type === 'ready') {
            documentId = msg.documentId || documentId
            callbacks.onStatus(`Server bereit für Seite, sende Datei...`)
            const currentFile = files[currentPageIndex]
            uploadPageData(currentFile, currentPageIndex)
            return
          }

          if (msg.type === 'page_saved') {
            callbacks.onStatus(msg.message)
            currentPageIndex++
            if (currentPageIndex < files.length) {
              uploadNextPage(currentPageIndex)
            }
            return
          }

          if (msg.type === 'status') {
            callbacks.onStatus(msg.message)
            return
          }

          if (msg.type === 'result') {
            callbacks.onResult(msg as any)
            if (ws) ws.close()
            resolve()
            return
          }

          if (msg.type === 'error') {
            callbacks.onError(msg.message, msg.details)
            if (ws) ws.close()
            const err = new Error(msg.message) as any
            err.details = msg.details
            reject(err)
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
        if (!authenticated) {
          callbacks.onError('Verbindung geschlossen')
          reject(new Error('Verbindung geschlossen'))
        }
      }
    }

    const uploadNextPage = (pageIndex: number) => {
      const file = files[pageIndex]
      ws!.send(JSON.stringify({
        type: 'upload_start',
        animalId,
        filename: file.name,
        mimeType: file.type,
        pageNumber: pageIndex + 1,
        documentId,
        allowedRoles: callbacks.metadata?.allowedRoles,
        language: callbacks.metadata?.language || 'de',
        requestedDocumentType: callbacks.metadata?.requestedDocumentType || 'auto',
        provider: callbacks.metadata?.provider,
        model: callbacks.metadata?.model
      }))
    }

    const uploadPageData = async (file: File, pageIndex: number) => {
      const isLast = pageIndex === files.length - 1
      const CHUNK = 64 * 1024
      const buffer = await file.arrayBuffer()
      let sent = 0

      for (let offset = 0; offset < buffer.byteLength; offset += CHUNK) {
        ws!.send(buffer.slice(offset, offset + CHUNK))
        sent += CHUNK
        const pct = Math.min(100, Math.round((sent / buffer.byteLength) * 100))
        callbacks.onProgress?.(pct)
        callbacks.onStatus(`Seite ${pageIndex + 1}: Upload ${pct}%`)
      }

      callbacks.onStatus(`Seite ${pageIndex + 1} vollständig, warte...`)
      ws!.send(JSON.stringify({ type: 'upload_end', is_last: isLast }))
    }

    connect()
  })
}

// Legacy single-file upload (uses multipage with 1 file)
export function uploadDocument(
  animalId: string,
  file: File,
  callbacks: UploadCallbacks
): Promise<void> {
  return uploadMultiPageDocument(animalId, [file], callbacks)
}
