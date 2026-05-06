import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBarcode } from '../hooks/useBarcode'
import { useNfc } from '../hooks/useNfc'
import { PawPrint, Camera, LogIn, ShieldCheck, Syringe, Pill, FileText, Radio, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../api/rest'
import { addRecentlyViewedAnimal } from '../hooks/useRecentlyViewed'

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
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null)

  // Determine caller's effective role from token
  const effectiveRole = (() => {
    const token = localStorage.getItem('token')
    if (!token) return 'guest'
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const roles = (payload.role || '').split(',').map((r: string) => r.trim())
      if (roles.includes('vet')) return 'vet'
      if (roles.includes('authority')) return 'authority'
    } catch { /* */ }
    return 'guest'
  })()

  function canSeeRecord(doc: any, recordKey: string): boolean {
    const perRecord = doc.record_permissions?.[recordKey]
    const roles = perRecord ?? ((() => { try { return JSON.parse(doc.allowed_roles || '[]') } catch { return ['vet', 'authority', 'guest'] } })())
    return roles.includes(effectiveRole) || roles.includes('guest')
  }

  const handleTag = useCallback(async (rawTagId: string) => {
    setLoading(true)
    let tagId = rawTagId.trim()
    try {
      const url = new URL(tagId)
      if (url.searchParams.has('tag')) {
        tagId = url.searchParams.get('tag') || tagId
      } else {
        const parts = url.pathname.split('/').filter(Boolean)
        if (parts.length > 0) tagId = parts[parts.length - 1]
      }
    } catch {
      // Keine URL, bleibt unverändert
    }

    try {
      const res = await api.get(`/public/tag/${encodeURIComponent(tagId)}`)
      if (localStorage.getItem('token') && res.data?.id) {
        addRecentlyViewedAnimal({
          id: res.data.id,
          name: res.data.name || 'Unknown',
          species: res.data.species,
          breed: res.data.breed,
          source: 'scan'
        })
      }
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
            padding: 'var(--space-3)', background: 'var(--success-100)',
            borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)',
            border: '1px solid var(--success-300)'
          }}>
            <ShieldCheck size={18} color="var(--success-700)" />
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--success-900)', fontWeight: 500 }}>
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

          {/* Dokumente – Impfungen & Behandlungen als ausklappbare Record-Listen */}
          {animal.documents && animal.documents.length > 0 ? (() => {
            // Vaccination records
            const vaccinationRecords: any[] = []
            const treatmentRecords: any[] = []
            const otherDocs: any[] = []

            for (const doc of animal.documents) {
              if (doc.doc_type === 'vaccination') {
                const records = doc.extracted_json?.payload?.vaccinations || doc.extracted_json?.vaccinations || []
                records.forEach((r: any, i: number) => {
                  if (canSeeRecord(doc, `vaccinations.${i}`)) {
                    vaccinationRecords.push({ ...r, _docId: doc.id, _idx: i, _added_by_name: doc.added_by_name, _added_by_verified: doc.added_by_verified })
                  }
                })
              } else if (doc.doc_type === 'treatment') {
                const records = doc.extracted_json?.payload?.treatments || doc.extracted_json?.treatments || []
                records.forEach((r: any, i: number) => {
                  if (canSeeRecord(doc, `treatments.${i}`)) {
                    treatmentRecords.push({ ...r, _docId: doc.id, _idx: i, _added_by_name: doc.added_by_name, _added_by_verified: doc.added_by_verified })
                  }
                })
              } else {
                otherDocs.push(doc)
              }
            }

            return (
              <>
                {vaccinationRecords.length > 0 && (
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <h3 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Syringe size={18} /> {t('animal.vaccinations')} ({vaccinationRecords.length})
                    </h3>
                    {vaccinationRecords.map((r: any) => {
                      const recId = `vax-${r._docId}-${r._idx}`
                      const isExp = expandedRecordId === recId
                      const name = r.vaccine || r.vaccine_name || t('animal.docTypeVaccination')
                      const date = r.administration_date || r.date || ''
                      return (
                        <div key={recId} className="card card-sm" style={{ marginBottom: 'var(--space-2)', cursor: 'pointer' }} onClick={() => setExpandedRecordId(isExp ? null : recId)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{name}</span>
                              {date && <span className="text-muted" style={{ fontSize: 'var(--font-size-xs)', marginLeft: 8 }}>{date}</span>}
                            </div>
                            {isExp ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
                          </div>
                          {isExp && (
                            <div className="animate-slide-up" style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
                              {r.target_disease && <div><span style={{ color: 'var(--text-tertiary)' }}>Zielkrankheit</span><br /><strong>{r.target_disease}</strong></div>}
                              {r.valid_until && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('vaccine.validUntil')}</span><br /><strong>{r.valid_until}</strong></div>}
                              {r.batch_number && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('vaccine.batchNumber')}</span><br /><strong>{r.batch_number}</strong></div>}
                              {r.manufacturer && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('vaccine.manufacturer')}</span><br /><strong>{r.manufacturer}</strong></div>}
                              {r.veterinarian_name && <div><span style={{ color: 'var(--text-tertiary)' }}>{t('vaccine.vetName')}</span><br /><strong>{r.veterinarian_name}</strong></div>}
                              {r._added_by_verified && r._added_by_name && (
                                <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                  <ShieldCheck size={13} color="var(--primary-600)" />
                                  <span style={{ color: 'var(--primary-700)', fontWeight: 500 }}>{r._added_by_name}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {treatmentRecords.length > 0 && (
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <h3 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Pill size={18} /> Behandlungen ({treatmentRecords.length})
                    </h3>
                    {treatmentRecords.map((r: any) => {
                      const recId = `treat-${r._docId}-${r._idx}`
                      const isExp = expandedRecordId === recId
                      const name = r.substance || r.medication || 'Behandlung'
                      const date = r.administered_at || r.date || ''
                      return (
                        <div key={recId} className="card card-sm" style={{ marginBottom: 'var(--space-2)', cursor: 'pointer' }} onClick={() => setExpandedRecordId(isExp ? null : recId)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{name}</span>
                              {date && <span className="text-muted" style={{ fontSize: 'var(--font-size-xs)', marginLeft: 8 }}>{date}</span>}
                            </div>
                            {isExp ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
                          </div>
                          {isExp && (
                            <div className="animate-slide-up" style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
                              {r.dosage && <div><span style={{ color: 'var(--text-tertiary)' }}>Dosierung</span><br /><strong>{r.dosage}</strong></div>}
                              {r.vet_name && <div><span style={{ color: 'var(--text-tertiary)' }}>Tierarzt</span><br /><strong>{r.vet_name}</strong></div>}
                              {r.next_due && <div><span style={{ color: 'var(--text-tertiary)' }}>Nächste Fälligkeit</span><br /><strong>{r.next_due}</strong></div>}
                              {r.notes && <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--text-tertiary)' }}>Notizen</span><br /><strong>{r.notes}</strong></div>}
                              {r._added_by_verified && r._added_by_name && (
                                <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                  <ShieldCheck size={13} color="var(--primary-600)" />
                                  <span style={{ color: 'var(--primary-700)', fontWeight: 500 }}>{r._added_by_name}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {otherDocs.length > 0 && (
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <h3 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <FileText size={18} /> {t('animal.documents')} ({otherDocs.length})
                    </h3>
                    {otherDocs.map((doc: any) => {
                      const isExpanded = expandedDocId === doc.id
                      const extracted = doc.extracted_json || {}
                      const typeDetails: string[] = []
                      switch(doc.doc_type) {
                        case 'pet_passport':
                          if (extracted.passport_number) typeDetails.push(`Pass-Nr: ${extracted.passport_number}`)
                          if (extracted.identification?.chip_code) typeDetails.push(`Chip: ${extracted.identification.chip_code}`)
                          if (extracted.section_type) typeDetails.push(extracted.section_type)
                          break
                        case 'medical_product':
                          if (extracted.active_ingredient) typeDetails.push(extracted.active_ingredient)
                          if (extracted.dosage) typeDetails.push(`Dosierung: ${extracted.dosage}`)
                          break
                        case 'pedigree':
                          if (extracted.registration_number) typeDetails.push(`Reg-Nr: ${extracted.registration_number}`)
                          break
                        case 'dog_certificate':
                          if (extracted.result) typeDetails.push(`Ergebnis: ${extracted.result}`)
                          if (extracted.exam_date) typeDetails.push(`Datum: ${extracted.exam_date}`)
                          break
                        default:
                          if (extracted.summary) typeDetails.push(extracted.summary)
                      }
                      return (
                        <div key={doc.id} className="card card-sm" style={{ marginBottom: 'var(--space-2)', cursor: 'pointer' }} onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{extracted.title || doc.doc_type}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                              <span className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{new Date(doc.created_at).toLocaleDateString(i18n.language === 'de' ? 'de-AT' : 'en-GB')}</span>
                              {isExpanded ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
                            </div>
                          </div>
                          {isExpanded && typeDetails.length > 0 && (
                            <div className="animate-slide-up" style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
                              {typeDetails.map((detail, idx) => (
                                <div key={idx}><strong>{detail}</strong></div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
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
                style={{
                  position: 'relative',
                  background: 'oklch(8% 0.02 250)',
                  borderRadius: 'var(--radius-xl)',
                  overflow: 'hidden',
                  aspectRatio: '4/3',
                  minHeight: 280,
                  width: '100%'
                }}
              >
                <div id="public-barcode-reader" style={{ width: '100%', height: '100%' }} />
              </div>
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
