import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAnimalTags, addTag, deactivateTag, activateTag } from '../api/rest'
import { useBarcode } from '../hooks/useBarcode'
import { useNfc } from '../hooks/useNfc'

interface Tag { tag_id: string; tag_type: string; active: number; added_at: string }

export default function TagManagementPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState<'none' | 'barcode' | 'nfc'>('none')
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    if (!id) return
    getAnimalTags(id).then(r => setTags(r.data)).finally(() => setLoading(false))
  }, [id])

  useEffect(() => { reload() }, [reload])

  const handleNewTag = useCallback(async (tagId: string, tagType: 'barcode' | 'nfc') => {
    if (!id) return
    setScanning('none')
    setError(null)
    try {
      await addTag(id, tagId, tagType)
      reload()
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      setError(status === 409 ? 'Tag ist bereits einem Tier zugeordnet' : 'Tag konnte nicht hinzugefügt werden')
    }
  }, [id, reload])

  const { start: startBarcode, stop: stopBarcode } = useBarcode('tag-barcode', (code) => handleNewTag(code, 'barcode'))
  const { state: nfcState, start: startNfc } = useNfc((id) => handleNewTag(id, 'nfc'))

  async function toggleTag(tag: Tag) {
    try {
      if (tag.active) await deactivateTag(tag.tag_id)
      else await activateTag(tag.tag_id)
      reload()
    } catch { setError('Status konnte nicht geändert werden') }
  }

  return (
    <div className="container">
      <div className="nav-bar">
        <button onClick={() => navigate(`/animals/${id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}>←</button>
        <h2>Tags verwalten</h2>
      </div>

      {error && <p className="error" style={{ marginBottom: '1rem' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { setScanning('barcode'); startBarcode() }}>
          📷 Barcode hinzufügen
        </button>
        <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setScanning('nfc'); startNfc() }}>
          📡 NFC hinzufügen
        </button>
      </div>

      {scanning === 'barcode' && (
        <div className="card">
          <div id="tag-barcode" style={{ width: '100%' }} />
          <button className="btn btn-outline" style={{ marginTop: '.5rem' }} onClick={() => { stopBarcode(); setScanning('none') }}>Abbrechen</button>
        </div>
      )}
      {scanning === 'nfc' && (
        <div className="card" style={{ textAlign: 'center' }}>
          {nfcState === 'unsupported'
            ? <p className="error">NFC nicht unterstützt</p>
            : <p className="muted">📡 Halte das Gerät an den NFC-Tag...</p>}
          <button className="btn btn-outline" style={{ marginTop: '.5rem' }} onClick={() => setScanning('none')}>Abbrechen</button>
        </div>
      )}

      {loading ? <p className="muted">Lade...</p> : (
        <>
          <h2>Registrierte Tags ({tags.length})</h2>
          {tags.length === 0 && <p className="muted">Noch keine Tags.</p>}
          {tags.map(tag => (
            <div key={tag.tag_id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 500, fontSize: '.9rem', wordBreak: 'break-all' }}>{tag.tag_id}</p>
                <p className="muted" style={{ fontSize: '.75rem' }}>
                  {tag.tag_type === 'nfc' ? '📡 NFC' : '📷 Barcode'} · {new Date(tag.added_at).toLocaleDateString('de-AT')}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', alignItems: 'flex-end' }}>
                <span className={`badge ${tag.active ? 'badge-active' : 'badge-inactive'}`}>
                  {tag.active ? 'Aktiv' : 'Inaktiv'}
                </span>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.75rem', color: 'var(--muted)' }}
                  onClick={() => toggleTag(tag)}
                >
                  {tag.active ? 'Deaktivieren' : 'Aktivieren'}
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
