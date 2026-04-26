import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api/rest'

interface Animal {
  id: string
  name: string
  species: string
  breed?: string
  birthdate?: string
}

export default function AnimalsPage() {
  const navigate = useNavigate()
  const [animals, setAnimals] = useState<Animal[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', species: 'dog', breed: '', birthdate: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const getEmoji = (species: string) => {
    switch (species) {
      case 'dog': return '🐶'
      case 'cat': return '🐱'
      default: return '🐾'
    }
  }

  const getSpeciesLabel = (species: string) => {
    switch (species) {
      case 'dog': return 'Hund'
      case 'cat': return 'Katze'
      default: return 'Tier'
    }
  }

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: '2rem' }}>
        <p>Laden...</p>
      </div>
    )
  }

  return (
    <div className="container" style={{ paddingBottom: '80px' }}>
      <h1>🐾 Meine Tiere</h1>

      {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {animals.length === 0 && !showForm && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>
            Noch keine Tiere. Lege ein neues Tier an oder scanne einen Barcode.
          </p>
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2>Neues Tier anlegen</h2>
          <form onSubmit={handleSubmit}>
            <label>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="z.B. Bella"
              required
            />

            <label>Tierart *</label>
            <select
              value={formData.species}
              onChange={(e) => setFormData({ ...formData, species: e.target.value })}
            >
              <option value="dog">🐶 Hund</option>
              <option value="cat">🐱 Katze</option>
              <option value="other">🐾 Sonstiges</option>
            </select>

            <label>Rasse (optional)</label>
            <input
              type="text"
              value={formData.breed}
              onChange={(e) => setFormData({ ...formData, breed: e.target.value })}
              placeholder="z.B. Golden Retriever"
            />

            <label>Geburtsdatum (optional)</label>
            <input
              type="date"
              value={formData.birthdate}
              onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
            />

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Wird erstellt...' : 'Tier anlegen'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowForm(false)}
                disabled={submitting}
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {animals.map((animal) => (
        <div
          key={animal.id}
          className="card"
          onClick={() => navigate(`/animals/${animal.id}`)}
          style={{ cursor: 'pointer', marginBottom: '1rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ fontSize: '2rem' }}>{getEmoji(animal.species)}</div>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: '0 0 0.25rem 0' }}>{animal.name}</h2>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '.9rem' }}>
                {getSpeciesLabel(animal.species)}
                {animal.breed && ` · ${animal.breed}`}
                {animal.birthdate && ` · Geb. ${animal.birthdate}`}
              </p>
            </div>
            <div style={{ fontSize: '1.5rem' }}>›</div>
          </div>
        </div>
      ))}

      {!showForm && (
        <button
          className="btn btn-primary"
          onClick={() => setShowForm(true)}
          style={{ marginBottom: '1rem' }}
        >
          ➕ Neues Tier anlegen
        </button>
      )}
    </div>
  )
}
