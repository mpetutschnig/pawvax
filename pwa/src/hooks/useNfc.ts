import { useState, useCallback } from 'react'

export type NfcState = 'idle' | 'scanning' | 'done' | 'unsupported' | 'error'

export function useNfc(onTag: (id: string) => void) {
  const [state, setState] = useState<NfcState>(
    'NDEFReader' in window ? 'idle' : 'unsupported'
  )
  const [error, setError] = useState<string | null>(null)

  const start = useCallback(async () => {
    if (!('NDEFReader' in window)) {
      setState('unsupported')
      return
    }

    setState('scanning')
    setError(null)

    try {
      // @ts-expect-error — Web NFC API types not in lib
      const reader = new window.NDEFReader()
      await reader.scan()

      reader.onreadingerror = () => {
        setError('NFC-Tag konnte nicht gelesen werden')
        setState('error')
      }

      reader.onreading = (event: { serialNumber: string }) => {
        const tagId = event.serialNumber.replace(/:/g, '').toUpperCase()
        setState('done')
        onTag(tagId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'NFC Fehler')
      setState('error')
    }
  }, [onTag])

  return { state, error, start }
}
