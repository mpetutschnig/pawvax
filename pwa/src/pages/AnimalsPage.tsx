import { useState, useEffect } from 'react'
import * as api from '../api/rest'
import { PetCard } from '../components/PetCard'
import { PageHeader } from '../components/PageHeader'
import { Search, Plus, PawPrint } from 'lucide-react'

interface Animal {
  id: string
  name: string
  species: string
  breed?: string
  birthdate?: string
  avatar_path?: string
}

export default function AnimalsPage() {
  const [animals, setAnimals] = useState<Animal[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', species: 'dog', breed: '', birthdate: '' })
  const [submitting, setSubmitting] = useState(false)
  const [, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadAnimals()
  }, [])

  const loadAnimals = async () => {
    try {
      setLoading(true)
      const { data } = await api.getAnimals()
      setAnimals(data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Fehler beim Laden der Tiere')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) {
      setError('Name ist erforderlich')
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
      setError(err.response?.data?.error || 'Fehler beim Anlegen des Tieres')
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
      <PageHeader title={`My Animals (${animals.length})`} showThemeToggle />

      <div style={{ position: 'relative', marginBottom: 'var(--space-4)' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
        <input
          className="form-input"
          style={{ paddingLeft: 38 }}
          placeholder="Search animals…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {animals.length === 0 && !showForm && (
        <div className="card text-center" style={{ padding: 'var(--space-8) var(--space-4)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-4)' }}>
            <PawPrint size={32} color="var(--primary-500)" />
          </div>
          <h3>No animals yet</h3>
          <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>
            Add your first pet to start managing their health records.
          </p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={18} />
            Add Pet
          </button>
        </div>
      )}

      {showForm && (
        <div className="card animate-slide-up" style={{ marginBottom: 'var(--space-4)' }}>
          <h3 style={{ marginBottom: 'var(--space-4)' }}>Neues Tier anlegen</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                className="form-input"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="z.B. Bella"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Tierart *</label>
              <select
                className="form-select"
                value={formData.species}
                onChange={(e) => setFormData({ ...formData, species: e.target.value })}
              >
                <option value="dog">Hund</option>
                <option value="cat">Katze</option>
                <option value="other">Sonstiges</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Rasse (optional)</label>
              <input
                className="form-input"
                type="text"
                value={formData.breed}
                onChange={(e) => setFormData({ ...formData, breed: e.target.value })}
                placeholder="z.B. Golden Retriever"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Geburtsdatum (optional)</label>
              <input
                className="form-input"
                type="date"
                value={formData.birthdate}
                onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button type="submit" className="btn btn-primary flex-1" disabled={submitting}>
                {submitting ? 'Wird erstellt...' : 'Tier anlegen'}
              </button>
              <button
                type="button"
                className="btn btn-ghost flex-1"
                onClick={() => setShowForm(false)}
                disabled={submitting}
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {!showForm && animals.length > 0 && (
        <>
          {filteredAnimals.map((animal) => (
            <PetCard
              key={animal.id}
              id={animal.id}
              name={animal.name}
              species={animal.species}
              breed={animal.breed}
              age={animal.birthdate ? new Date().getFullYear() - new Date(animal.birthdate).getFullYear() + ' Jahre' : undefined}
              vaccinationStatus="current" // Placeholder, should come from API eventually
              hasNfcTag={false} // Placeholder
              isVetVerified={false} // Placeholder
              avatarPath={animal.avatar_path}
            />
          ))}

          <button
            className="btn btn-primary btn-full mt-4"
            onClick={() => setShowForm(true)}
          >
            <Plus size={18} /> Add Pet
          </button>
        </>
      )}
    </div>
  )
}
