import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getAnimal, getAnimalDocuments, getAnimalTags, updateAnimal, deleteAnimal } from '../api/rest'

interface Animal {
  id: string; name: string; species: string; breed?: string; birthdate?: string
}
interface AnimalTag {
  tag_id: string; tag_type: string; active: number; added_at: string
}
interface Document {
  id: string; doc_type: string; created_at: string; ocr_provider: string; added_by_role?: string
}

const speciesLabel: Record<string, string> = { dog: '🐶 Hund', cat: '🐱 Katze', other: '🐾 Tier' }
const docTypeLabel: Record<string, string> = { vaccination: '💉 Impfung', medication: '💊 Medikament', other: '📄 Dokument' }

export default function AnimalPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [animal, setAnimal] = useState<Animal | null>(null)
  const [tags, setTags] = useState<AnimalTag[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Animal | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [documentSearch, setDocumentSearch] = useState('')

  useEffect(() => {
    if (!id) return
    Promise.all([getAnimal(id), getAnimalDocuments(id), getAnimalTags(id)])
      .then(([a, d, t]) => {
        setAnimal(a.data)
        setEditData(a.data)
        setDocuments(d.data)
        setTags(t.data)
      })
      .catch(() => setError('Tier nicht gefunden'))
      .finally(() => setLoading(false))
  }, [id])

  const handleEdit = async () => {
    if (!editData || !id) return
    try {
      setSubmitting(true)
      await updateAnimal(id, {
        name: editData.name,
        species: editData.species,
        breed: editData.breed || null,
        birthdate: editData.birthdate || null
      })
      setAnimal(editData)
      setEditing(false)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Fehler beim Speichern')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !window.confirm('Bist du sicher, dass du dieses Tier löschen möchtest?')) return
    try {
      setSubmitting(true)
      await deleteAnimal(id)
      navigate('/animals')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Fehler beim Löschen')
      setSubmitting(false)
    }
  }

  if (loading) return <div className="container"><p className="muted" style={{ marginTop: '2rem' }}>Lade...</p></div>
  if (error || !animal) return <div className="container"><p className="error" style={{ marginTop: '2rem' }}>{error}</p></div>

  return (
    <div className="container" style={{ paddingBottom: '80px' }}>
      <div className="nav-bar">
        <button onClick={() => navigate('/animals')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}>←</button>
        <h2>{animal.name}</h2>
      </div>

      {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="card">
        {!editing ? (
          <>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '3rem' }}>{animal.species === 'dog' ? '🐶' : animal.species === 'cat' ? '🐱' : '🐾'}</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, fontSize: '1.1rem' }}>{animal.name}</p>
                <p className="muted">{speciesLabel[animal.species] ?? animal.species}{animal.breed ? ` · ${animal.breed}` : ''}</p>
                {animal.birthdate && <p className="muted">Geb.: {animal.birthdate}</p>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button className="btn btn-outline" onClick={() => setEditing(true)} style={{ flex: 1 }}>✏️ Bearbeiten</button>
                <button className="btn btn-outline" onClick={handleDelete} disabled={submitting} style={{ flex: 1, background: '#fee2e2', color: '#b91c1c' }}>🗑️ Löschen</button>
              </div>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <Link to={`/animals/${id}/tags`} style={{ flex: 1, textDecoration: 'none' }}>
                  <button className="btn btn-outline">🏷 Tags</button>
                </Link>
                <Link to={`/animals/${id}/sharing`} style={{ flex: 1, textDecoration: 'none' }}>
                  <button className="btn btn-outline">🔐 Freigaben</button>
                </Link>
              </div>
              <Link to={`/animals/${id}/scan`} style={{ flex: 1, textDecoration: 'none' }}>
                <button className="btn btn-primary" style={{ width: '100%' }}>📷 Dokument scannen</button>
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2>Daten bearbeiten</h2>
            <label>Name</label>
            <input
              type="text"
              value={editData?.name || ''}
              onChange={(e) => setEditData({ ...editData!, name: e.target.value })}
              required
            />

            <label>Tierart</label>
            <select
              value={editData?.species || 'dog'}
              onChange={(e) => setEditData({ ...editData!, species: e.target.value })}
            >
              <option value="dog">🐶 Hund</option>
              <option value="cat">🐱 Katze</option>
              <option value="other">🐾 Sonstiges</option>
            </select>

            <label>Rasse (optional)</label>
            <input
              type="text"
              value={editData?.breed || ''}
              onChange={(e) => setEditData({ ...editData!, breed: e.target.value })}
              placeholder="z.B. Golden Retriever"
            />

            <label>Geburtsdatum (optional)</label>
            <input
              type="date"
              value={editData?.birthdate || ''}
              onChange={(e) => setEditData({ ...editData!, birthdate: e.target.value })}
            />

            <div style={{ display: 'flex', gap: '.5rem' }}>
              <button className="btn btn-primary" onClick={handleEdit} disabled={submitting} style={{ flex: 1 }}>
                {submitting ? 'Wird gespeichert...' : '💾 Speichern'}
              </button>
              <button className="btn btn-outline" onClick={() => { setEditing(false); setEditData(animal) }} disabled={submitting} style={{ flex: 1 }}>
                Abbrechen
              </button>
            </div>
          </>
        )}
      </div>

      {tags.length > 0 && (
        <div>
          <h2>IDs ({tags.length})</h2>
          {tags.map(tag => (
            <div key={tag.tag_id} className="card" style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>
                      {tag.tag_type === 'barcode' ? '📦' : '📡'}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', wordBreak: 'break-all' }}>
                      {tag.tag_id}
                    </span>
                  </div>
                  <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                    {tag.tag_type === 'barcode' ? 'Barcode' : 'NFC'} · {tag.active ? 'Aktiv' : 'Inaktiv'}
                  </p>
                </div>
                {tag.active === 0 && (
                  <span style={{ padding: '0.25rem 0.5rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                    Inaktiv
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2>Dokumente ({documents.length})</h2>
      {documents.length === 0 && <p className="muted">Noch keine Dokumente. Scanne das erste Dokument!</p>}
      {documents.length > 0 && (
        <input
          type="text"
          placeholder="🔍 Dokumente durchsuchen..."
          value={documentSearch}
          onChange={e => setDocumentSearch(e.target.value.toLowerCase())}
          style={{ width: '100%', marginBottom: '1rem' }}
        />
      )}
      {documents
        .filter(doc => !documentSearch || docTypeLabel[doc.doc_type]?.toLowerCase().includes(documentSearch) || new Date(doc.created_at).toLocaleString('de-AT').includes(documentSearch))
        .map(doc => (
        <Link key={doc.id} to={`/animals/${id}/documents/${doc.id}`} style={{ textDecoration: 'none' }}>
          <div className="card" style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem' }}>
              <span style={{ fontWeight: 500 }}>{docTypeLabel[doc.doc_type] ?? doc.doc_type}</span>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                {doc.added_by_role === 'vet' && <span className={`badge badge-vet`}>🐾 Tierarzt</span>}
                {doc.added_by_role === 'authority' && <span className={`badge badge-authority`}>🐾 Behörde</span>}
                <span className="muted" style={{ fontSize: '.75rem', minWidth: '60px', textAlign: 'right' }}>{doc.ocr_provider}</span>
              </div>
            </div>
            <p className="muted" style={{ marginTop: '.25rem', fontSize: '.875rem' }}>
              {new Date(doc.created_at).toLocaleString('de-AT')}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}
