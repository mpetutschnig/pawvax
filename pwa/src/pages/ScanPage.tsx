import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBarcode } from '../hooks/useBarcode'
import { useNfc } from '../hooks/useNfc'
import { getAnimalByTag, createAnimal } from '../api/rest'

type Mode = 'choose' | 'barcode' | 'nfc' | 'manual' | 'new-animal'

export default function ScanPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('choose')
  const [manualId, setManualId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [unknownTag, setUnknownTag] = useState<{ id: string; type: 'barcode' | 'nfc' } | null>(null)
  const [newAnimal, setNewAnimal] = useState({ name: '', species: 'dog' as 'dog' | 'cat' | 'other', breed: '' })
  const [cameraError, setCameraError] = useState<string | null>(null)

  const handleTag = useCallback(async (tagId: string, tagType: 'barcode' | 'nfc') => {
    setError(null)
    setLoading(true)
    try {
      const res = await getAnimalByTag(tagId)
      navigate(`/animals/${res.data.id}`)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) {
        setUnknownTag({ id: tagId, type: tagType })
        setMode('new-animal')
      } else {
        setError('Fehler beim Suchen des Tieres')
      }
    } finally {
      setLoading(false)
    }
  }, [navigate])

  const handleBarcode = useCallback((code: string) => handleTag(code, 'barcode'), [handleTag])
  const { start: startBarcode, stop: stopBarcode } = useBarcode('barcode-reader', handleBarcode, setCameraError)
  const { state: nfcState, error: nfcError, start: startNfc } = useNfc((id) => handleTag(id, 'nfc'))

  useEffect(() => {
    if (mode === 'barcode') {
      setCameraError(null)
      startBarcode()
    }
    return () => { if (mode === 'barcode') stopBarcode() }
  }, [mode, startBarcode, stopBarcode])

  async function handleCreateAnimal(e: React.FormEvent) {
    e.preventDefault()
    if (!unknownTag) return
    setLoading(true)
    try {
      const res = await createAnimal({
        ...newAnimal,
        tagId: unknownTag.id,
        tagType: unknownTag.type
      })
      navigate(`/animals/${res.data.id}`)
    } catch {
      setError('Tier konnte nicht angelegt werden')
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  if (mode === 'new-animal') {
    return (
      <div className="container">
        <div className="nav-bar"><h2>Neues Tier</h2></div>
        <div className="card">
          <p className="muted" style={{ marginBottom: '1rem' }}>
            Tag <strong>{unknownTag?.id}</strong> ist noch keinem Tier zugeordnet.
          </p>
          <form onSubmit={handleCreateAnimal}>
            <label>Name des Tieres</label>
            <input value={newAnimal.name} onChange={e => setNewAnimal(p => ({ ...p, name: e.target.value }))} required />
            <label>Tierart</label>
            <select value={newAnimal.species} onChange={e => setNewAnimal(p => ({ ...p, species: e.target.value as 'dog' | 'cat' | 'other' }))}>
              <option value="dog">Hund</option>
              <option value="cat">Katze</option>
              <option value="other">Sonstiges</option>
            </select>
            <label>Rasse (optional)</label>
            <input value={newAnimal.breed} onChange={e => setNewAnimal(p => ({ ...p, breed: e.target.value }))} />
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary" type="submit" disabled={loading}>Tier anlegen</button>
            <button className="btn btn-outline" type="button" style={{ marginTop: '.5rem' }} onClick={() => { setMode('choose'); setUnknownTag(null) }}>Abbrechen</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="nav-bar">
        <h2>🐾 PAW</h2>
        <button className="btn btn-outline" style={{ width: 'auto', padding: '.4rem .8rem', fontSize: '.875rem' }} onClick={logout}>Logout</button>
      </div>

      {mode === 'choose' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', marginTop: '1rem' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <p className="muted" style={{ marginBottom: '1rem' }}>Tier per Barcode oder NFC scannen</p>
            <button className="btn btn-primary" onClick={() => setMode('barcode')}>📷 Barcode scannen</button>
            <button className="btn btn-outline" style={{ marginTop: '.5rem' }} onClick={() => { setMode('nfc'); startNfc() }}>📡 NFC lesen</button>
            <button className="btn btn-outline" style={{ marginTop: '.5rem' }} onClick={() => setMode('manual')}>⌨️ ID manuell eingeben</button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {mode === 'barcode' && (
        <div className="card">
          <h2>Barcode scannen</h2>
          {cameraError && (
            <div className="error" style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#fee2e2', borderRadius: '0.5rem' }}>
              <p style={{ color: '#dc2626', marginBottom: '0.5rem' }}>{cameraError}</p>
              <p className="muted" style={{ fontSize: '0.875rem' }}>Tipp: Kamera funktioniert nur auf HTTPS oder localhost. Alternativ: Android-App verwenden oder manuell eingeben.</p>
            </div>
          )}
          <div id="barcode-reader" style={{ width: '100%' }} />
          {loading && <p className="muted">Suche Tier...</p>}
          <button className="btn btn-outline" style={{ marginTop: '1rem' }} onClick={() => { stopBarcode(); setMode('choose') }}>Abbrechen</button>
        </div>
      )}

      {mode === 'nfc' && (
        <div className="card" style={{ textAlign: 'center' }}>
          <h2>NFC lesen</h2>
          {nfcState === 'unsupported' ? (
            <p className="error">NFC wird in diesem Browser nicht unterstützt.</p>
          ) : (
            <p className="muted">📡 Halte das Gerät an den NFC-Tag...</p>
          )}
          {nfcError && <p className="error">{nfcError}</p>}
          {loading && <p className="muted">Suche Tier...</p>}
          <button className="btn btn-outline" style={{ marginTop: '1rem' }} onClick={() => setMode('choose')}>Abbrechen</button>
        </div>
      )}

      {mode === 'manual' && (
        <div className="card">
          <h2>ID eingeben</h2>
          <label>Tag-ID</label>
          <input value={manualId} onChange={e => setManualId(e.target.value)} placeholder="z.B. ABC123..." />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" disabled={!manualId || loading} onClick={() => handleTag(manualId, 'barcode')}>
            {loading ? 'Suche...' : 'Suchen'}
          </button>
          <button className="btn btn-outline" style={{ marginTop: '.5rem' }} onClick={() => setMode('choose')}>Abbrechen</button>
        </div>
      )}
    </div>
  )
}
