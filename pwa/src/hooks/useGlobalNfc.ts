import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAnimalByTag } from '../api/rest'

export function useGlobalNfc() {
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token || !('NDEFReader' in window)) return

    let reader: any = null
    let listening = true

    const startListening = async () => {
      try {
        // @ts-expect-error — Web NFC API types not in lib
        reader = new window.NDEFReader()
        await reader.scan()

        reader.onreading = async (event: { serialNumber: string }) => {
          if (!listening) return

          const tagId = event.serialNumber.replace(/:/g, '').toUpperCase()

          try {
            const res = await getAnimalByTag(tagId)
            navigate(`/animals/${res.data.id}`)
          } catch {
            // Tag nicht registriert, ignorieren
          }
        }

        reader.onreadingerror = () => {
          // Fehler beim Lesen, ignorieren
        }
      } catch (err) {
        // NFC nicht verfügbar oder keine Berechtigung
      }
    }

    startListening()

    return () => {
      listening = false
      if (reader) {
        reader.abort?.()
      }
    }
  }, [navigate])
}
