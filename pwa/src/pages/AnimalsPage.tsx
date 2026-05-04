import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import * as api from '../api/rest'
import { PetCard } from '../components/PetCard'
import { PageHeader } from '../components/PageHeader'
import { Search, Plus, PawPrint, ArrowRightLeft } from 'lucide-react'
import { AnimalListItemDTO } from '../types/animal'
import { getRecentlyViewedAnimals, RecentlyViewedAnimal } from '../hooks/useRecentlyViewed'

export default function AnimalsPage() {
  const { t } = useTranslation()
  const [animals, setAnimals] = useState<(AnimalListItemDTO & { is_archived?: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [transferCode, setTransferCode] = useState('')
  const [formData, setFormData] = useState({ name: '', species: 'dog', breed: '', birthdate: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedAnimal[]>([])

  useEffect(() => {
    loadAnimals()
    setRecentlyViewed(getRecentlyViewedAnimals())
  }, [])

  const loadAnimals = async () => {
    try {
      setLoading(true)
      const { data } = await api.getAnimals()
      setAnimals(data as any)
    } catch (err: any) {
      setError(err.response?.data?.error || t('animals.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) {
      setError(t('animals.nameRequired'))
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      await api.createAnimal({
        name: formData.name,
        species: formData.species,
        breed: formData.breed || null,
        birthdate: formData.birthdate || null
      })
      await loadAnimals()
      setFormData({ name: '', species: 'dog', breed: '', birthdate: '' })
      setShowForm(false)
    } catch (err: any) {
      setError(err.response?.data?.error || t('animals.createError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleAcceptTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!transferCode) return
    try {
      setSubmitting(true)
      setError(null)
      const token = localStorage.getItem('token')
      const res = await fetch('/api/animals/transfer/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code: transferCode })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      await loadAnimals()
      setTransferCode('')
      setShowTransferForm(false)
    } catch (err: any) {
      setError(err.message || t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const filteredAnimals = animals.filter(a => a.name.toLowerCase().includes(search.toLowerCase()) || a.breed?.toLowerCase().includes(search.toLowerCase()))

  if (loading) {
    return (
      <div className="container page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <div className="spinner spinner-lg"></div>
      </div>
    )
  }

  return (
    <div className="container page">
      <PageHeader title={`${t('animals.myAnimals')} (${animals.length})`} showThemeToggle />

      {recentlyViewed.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>{t('recent.title')}</h3>
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {recentlyViewed.map((item) => (
              <Link
                key={item.id}
                to={`/animals/${item.id}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--space-2) var(--space-3)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  textDecoration: 'none',
                  color: 'inherit',
                  background: 'var(--surface)'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{item.name}</div>
                  <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                    {item.species || ''}{item.breed ? ` · ${item.breed}` : ''}
                  </div>
                </div>
                <div className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                  {item.source === 'scan' ? t('recent.sourceScan') : t('recent.sourceShare')} · {new Date(item.viewedAt).toLocaleTimeString()}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: 'var(--space-4)' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
        <input
          className="form-input"
          style={{ paddingLeft: 38 }}
          placeholder={t('animals.search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {animals.length === 0 && !showForm && !showTransferForm && (
        <div className="card text-center" style={{ padding: 'var(--space-8) var(--space-4)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-4)' }}>
            <PawPrint size={32} color="var(--primary-500)" />
          </div>
          <h3>{t('animals.noAnimals')}</h3>
          <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>
            {t('animals.addFirst')}
          </p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={18} />
            {t('animals.add')}
          </button>
          <div className="divider" style={{ margin: 'var(--space-4) 0' }}></div>
          <button className="btn btn-outline" onClick={() => setShowTransferForm(true)}>
            <ArrowRightLeft size={18} /> {t('animals.acceptTransferBtn')}
          </button>
        </div>
      )}

      {showForm && (
        <div className="card animate-slide-up" style={{ marginBottom: 'var(--space-4)' }}>
          <h3 style={{ marginBottom: 'var(--space-4)' }}>{t('animals.createNew')}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">{t('animals.name')} *</label>
              <input
                className="form-input"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('animals.namePlaceholder')}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('animals.species')} *</label>
              <select
                className="form-select"
                value={formData.species}
                onChange={(e) => setFormData({ ...formData, species: e.target.value })}
              >
                <option value="dog">{t('animals.dog')}</option>
                <option value="cat">{t('animals.cat')}</option>
                <option value="other">{t('animals.other')}</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('animals.breed')} ({t('animals.optional')})</label>
              <input
                className="form-input"
                type="text"
                value={formData.breed}
                onChange={(e) => setFormData({ ...formData, breed: e.target.value })}
                placeholder={t('animals.breedPlaceholder')}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('animals.birthdate')} ({t('animals.optional')})</label>
              <input
                className="form-input"
                type="date"
                value={formData.birthdate}
                onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button type="submit" className="btn btn-primary flex-1" disabled={submitting}>
                {submitting ? t('animals.creating') : t('animals.add')}
              </button>
              <button
                type="button"
                className="btn btn-ghost flex-1"
                onClick={() => setShowForm(false)}
                disabled={submitting}
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {showTransferForm && (
        <div className="card animate-slide-up" style={{ marginBottom: 'var(--space-4)' }}>
          <h3 style={{ marginBottom: 'var(--space-4)' }}>{t('animals.acceptTransferTitle')}</h3>
          <form onSubmit={handleAcceptTransfer}>
            <div className="form-group">
              <label className="form-label">{t('animal.transferCode')}</label>
              <input className="form-input" type="text" value={transferCode} onChange={e => setTransferCode(e.target.value)} placeholder={t('animals.transferCodePlaceholder')} required />
            </div>
            {error && <div className="error-card"><p>{error}</p></div>}
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button type="submit" className="btn btn-primary flex-1" disabled={submitting}>
                {submitting ? t('common.loading') : t('animals.acceptBtn')}
              </button>
              <button type="button" className="btn btn-ghost flex-1" onClick={() => setShowTransferForm(false)} disabled={submitting}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {!showForm && !showTransferForm && animals.length > 0 && (
        <>
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            {filteredAnimals.map((animal) => (
              <div key={animal.id} style={{ opacity: animal.is_archived ? 0.6 : 1, transition: 'opacity 0.3s' }}>
                <PetCard
                  id={animal.id}
                  name={animal.name}
                  species={animal.species}
                  breed={animal.breed}
                  age={animal.birthdate ? new Date().getFullYear() - new Date(animal.birthdate).getFullYear() + ' ' + t('animal.years') : undefined}
                  vaccinationStatus="current" // Placeholder, should come from API eventually
                  hasNfcTag={false} // Placeholder
                  isVetVerified={false} // Placeholder
                  avatarPath={animal.avatar_path}
                  isArchived={!!animal.is_archived}
                />
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={18} /> {t('animals.add')}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowTransferForm(true)}>
              <ArrowRightLeft size={18} /> {t('animals.acceptTransferBtn')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
