import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PawPrint, Cat, Shield, Pill, FileText, AlertTriangle, Clock } from 'lucide-react'

interface SharedAnimal {
  id: string
  name: string
  species: string
  breed?: string
  birthdate?: string
  avatar_path?: string
  contact?: { name: string; email?: string }
  documents?: SharedDocument[]
}

interface SharedDocument {
  id: string
  doc_type: string
  created_at: string
  extracted_json: any
  image_path?: string
  pages?: string[]
}

export default function PublicSharePage() {
  const { shareId } = useParams<{ shareId: string }>()
  const { t, i18n } = useTranslation()
  const [animal, setAnimal] = useState<SharedAnimal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  import { PawPrint, Cat, Syringe, Pill, FileText, AlertTriangle, Clock, ChevronDown, ChevronUp } from 'lucide-react'

  import axios from 'axios'
      </div>
    const { shareId } = useParams()
    const { t, i18n } = useTranslation()
    const [animal, setAnimal] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [expired, setExpired] = useState(false)
    const [expandedDocId, setExpandedDocId] = useState<string | null>(null)
        <Clock size={48} color="var(--warning-500)" />
        <h2 style={{ marginTop: 'var(--space-4)' }}>{t('sharing.expired')}</h2>
        <p className="text-muted">{t('sharing.expiredDescription')}</p>
      axios.get(`/api/public/share/${shareId}`)
      axios.get(`/api/public/share/${shareId}`)
        .then(res => setAnimal(res.data))
        .catch(err => {
          const status = err.response?.status
          if (status === 410) setExpired(true)
          else setError(status === 404 ? t('scan.notFound') : t('common.error'))
        })
        .finally(() => setLoading(false))
    switch (type) {
      case 'vaccination': return <Shield size={16} color="var(--success-500)" />
      case 'medication': return <Pill size={16} color="var(--primary-500)" />
      default: return <FileText size={16} color="var(--text-tertiary)" />
    }
  }

  const SpeciesIcon = animal.species === 'cat' ? Cat : PawPrint

  return (
    <div className="page container">
      {/* Animal Header */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        {animal.avatar_path ? (
          <img
            src={`/uploads/${animal.avatar_path}`}
            alt={animal.name}
            style={{ width: 64, height: 64, borderRadius: 'var(--radius-full)', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-full)', background: 'var(--primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SpeciesIcon size={28} color="var(--primary-500)" />
          </div>
        )}
        <div>
          <h2 style={{ margin: 0 }}>{animal.name}</h2>
          <p className="text-muted" style={{ margin: 0 }}>
            {animal.breed && `${animal.breed} · `}
            {animal.birthdate && new Date(animal.birthdate).toLocaleDateString(i18n.language === 'de' ? 'de-AT' : 'en-GB')}
          </p>
          {animal.contact && (
            <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-xs)' }}>
              {t('sharing.owner')}: {animal.contact.name}
            </p>
          )}
        </div>
      </div>

      {/* Shared badge */}
      <div style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span className="badge badge-info">{t('sharing.tempLink')}</span>
      </div>

      {/* Documents */}
      {animal.documents && animal.documents.length > 0 ? (
        <>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>{t('sharing.sharedDocuments')} ({animal.documents.length})</h3>
          {animal.documents.map(doc => (
            <div key={doc.id} className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {docTypeIcon(doc.doc_type)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                  {doc.extracted_json?.vaccine_name || doc.extracted_json?.medication_name || doc.extracted_json?.title || t(`animal.docType${doc.doc_type.charAt(0).toUpperCase() + doc.doc_type.slice(1)}`)}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                  {new Date(doc.created_at).toLocaleDateString(i18n.language === 'de' ? 'de-AT' : 'en-GB')}
                  {doc.extracted_json?.date && ` · ${doc.extracted_json.date}`}
                </div>
              </div>
              {doc.image_path && (
                <a href={`/uploads/${doc.image_path}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost">
                  <FileText size={14} />
                </a>
              )}
            </div>
          ))}
          <p className="text-muted" style={{ fontSize: '11px', textAlign: 'center', marginTop: 'var(--space-4)' }}>
            {t('docDetail.ocrDisclaimer')}
          </p>
        </>
      ) : (
        <p className="text-muted text-center" style={{ paddingTop: 'var(--space-6)' }}>
          {t('sharing.noDocuments')}
        </p>
      )}
    </div>
  )
}