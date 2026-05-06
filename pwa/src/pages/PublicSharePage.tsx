import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PawPrint, Calendar, User, MapPin, Syringe, Pill, FileText, ChevronUp, ChevronDown, ShieldCheck } from 'lucide-react'
import { api } from '../api/rest'
import { addRecentlyViewedAnimal } from '../hooks/useRecentlyViewed'

export default function PublicSharePage() {
  const { shareId } = useParams<{ shareId: string }>()
  const { t, i18n } = useTranslation()
  const [animal, setAnimal] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null)
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null)

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

  const docTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      vaccination: t('animal.docTypeVaccination'),
      medical_product: t('animal.docTypeMedicalProduct'),
      pedigree: t('animal.docTypePedigree'),
      dog_certificate: t('animal.docTypeDogCertificate'),
      general: t('animal.docTypeGeneral'),
      medication: t('animal.docTypeMedicalProduct'),
      other: t('animal.docTypeGeneral')
    }
    return labels[type] || type
  }

  useEffect(() => {
    if (!shareId) return
    api.get(`/public/share/${shareId}`)
      .then(res => {
        if (localStorage.getItem('token') && res.data?.id) {
          addRecentlyViewedAnimal({
            id: res.data.id,
            name: res.data.name || 'Unknown',
            species: res.data.species,
            breed: res.data.breed,
            source: 'share'
          })
        }
        setAnimal(res.data)
        setError(null)
      })
      .catch(async (err: any) => {
        const message = err.response?.data?.error || t('common.error')
        setError(message)
      })
      .finally(() => setLoading(false))
  }, [shareId, t])

  if (loading) {
    return (
      <div className="container page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <div className="spinner spinner-lg"></div>
      </div>
    )
  }

  if (error || !animal) {
    return (
      <div className="container page" style={{ paddingTop: '2rem' }}>
        <div className="error-card text-center" style={{ padding: 'var(--space-6)' }}>
          <h2 style={{ color: 'inherit' }}>{error || t('error.notFound')}</h2>
          <p style={{ color: 'inherit' }}>Die Freigabe existiert nicht oder ist abgelaufen.</p>
          <Link to="/login" className="btn btn-primary mt-4">Zur Anmeldung</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container page" style={{ paddingTop: '2rem' }}>
      <div className="card text-center animate-slide-up" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{
          width: 80, height: 80, borderRadius: 'var(--radius-full)',
          background: 'var(--primary-50)', margin: '0 auto var(--space-4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
        }}>
          {animal.avatar_path ? (
            <img src={`/uploads/${animal.avatar_path.split('/').pop()}`} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <PawPrint size={40} color="var(--primary-500)" />
          )}
        </div>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>{animal.name}</h1>
        <p className="text-muted" style={{ margin: 0, textTransform: 'capitalize' }}>
          {animal.species === 'dog' ? t('animals.dog') : animal.species === 'cat' ? t('animals.cat') : t('animals.other')}
          {animal.breed ? ` • ${animal.breed}` : ''}
        </p>
      </div>

      {(animal.contact || animal.address || animal.birthdate) && (
        <div className="card animate-fade-in" style={{ animationDelay: '100ms' }}>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>{t('animal.details')}</h3>
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {animal.birthdate && (
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                <Calendar size={18} className="text-tertiary" />
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{t('animal.birthdate')}</div>
                  <div style={{ fontWeight: 500 }}>{new Date(animal.birthdate).toLocaleDateString(i18n.language === 'de' ? 'de-AT' : 'en-GB')}</div>
                </div>
              </div>
            )}
            {animal.contact && (
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                <User size={18} className="text-tertiary" />
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{t('publicScan.contact')}</div>
                  <div style={{ fontWeight: 500 }}>{animal.contact.name} {animal.contact.email ? `(${animal.contact.email})` : ''}</div>
                </div>
              </div>
            )}
            {animal.address && (
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                <MapPin size={18} className="text-tertiary" />
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{t('publicScan.address')}</div>
                  <div style={{ fontWeight: 500 }}>{animal.address}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {animal.documents && animal.documents.length > 0 ? (() => {
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
          <div className="animate-fade-in" style={{ animationDelay: '150ms' }}>
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
                          {r.valid_until && <div><span style={{ color: 'var(--text-tertiary)' }}>Gültig bis</span><br /><strong>{r.valid_until}</strong></div>}
                          {r.batch_number && <div><span style={{ color: 'var(--text-tertiary)' }}>Charge</span><br /><strong>{r.batch_number}</strong></div>}
                          {r.manufacturer && <div><span style={{ color: 'var(--text-tertiary)' }}>Hersteller</span><br /><strong>{r.manufacturer}</strong></div>}
                          {r.veterinarian_name && <div><span style={{ color: 'var(--text-tertiary)' }}>Tierarzt</span><br /><strong>{r.veterinarian_name}</strong></div>}
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
                  return (
                    <div key={doc.id} className="card card-sm" style={{ marginBottom: 'var(--space-2)', cursor: 'pointer' }} onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{doc.extracted_json?.title || docTypeLabel(doc.doc_type)}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{new Date(doc.created_at).toLocaleDateString(i18n.language === 'de' ? 'de-AT' : 'en-GB')}</span>
                          {isExpanded ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
                        </div>
                      </div>
                      {isExpanded && doc.extracted_json?.summary && (
                        <div className="animate-slide-up" style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border)' }}>
                          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{doc.extracted_json.summary}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })() : (
        animal.documents && animal.documents.length === 0 && (
          <div style={{
            padding: 'var(--space-4)', background: 'var(--surface)',
            borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)',
            textAlign: 'center'
          }}>
            <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
              {t('publicScan.noDocuments')}
            </p>
          </div>
        )
      )}

      <div className="animate-fade-in" style={{ animationDelay: '200ms', textAlign: 'center', marginTop: 'var(--space-8)' }}>
        <Link to="/login" className="btn btn-secondary">
          In eigener PAW App öffnen
        </Link>
      </div>
    </div>
  )
}