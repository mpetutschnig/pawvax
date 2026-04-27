import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAnimalTags, addTag, deactivateTag, activateTag } from '../api/rest'
import { useBarcode } from '../hooks/useBarcode'
import { useNfc } from '../hooks/useNfc'
import { PageHeader } from '../components/PageHeader'
import { ChevronLeft, Camera, Radio, Tag as TagIcon, CheckCircle, XCircle } from 'lucide-react'

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

  const { start: startBarcode, stop: stopBarcode } = useBarcode('tag-barcode', (code) => handleNewTag(code, 'barcode'), (msg) => setError(msg))
  const { state: nfcState, start: startNfc } = useNfc((id) => handleNewTag(id, 'nfc'), (msg) => setError(msg))

  // Start barcode scanner AFTER DOM element is rendered
  useEffect(() => {
    if (scanning === 'barcode') {
      // Delay slightly to ensure DOM is rendered
      const timer = setTimeout(() => startBarcode(), 100)
      return () => clearTimeout(timer)
    }
  }, [scanning, startBarcode])

  // Start NFC AFTER DOM element is rendered
  useEffect(() => {
    if (scanning === 'nfc') {
      const timer = setTimeout(() => startNfc(), 100)
      return () => clearTimeout(timer)
    }
  }, [scanning, startNfc])

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

  async function toggleTag(tag: Tag) {
    try {
      if (tag.active) await deactivateTag(tag.tag_id)
      else await activateTag(tag.tag_id)
      reload()
    } catch { setError('Status konnte nicht geändert werden') }
  }

  return (
    <div className="container page">
      <PageHeader title="Tags verwalten" backTo={`/animals/${id}`} showThemeToggle />

      {error && <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}><p>{error}</p></div>}

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <button className="btn btn-primary flex-1" onClick={() => setScanning('barcode')}>
          <Camera size={18} /> Barcode
        </button>
        <button className="btn btn-secondary flex-1" onClick={() => setScanning('nfc')}>
          <Radio size={18} /> NFC
        </button>
      </div>

      {scanning === 'barcode' && (
        <div className="card animate-slide-up" style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{
            position: 'relative',
            background: 'oklch(8% 0.02 250)',
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
            aspectRatio: '4/3',
            marginBottom: 'var(--space-4)',
          }}>
            <div id="tag-barcode" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <button className="btn btn-outline btn-full" onClick={() => { stopBarcode(); setScanning('none') }}>Abbrechen</button>
        </div>
      )}
      {scanning === 'nfc' && (
        <div className="card text-center animate-slide-up" style={{ padding: 'var(--space-8) var(--space-4)', marginBottom: 'var(--space-6)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-4)' }}>
            <Radio size={32} color="var(--primary-500)" />
          </div>
          {nfcState === 'unsupported'
            ? <p className="text-danger">NFC wird in diesem Browser nicht unterstützt.</p>
            : <p className="text-muted">Halte das Gerät an den NFC-Tag...</p>}
          <button className="btn btn-outline btn-full" style={{ marginTop: 'var(--space-6)' }} onClick={() => setScanning('none')}>Abbrechen</button>
        </div>
      )}

      {loading ? <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-6)' }}><div className="spinner"></div></div> : (
        <div className="animate-fade-in">
          <h3 style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--font-size-base)' }}>Registrierte Tags ({tags.length})</h3>
          {tags.length === 0 && (
            <div className="card text-center">
              <TagIcon size={32} color="var(--text-tertiary)" style={{ margin: '0 auto var(--space-3)' }} />
              <p className="text-muted">Noch keine Tags zugeordnet.</p>
            </div>
          )}
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {tags.map(tag => (
              <div key={tag.tag_id} className="card card-sm" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', wordBreak: 'break-all', margin: '0 0 2px 0' }}>{tag.tag_id}</p>
                  <p className="text-tertiary" style={{ fontSize: 'var(--font-size-xs)', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {tag.tag_type === 'nfc' ? <><Radio size={10} /> NFC</> : <><Camera size={10} /> Barcode</>}
                    <span style={{ margin: '0 4px' }}>•</span>
                    {new Date(tag.added_at).toLocaleDateString('de-AT')}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
                  {tag.active ? (
                    <span className="badge badge-success"><CheckCircle size={10} /> Aktiv</span>
                  ) : (
                    <span className="badge badge-warning"><XCircle size={10} /> Inaktiv</span>
                  )}
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-xs)', color: 'var(--primary-600)', fontWeight: 600, padding: 0 }}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag.active ? 'Deaktivieren' : 'Aktivieren'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
