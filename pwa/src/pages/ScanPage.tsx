import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBarcode } from '../hooks/useBarcode'
import { useNfc } from '../hooks/useNfc'
import { getAnimalByTag, createAnimal } from '../api/rest'
import { PageHeader } from '../components/PageHeader'
import { Camera, Radio, Keyboard, AlertCircle, ShieldCheck, Syringe, Pill, FileText, ChevronUp, ChevronDown } from 'lucide-react'

type Mode = 'choose' | 'barcode' | 'nfc' | 'manual' | 'new-animal' | 'shared-result'

export default function ScanPage() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [mode, setMode] = useState<Mode>('choose')
  const [manualId, setManualId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [unknownTag, setUnknownTag] = useState<{ id: string; type: 'barcode' | 'nfc' } | null>(null)
  const [newAnimal, setNewAnimal] = useState({ name: '', species: 'dog' as 'dog' | 'cat' | 'other', breed: '' })
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [sharedAnimal, setSharedAnimal] = useState<any>(null)
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null)
  const speciesEmoji: Record<string, string> = { dog: '🐶', cat: '🐱', other: '🐾' }

  const handleTag = useCallback(async (rawTagId: string, tagType: 'barcode' | 'nfc') => {
    setError(null)
    setLoading(true)
    
    let tagId = rawTagId.trim()
    try {
      const url = new URL(tagId)
      const parts = url.pathname.split('/')
      tagId = parts[parts.length - 1]
    } catch {
      // Ist keine URL, bleibt unverändert
    }

    try {
      const res = await getAnimalByTag(tagId)
      if (res.data.is_owner) {
        navigate(`/animals/${res.data.id}`)
      } else {
        setSharedAnimal(res.data)
        setMode('shared-result')
        stopBarcode()
        if (tagType === 'nfc') stopNfc?.()
      }
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
      setError(t('animals.createError'))
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
                width: 24, height: 24,
                borderColor: 'var(--accent-400)',
                borderStyle: 'solid',
                ...(pos === 'tl' ? { top: 16, left: 16, borderWidth: '3px 0 0 3px', borderRadius: '4px 0 0 0' } : {}),
                ...(pos === 'tr' ? { top: 16, right: 16, borderWidth: '3px 3px 0 0', borderRadius: '0 4px 0 0' } : {}),
                ...(pos === 'bl' ? { bottom: 16, left: 16, borderWidth: '0 0 3px 3px', borderRadius: '0 0 0 4px' } : {}),
                ...(pos === 'br' ? { bottom: 16, right: 16, borderWidth: '0 3px 3px 0', borderRadius: '0 0 4px 0' } : {}),
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
            <p className="text-danger" style={{ marginBottom: 'var(--space-4)' }}>{t('publicScan.notFound')}</p>
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

      {mode === 'shared-result' && sharedAnimal && (
        <div className="card animate-slide-up" style={{ padding: 'var(--space-6)' }}>
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 80, height: 80, borderRadius: '50%', background: 'var(--primary-50)', fontSize: '2.5rem', marginBottom: 'var(--space-3)' }}>
              {speciesEmoji[sharedAnimal.species] ?? '🐾'}
            </div>
            <h1 style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-xl)' }}>{sharedAnimal.name}</h1>
            <p className="text-muted" style={{ margin: 0 }}>
              {sharedAnimal.species} {sharedAnimal.breed ? `· ${sharedAnimal.breed}` : ''} {sharedAnimal.birthdate ? `· ${t('publicScan.born')} ${sharedAnimal.birthdate}` : ''}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)', background: 'var(--info-50)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', border: '1px solid var(--info-200)' }}>
            <ShieldCheck size={18} color="var(--info-600)" />
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--info-800)' }}>
              {t('scan.sharedAccess')}: <strong style={{ textTransform: 'capitalize' }}>{sharedAnimal.request_role}</strong>
            </span>
          </div>

          {sharedAnimal.contact && (
            <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--surface)', borderRadius: 'var(--radius-md)' }}>
              <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 4 }}>{t('publicScan.contact')}</div>
              <div style={{ fontWeight: 600 }}>{sharedAnimal.contact.name}</div>
            </div>
          )}

          {sharedAnimal.documents && sharedAnimal.documents.length > 0 ? (() => {
            const groups: Record<string, { icon: React.ReactNode; label: string; docs: any[] }> = {
              vaccination: { icon: <Syringe size={18} />, label: t('animal.vaccinations'), docs: [] },
              medication:  { icon: <Pill size={18} />,    label: t('animal.medications'),  docs: [] },
              other:       { icon: <FileText size={18} />, label: t('animal.documents'),   docs: [] },
            }
            for (const doc of sharedAnimal.documents) {
              if (groups[doc.doc_type]) groups[doc.doc_type].docs.push(doc)
              else groups.other.docs.push(doc)
            }
            return (
              <>
                {Object.entries(groups).map(([type, { icon, label, docs }]) =>
                  docs.length > 0 && (
                    <div key={type} style={{ marginBottom: 'var(--space-4)' }}>
                      <h3 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>{icon} {label} ({docs.length})</h3>
                      {docs.map((doc: any) => {
                        const isExpanded = expandedDocId === doc.id;
                        return (
                          <div key={doc.id} className="card card-sm" style={{ marginBottom: 'var(--space-2)', cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                                  {type === 'vaccination' ? t('animal.docTypeVaccination') : type === 'medication' ? t('animal.docTypeMedication') : t('animal.docTypeOther')}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <span className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{new Date(doc.created_at).toLocaleDateString(i18n.language === 'de' ? 'de-AT' : 'en-GB')}</span>
                                {isExpanded ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="animate-slide-up" style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border)' }}>
                                {doc.extracted_json?.summary && <div style={{ background: 'var(--primary-50)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)', borderLeft: '3px solid var(--primary-500)' }}><p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--primary-900)' }}>{doc.extracted_json.summary}</p></div>}
                                {[doc.image_path, ...(doc.pages || [])].filter(Boolean).map((imgPath: string, idx: number) => (
                                  <img key={idx} src={`/uploads/${imgPath.split('/').pop()}`} alt={`Page ${idx + 1}`} style={{ width: '100%', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-2)', display: 'block' }} />
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                )}
              </>
            )
          })() : (
            <div style={{ padding: 'var(--space-4)', background: 'var(--surface)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', textAlign: 'center' }}>
              <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>{t('publicScan.noDocuments')}</p>
            </div>
          )}
          <button className="btn btn-ghost btn-full" onClick={() => { setMode('choose'); setSharedAnimal(null) }}>{t('scan.backToSelection')}</button>
        </div>
      )}
    </div>
  )
}
