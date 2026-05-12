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

      nfcReaderRef.current.onreading = (event: { serialNumber: string, message: any }) => {
        let tagId = (event.serialNumber || '').replace(/:/g, '').toUpperCase()
        
        // If serialNumber is empty, try to get info from the message (NDEF payload)
        if (!tagId && event.message?.records) {
          for (const record of event.message.records) {
            if (record.recordType === 'text' || record.recordType === 'url') {
              const decoder = new TextDecoder()
              const text = decoder.decode(record.data)
              // If it's a URL or contains a tag ID, we can use it. 
              // handleTag in the components already knows how to handle full URLs.
              if (text) {
                tagId = text
                break
              }
            }
          }
        }

        // Only proceed if we actually found something. 
        // If tagId is still empty, we ignore this reading event and wait for the next one (which usually has the serialNumber)
        if (tagId) {
          setState('done')
          onTag(tagId)
        }
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
