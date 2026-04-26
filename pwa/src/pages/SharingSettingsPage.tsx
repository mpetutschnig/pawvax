import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSharing, updateSharing } from '../api/rest'

interface SharingRow {
  id: string
  role: string
  share_vaccination: number
  share_medication: number
  share_other_docs: number
  share_contact: number
  share_breed: number
  share_birthdate: number
}

const roleLabel: Record<string, string> = {
  readonly: '👁️ Lesezugriff',
  authority: '🏛️ Behörde',
  vet: '🐾 Tierarzt',
}

export default function SharingSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [sharing, setSharing] = useState<SharingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    getSharing(id)
      .then(res => setSharing(res.data))
      .catch(() => setError('Freigaben nicht gefunden'))
      .finally(() => setLoading(false))
  }, [id])

  async function handleSave(role: string, changes: object) {
    if (!id) return
    setSaving(true)
    try {
      const updated = await updateSharing(id, role, changes)
      setSharing(s => s.map(row => row.role === role ? updated.data : row))
    } catch {
      setError('Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="container"><p className="muted" style={{ marginTop: '2rem' }}>Lade...</p></div>
  if (error) return <div className="container"><p className="error" style={{ marginTop: '2rem' }}>{error}</p></div>

  return (
    <div className="container">
      <div className="nav-bar">
        <button onClick={() => navigate(`/animals/${id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}>←</button>
        <h2>Freigaben</h2>
      </div>

      <div className="card">
        <p className="muted" style={{ marginBottom: '1rem' }}>
          Wähle, welche Daten jede Rolle sehen darf, wenn sie den QR/NFC-Tag dieses Tieres scannt.
        </p>
      </div>

      {sharing.map(row => (
        <div key={row.role} className="card">
          <h3 style={{ marginBottom: '1rem' }}>{roleLabel[row.role]}</h3>

          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', cursor: 'pointer', marginBottom: '.75rem' }}>
            <input
              type="checkbox"
              checked={!!row.share_vaccination}
              onChange={e => handleSave(row.role, { share_vaccination: e.target.checked ? 1 : 0 })}
              disabled={saving}
              style={{ width: 'auto' }}
            />
            <span>💉 Impfstatus</span>
          </label>

          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', cursor: 'pointer', marginBottom: '.75rem' }}>
            <input
              type="checkbox"
              checked={!!row.share_medication}
              onChange={e => handleSave(row.role, { share_medication: e.target.checked ? 1 : 0 })}
              disabled={saving}
              style={{ width: 'auto' }}
            />
            <span>💊 Medikamente</span>
          </label>

          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', cursor: 'pointer', marginBottom: '.75rem' }}>
            <input
              type="checkbox"
              checked={!!row.share_other_docs}
              onChange={e => handleSave(row.role, { share_other_docs: e.target.checked ? 1 : 0 })}
              disabled={saving}
              style={{ width: 'auto' }}
            />
            <span>📄 Sonstige Dokumente</span>
          </label>

          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', cursor: 'pointer', marginBottom: '.75rem' }}>
            <input
              type="checkbox"
              checked={!!row.share_contact}
              onChange={e => handleSave(row.role, { share_contact: e.target.checked ? 1 : 0 })}
              disabled={saving}
              style={{ width: 'auto' }}
            />
            <span>👤 Deine Kontaktdaten</span>
          </label>

          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', cursor: 'pointer', marginBottom: '.75rem' }}>
            <input
              type="checkbox"
              checked={!!row.share_breed}
              onChange={e => handleSave(row.role, { share_breed: e.target.checked ? 1 : 0 })}
              disabled={saving}
              style={{ width: 'auto' }}
            />
            <span>🐾 Rasse</span>
          </label>

          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!row.share_birthdate}
              onChange={e => handleSave(row.role, { share_birthdate: e.target.checked ? 1 : 0 })}
              disabled={saving}
              style={{ width: 'auto' }}
            />
            <span>🎂 Geburtsdatum</span>
          </label>
        </div>
      ))}
    </div>
  )
}
