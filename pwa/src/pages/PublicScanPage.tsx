import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBarcode } from '../hooks/useBarcode'
import { useNfc } from '../hooks/useNfc'
import { PawPrint, Camera, LogIn, ShieldCheck, Syringe, Pill, FileText, Radio, ChevronDown, ChevronUp } from 'lucide-react'
import axios from 'axios'

type Phase = 'scan' | 'result' | 'notfound'

export default function PublicScanPage() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [phase, setPhase] = useState<Phase>('scan')
  const [animal, setAnimal] = useState<any>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [nfcError, setNfcError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [scanMode, setScanMode] = useState<'barcode' | 'nfc' | null>(null)
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null)

  const handleTag = useCallback(async (rawTagId: string) => {
    setLoading(true)
    let tagId = rawTagId.trim()
    try {
      const url = new URL(tagId)
      const parts = url.pathname.split('/')
      tagId = parts[parts.length - 1]
    } catch { /* keine URL */ }

    try {
      const res = await axios.get(`/api/public/tag/${encodeURIComponent(tagId)}`)
      setAnimal(res.data)
      setPhase('result')
      stopBarcode()
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (!status || status === 404) {
        setPhase('notfound')
      } else {
        setCameraError(`Error: ${status || 'Network error'}`)
      }
      stopBarcode()
    } finally {
      setLoading(false)
    }
  }, [])

  const handleBarcode = useCallback((code: string) => handleTag(code), [handleTag])
  const { start: startBarcode, stop: stopBarcode } = useBarcode('public-barcode-reader', handleBarcode, setCameraError)

  const handleNfc = useCallback((tagId: string) => handleTag(tagId), [handleTag])
  const { start: startNfc, stop: stopNfc } = useNfc(handleNfc, setNfcError)

  // Start selected scanner and stop others
  useEffect(() => {
    if (phase === 'scan' && scanMode === 'barcode') {
      stopNfc?.()
      startBarcode()
    } else if (phase === 'scan' && scanMode === 'nfc') {
      stopBarcode()
      startNfc()
    }
  }, [phase, scanMode, startBarcode, startNfc, stopBarcode, stopNfc])

  const speciesEmoji: Record<string, string> = { dog: '🐶', cat: '🐱', other: '🐾' }

  if (phase === 'result' && animal) {
    // Wenn Tier existiert aber nicht öffentlich freigegeben
    if (!animal.is_public) {
      return (
        <div className="container page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
          <div className="card animate-slide-up" style={{ textAlign: 'center', padding: 'var(--space-8)', maxWidth: 480 }}>
            <div style={{ fontSize: '2rem', marginBottom: 'var(--space-4)' }}>🔒</div>
            <h2 style={{ marginBottom: 'var(--space-2)' }}>{animal.name}</h2>
            <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>
              {t('publicScan.noPublic')}
            </p>
            <button className="btn btn-primary btn-full" onClick={() => navigate('/login')}>
              <LogIn size={16} /> {t('auth.login')}
            </button>
            <button className="btn btn-ghost btn-full" style={{ marginTop: 'var(--space-2)' }} onClick={() => { setPhase('scan'); setAnimal(null) }}>
              {t('scan.backToSelection')}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="container page" style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="card animate-slide-up" style={{ padding: 'var(--space-6)' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 80, height: 80, borderRadius: '50%',
              background: 'var(--primary-50)', fontSize: '2.5rem',
              marginBottom: 'var(--space-3)'
            }}>
              {speciesEmoji[animal.species] ?? '🐾'}
            </div>
            <h1 style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-xl)' }}>{animal.name}</h1>
            <p className="text-muted" style={{ margin: 0 }}>
              {animal.species} {animal.breed ? `· ${animal.breed}` : ''} {animal.birthdate ? `· ${t('publicScan.born')} ${animal.birthdate}` : ''}
            </p>
          </div>

          {/* Readonly-Hinweis */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: 'var(--space-3)', background: 'var(--success-50)',
            borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)',
            border: '1px solid var(--success-200)'
          }}>
            <ShieldCheck size={18} color="var(--success-600)" />
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--success-800)' }}>
              {t('publicScan.publicProfile')}
            </span>
          </div>

          {/* Kontakt */}
          {animal.contact && (
            <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--surface)', borderRadius: 'var(--radius-md)' }}>
              <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)', marginBottom: 4 }}>{t('publicScan.contact')}</div>
              <div style={{ fontWeight: 600 }}>{animal.contact.name}</div>
            </div>
          )}

          {/* Dokumente – gruppiert nach Typ */}
          {animal.documents && animal.documents.length > 0 ? (() => {
            const groups: Record<string, { icon: React.ReactNode; label: string; docs: any[] }> = {
              vaccination: { icon: <Syringe size={18} />, label: t('animal.vaccinations'), docs: [] },
              medication:  { icon: <Pill size={18} />,    label: t('animal.medications'),  docs: [] },
              other:       { icon: <FileText size={18} />, label: t('animal.documents'),   docs: [] },
            }
            for (const doc of animal.documents) {
              if (groups[doc.doc_type]) groups[doc.doc_type].docs.push(doc)
              else groups.other.docs.push(doc)
            }
            return (
              <>
                {Object.entries(groups).map(([type, { icon, label, docs }]) =>
                  docs.length > 0 && (
                    <div key={type} style={{ marginBottom: 'var(--space-4)' }}>
                      <h3 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        {icon} {label} ({docs.length})
                      </h3>
                      {docs.map((doc: any) => {
                        const isExpanded = expandedDocId === doc.id;
                        return (
                          <div key={doc.id} className="card card-sm" style={{ marginBottom: 'var(--space-2)', cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                                  {doc.extracted_json?.title || (type === 'vaccination' ? t('animal.docTypeVaccination') : type === 'medication' ? t('animal.docTypeMedication') : t('animal.docTypeOther'))}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <span className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                                  {new Date(doc.created_at).toLocaleDateString(i18n.language === 'de' ? 'de-AT' : 'en-GB')}
                                </span>
                                {isExpanded ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
                              </div>
                            </div>
                            
                            {isExpanded && (
                              <div className="animate-slide-up" style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border)' }}>
                                {doc.extracted_json?.summary && (
                                  <div style={{ background: 'var(--primary-50)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-3)', borderLeft: '3px solid var(--primary-500)' }}>
                                    <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--primary-900)' }}>{doc.extracted_json.summary}</p>
                                  </div>
                                )}
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
            <div style={{
              padding: 'var(--space-4)', background: 'var(--surface)',
              borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)',
              textAlign: 'center'
            }}>
              <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
                {t('publicScan.noDocuments')}
              </p>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <button className="btn btn-primary" onClick={() => navigate('/login')}>
              <LogIn size={18} /> {t('publicScan.loginMore')}
            </button>
            <button className="btn btn-ghost" onClick={() => { setPhase('scan'); setAnimal(null) }}>
              {t('publicScan.rescan')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'notfound') {
    return (
      <div className="container page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <div className="card animate-slide-up" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>❓</div>
          <h2 style={{ marginBottom: 'var(--space-2)' }}>{t('publicScan.notFound')}</h2>
          <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>
            {t('publicScan.notFoundDesc')}
          </p>
          <button className="btn btn-ghost" onClick={() => setPhase('scan')}>{t('scan.backToSelection')}</button>
          <button className="btn btn-primary" style={{ marginTop: 'var(--space-2)' }} onClick={() => navigate('/login')}>
            <LogIn size={16} /> {t('publicScan.loginRegister')}
          </button>
        </div>
      </div>
    )
  }

  // Scan-Phase
  return (
    <div className="container page" style={{ maxWidth: 480, margin: '0 auto' }}>
      {scanMode === null ? (
        // Auswahl-Phase
        <>
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)', paddingTop: 'var(--space-4)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: 'var(--primary-50)', marginBottom: 'var(--space-4)' }}>
              <PawPrint size={32} color="var(--primary-500)" />
            </div>
            <h1 style={{ margin: '0 0 4px 0', fontSize: 'var(--font-size-xl)' }}>{t('publicScan.title')}</h1>
            <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
              {t('publicScan.chooseMethod')}
            </p>
          </div>

          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <button
              className="btn btn-primary btn-full"
              onClick={() => setScanMode('barcode')}
              style={{ padding: 'var(--space-4)', fontSize: 'var(--font-size-base)', fontWeight: 600 }}
            >
              <Camera size={20} /> {t('scan.barcode')}
            </button>
            {('NDEFReader' in window) && (
              <button
                className="btn btn-outline btn-full"
                onClick={() => setScanMode('nfc')}
                style={{ padding: 'var(--space-4)', fontSize: 'var(--font-size-base)', fontWeight: 600 }}
              >
                <Radio size={20} /> {t('scan.nfc')}
              </button>
            )}
            <button className="btn btn-ghost btn-full" onClick={() => navigate('/login')} style={{ marginTop: 'var(--space-2)' }}>
              <LogIn size={18} /> {t('auth.login')}
            </button>
          </div>
        </>
      ) : (
        // Scanner aktiv
        <>
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)', paddingTop: 'var(--space-4)' }}>
            <h1 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>
              {scanMode === 'barcode' ? t('scan.barcodeActive') : t('scan.nfcActive')}
            </h1>
          </div>

          {(cameraError || nfcError) && (
            <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}>
              <p>{cameraError || nfcError}</p>
            </div>
          )}

          {scanMode === 'barcode' && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <div
                id="public-barcode-reader"
                style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', minHeight: 240, background: 'var(--surface)' }}
              />
            </div>
          )}

          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
                <div className="spinner" />
              </div>
            ) : (
              <>
                <button
                  className="btn btn-ghost btn-full"
                  onClick={() => {
                    stopBarcode()
                    stopNfc?.()
                    setScanMode(null)
                    setCameraError(null)
                    setNfcError(null)
                  }}
                >
                  {t('scan.backToSelection')}
                </button>
                <button className="btn btn-ghost btn-full" onClick={() => navigate('/login')}>
                  <LogIn size={18} /> {t('auth.login')}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
