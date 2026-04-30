import { useRef, useCallback, useEffect } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export function useBarcode(elementId: string, onResult: (code: string) => void, onError?: (msg: string) => void) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const activeRef = useRef(false)

  const start = useCallback(async () => {
    if (activeRef.current) return

    try {
      // Überprüfe, ob DOM-Element existiert
      const element = document.getElementById(elementId)
      if (!element) {
        onError?.(`DOM-Element mit ID "${elementId}" nicht gefunden`)
        return
      }

      const scanner = new Html5Qrcode(elementId)
      scannerRef.current = scanner
      activeRef.current = true

      // Versuche Kamera mit Fallback auf Rückkamera
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            onResult(decodedText)
            scannerRef.current?.stop().catch(() => {})
          },
          undefined
        )
      } catch (cameraErr) {
        // Fallback: Versuche mit leerer Config
        await scanner.start(
          {},
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            onResult(decodedText)
            scannerRef.current?.stop().catch(() => {})
          },
          undefined
        )
      }
    } catch (err) {
      activeRef.current = false
      const msg = err instanceof Error ? err.message : 'Kamera nicht verfügbar'
      console.error('[Barcode] Fehler:', msg, err)

      const friendlyMsg = msg.includes('Permission') || msg.includes('permission')
        ? 'Kamerazugriff verweigert. Bitte Kamera-Berechtigung in Browser-Einstellungen erteilen.'
        : msg.includes('NotFoundError') || msg.includes('NotFound') || msg.includes('not found')
          ? 'Kamera nicht gefunden. Verfügbar nur auf HTTPS oder localhost mit Kamera-Gerät.'
          : msg.includes('Not found') || msg.includes('no camera')
            ? 'Keine Kamera verfügbar. Stelle sicher, dass das Gerät eine Kamera hat.'
            : `Kamera-Fehler: ${msg}`
      onError?.(friendlyMsg)
    }
  }, [elementId, onResult, onError])

  const stop = useCallback(async () => {
    if (!activeRef.current || !scannerRef.current) return
    activeRef.current = false
    try {
      await scannerRef.current.stop()
      scannerRef.current.clear()
    } catch { /* already stopped */ }
  }, [])

  useEffect(() => () => {
    stop()
  }, [stop])

  return { start, stop }
}
