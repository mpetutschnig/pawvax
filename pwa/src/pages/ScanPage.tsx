import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBarcode } from '../hooks/useBarcode'
import { useNfc } from '../hooks/useNfc'
import { getAnimalByTag, createAnimal, trackAnimalScan } from '../api/rest'
import { PageHeader } from '../components/PageHeader'
import { Camera, Radio, Keyboard, AlertCircle } from 'lucide-react'

type Mode = 'choose' | 'barcode' | 'nfc' | 'manual' | 'new-animal'

export default function ScanPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('choose')
  const [manualId, setManualId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [unknownTag, setUnknownTag] = useState<{ id: string; type: 'barcode' | 'nfc' } | null>(null)
  const [newAnimal, setNewAnimal] = useState({ name: '', species: 'dog' as 'dog' | 'cat' | 'other', breed: '' })
  const [cameraError, setCameraError] = useState<string | null>(null)

  const handleTag = useCallback(async (rawTagId: string, tagType: 'barcode' | 'nfc') => {
    setError(null)
    setLoading(true)
    
    let tagId = rawTagId.trim()
    try {
      const lower = tagId.toLowerCase()
      if (lower.startsWith('http://') || lower.startsWith('https://')) {
        const url = new URL(tagId)
        if (url.searchParams.has('tag')) {
          tagId = url.searchParams.get('tag') || tagId
        } else {
          const parts = url.pathname.split('/').filter(Boolean)
          if (parts.length > 0) tagId = parts[parts.length - 1]
        }
      }
    } catch {
      // Keine URL, bleibt unverändert
    }

    try {
      const res = await getAnimalByTag(tagId)
      trackAnimalScan(res.data.id).catch(() => {})
      navigate(`/animals/${res.data.id}`)
      stopBarcode()
      if (tagType === 'nfc') stopNfc?.()
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) {
        setUnknownTag({ id: tagId, type: tagType })
        setMode('new-animal')
      } else if (status === 403) {
        setError(t('common.noAccess'))
      } else {
        setError(t('common.error'))
      }
    } finally {
      setLoading(false)
    }
  }, [navigate])

  const handleBarcode = useCallback((code: string) => handleTag(code, 'barcode'), [handleTag])
  const { start: startBarcode, stop: stopBarcode } = useBarcode('barcode-reader', handleBarcode, setCameraError)
  const { state: nfcState, error: nfcError, start: startNfc, stop: stopNfc } = useNfc((id) => handleTag(id, 'nfc'))

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
      trackAnimalScan(res.data.id).catch(() => {})
      navigate(`/animals/${res.data.id}`)
    } catch (err: any) {
      if (err.response?.status === 409 && err.response?.data?.conflict?.animalId) {
        const conflictId = err.response.data.conflict.animalId
        // Tag is already assigned, navigate to the existing animal's page instead of showing an error.
        trackAnimalScan(conflictId).catch(() => {})
        navigate(`/animals/${conflictId}`)
      } else {
        setError(t('animals.createError'))
      }
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'new-animal') {
    return (
      <div className="container page">
        <PageHeader title={t('animals.createNew')} showThemeToggle />
        <div className="card animate-slide-up">
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>❓</div>
            <h2 style={{ marginBottom: 'var(--space-2)' }}>{t('scan.unknownTag')}</h2>
            <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>Tag <strong style={{ color: 'var(--text-primary)' }}>{unknownTag?.id}</strong><br/>{t('scan.unknownTagDesc')}</p>
          </div>
          <form onSubmit={handleCreateAnimal}>
            <div className="form-group">
              <label className="form-label">{t('animals.name')}</label>
              <input className="form-input" value={newAnimal.name} onChange={e => setNewAnimal(p => ({ ...p, name: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">{t('animals.species')}</label>
              <select className="form-select" value={newAnimal.species} onChange={e => setNewAnimal(p => ({ ...p, species: e.target.value as 'dog' | 'cat' | 'other' }))}>
                <option value="dog">{t('animals.dog')}</option>
                <option value="cat">{t('animals.cat')}</option>
                <option value="other">{t('animals.other')}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('animals.breed')} ({t('animals.optional')})</label>
              <input className="form-input" value={newAnimal.breed} onChange={e => setNewAnimal(p => ({ ...p, breed: e.target.value }))} />
            </div>

            {error && <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}><p>{error}</p></div>}

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              <button className="btn btn-primary flex-1" type="submit" disabled={loading}>{loading ? t('app.loading') : t('animals.add')}</button>
              <button className="btn btn-ghost flex-1" type="button" onClick={() => { setMode('choose'); setUnknownTag(null) }}>{t('common.cancel')}</button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="container page">
      <PageHeader title={t('scan.title')} showThemeToggle showLogout />

      {mode === 'choose' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div className="card text-center" style={{ padding: 'var(--space-8) var(--space-4)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-4)' }}>
              <Camera size={32} color="var(--primary-500)" />
            </div>
            <h3 style={{ marginBottom: 'var(--space-2)' }}>{t('scan.chooseMethod')}</h3>
            <p className="text-muted" style={{ marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-sm)' }}>
              {t('welcome.scanChipDesc')}
            </p>

            <button className="btn btn-primary btn-full" style={{ marginBottom: 'var(--space-3)' }} onClick={() => setMode('barcode')}>
              <Camera size={18} /> {t('scan.barcode')}
            </button>
            <button className="btn btn-secondary btn-full" style={{ marginBottom: 'var(--space-3)' }} onClick={() => { setMode('nfc'); startNfc() }}>
              <Radio size={18} /> {t('scan.nfc')}
            </button>
            <button className="btn btn-outline btn-full" onClick={() => setMode('manual')}>
              <Keyboard size={18} /> {t('chip.enterTag')}
            </button>
          </div>
          {error && <div className="error-card"><p>{error}</p></div>}
        </div>
      )}

      {mode === 'barcode' && (
        <div className="card animate-slide-up">
          <h2 style={{ marginBottom: 'var(--space-4)' }}>{t('scan.barcodeActive')}</h2>
          {cameraError && (
            <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
                <AlertCircle size={18} color="var(--danger-500)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <p style={{ margin: '0 0 var(--space-1) 0', fontWeight: 600 }}>{cameraError}</p>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-xs)' }}>{t('common.error')}: {t('scan.httpsRequired')}</p>
                </div>
              </div>
            </div>
          )}
          
          <div style={{
            position: 'relative',
            background: 'oklch(8% 0.02 250)',
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
            aspectRatio: '4/3',
            marginBottom: 'var(--space-4)',
          }}>
            <div id="barcode-reader" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            
            {/* Corner markers */}
            {['tl','tr','bl','br'].map(pos => (
              <div key={pos} style={{
                position: 'absolute',
                width: 36, height: 36,
                borderColor: 'var(--success-400)',
                borderStyle: 'solid',
                ...(pos === 'tl' ? { top: 12, left: 12, borderWidth: '4px 0 0 4px', borderRadius: '6px 0 0 0' } : {}),
                ...(pos === 'tr' ? { top: 12, right: 12, borderWidth: '4px 4px 0 0', borderRadius: '0 6px 0 0' } : {}),
                ...(pos === 'bl' ? { bottom: 12, left: 12, borderWidth: '0 0 4px 4px', borderRadius: '0 0 0 6px' } : {}),
                ...(pos === 'br' ? { bottom: 12, right: 12, borderWidth: '0 4px 4px 0', borderRadius: '0 0 6px 0' } : {}),
              }} />
            ))}
            
            <div className="scan-line" />
          </div>

          {loading && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}><div className="spinner"></div></div>}
          <button className="btn btn-ghost btn-full" onClick={() => { stopBarcode(); setMode('choose') }}>{t('common.cancel')}</button>
        </div>
      )}

      {mode === 'nfc' && (
        <div className="card text-center animate-slide-up" style={{ padding: 'var(--space-8) var(--space-4)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-4)' }}>
            <Radio size={32} color="var(--primary-500)" />
          </div>
          <h2 style={{ marginBottom: 'var(--space-2)' }}>{t('scan.nfcActive')}</h2>
          {nfcState === 'unsupported' ? (
            <p className="text-danger" style={{ marginBottom: 'var(--space-4)' }}>{t('chip.nfcNotSupported')}</p>
          ) : (
            <p className="text-muted" style={{ marginBottom: 'var(--space-6)' }}>{t('chip.enterTag')}...</p>
          )}
          {nfcError && <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}><p>{nfcError}</p></div>}
          {loading && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}><div className="spinner"></div></div>}
          <button className="btn btn-ghost btn-full" onClick={() => setMode('choose')}>{t('common.cancel')}</button>
        </div>
      )}

      {mode === 'manual' && (
        <div className="card animate-slide-up">
          <h2 style={{ marginBottom: 'var(--space-4)' }}>{t('chip.enterTag')}</h2>
          <div className="form-group">
            <label className="form-label">Tag-ID</label>
            <input className="form-input" value={manualId} onChange={e => setManualId(e.target.value)} placeholder={t('chip.enterTagPlaceholder')} />
          </div>
          {error && <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}><p>{error}</p></div>}
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button className="btn btn-primary flex-1" disabled={!manualId || loading} onClick={() => handleTag(manualId, 'barcode')}>
              {loading ? t('common.loading') : t('common.search')}
            </button>
            <button className="btn btn-ghost flex-1" onClick={() => setMode('choose')}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
