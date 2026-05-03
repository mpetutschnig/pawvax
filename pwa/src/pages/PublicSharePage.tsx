import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PawPrint, FileText, Syringe, Calendar, User, MapPin } from 'lucide-react'

export default function PublicSharePage() {
  const { shareId } = useParams<{ shareId: string }>()
  const { t, i18n } = useTranslation()
  const [animal, setAnimal] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!shareId) return
    fetch(`/api/public/share/${shareId}`)
      .then(async res => {
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || t('common.error'))
        }
        return res.json()
      })
      .then(data => {
        setAnimal(data)
        setError(null)
      })
      .catch(err => setError(err.message))
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

      <div className="animate-fade-in" style={{ animationDelay: '200ms', textAlign: 'center', marginTop: 'var(--space-8)' }}>
        <Link to="/login" className="btn btn-secondary">
          In eigener PAW App öffnen
        </Link>
      </div>
    </div>
  )
}