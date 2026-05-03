import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PawPrint, Calendar, User, MapPin, Syringe, Pill, FileText, ChevronUp, ChevronDown } from 'lucide-react'
import { api } from '../api/rest'

export default function PublicSharePage() {
  const { shareId } = useParams<{ shareId: string }>()
  const { t, i18n } = useTranslation()
  const [animal, setAnimal] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null)

  useEffect(() => {
    if (!shareId) return
    api.get(`/public/share/${shareId}`)
      .then(res => {
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
          <div className="animate-fade-in" style={{ animationDelay: '150ms' }}>
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