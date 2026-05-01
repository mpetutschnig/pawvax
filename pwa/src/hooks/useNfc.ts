import { useState, useCallback, useRef } from 'react'

export type NfcState = 'idle' | 'scanning' | 'done' | 'unsupported' | 'error'

export function useNfc(onTag: (id: string) => void, onError?: (msg: string) => void) {
  const [state, setState] = useState<NfcState>(
    'NDEFReader' in window ? 'idle' : 'unsupported'
  )
  const [error, setError] = useState<string | null>(null)
  const nfcReaderRef = useRef<any>(null)

  const start = useCallback(async () => {
    if (!('NDEFReader' in window)) {
      setState('unsupported')
      const msg = 'NFC wird in diesem Browser nicht unterstützt'
      setError(msg)
      onError?.(msg)
      return
    }

    setState('scanning')
    setError(null)

    try {
      // @ts-expect-error — Web NFC API types not in lib
      nfcReaderRef.current = new window.NDEFReader()
      await nfcReaderRef.current.scan()

      nfcReaderRef.current.onreadingerror = () => {
        const msg = 'NFC-Tag konnte nicht gelesen werden'
        setError(msg)
        setState('error')
        onError?.(msg)
      }

      nfcReaderRef.current.onreading = (event: { serialNumber: string }) => {
        const tagId = event.serialNumber.replace(/:/g, '').toUpperCase()
        setState('done')
        onTag(tagId)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'NFC Fehler'
      setError(msg)
      setState('error')
      onError?.(msg)
    }
  }, [onTag, onError])

  const stop = useCallback(() => {
    if (nfcReaderRef.current) {
      nfcReaderRef.current.abort?.()
    }
    setState('idle')
  }, [])

  return { state, error, start, stop }
}
