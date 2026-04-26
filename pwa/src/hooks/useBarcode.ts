import { useRef, useCallback, useEffect } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export function useBarcode(elementId: string, onResult: (code: string) => void, onError?: (msg: string) => void) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const activeRef = useRef(false)

  const start = useCallback(async () => {
    if (activeRef.current) return

    try {
      const scanner = new Html5Qrcode(elementId)
      scannerRef.current = scanner
      activeRef.current = true

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          onResult(decodedText)
          stop()
        },
        undefined
      )
    } catch (err) {
      activeRef.current = false
      const msg = err instanceof Error ? err.message : 'Kamera nicht verfügbar'
      const friendlyMsg = msg.includes('Permission')
        ? 'Kamerazugriff verweigert. Bitte Berechtigung erteilen.'
        : msg.includes('NotFoundError')
          ? 'Kamera nicht gefunden. Verfügbar nur auf HTTPS oder localhost.'
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
