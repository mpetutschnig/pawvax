import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSharing, updateSharing } from '../api/rest'
import { PageHeader } from '../components/PageHeader'
import { ChevronLeft, Eye, Landmark, Stethoscope, Syringe, Pill, FileText, User, PawPrint, Cake } from 'lucide-react'

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

export default function SharingSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [sharing, setSharing] = useState<SharingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const roleConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    readonly: { label: 'Lesezugriff', icon: <Eye size={18} />, color: 'var(--primary-600)' },
    authority: { label: 'Behörde', icon: <Landmark size={18} />, color: 'var(--info-600)' },
    vet: { label: 'Tierarzt', icon: <Stethoscope size={18} />, color: 'var(--success-600)' },
  }

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

  if (loading) return <div className="container page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}><div className="spinner spinner-lg"></div></div>
  if (error) return <div className="container page"><div className="error-card"><p>{error}</p></div></div>

  return (
    <div className="container page">
      <PageHeader title="Freigaben" backTo={`/animals/${id}`} showThemeToggle />

      <div className="card animate-slide-up" style={{ marginBottom: 'var(--space-6)' }}>
        <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
          Wähle, welche Daten jede Rolle sehen darf, wenn sie den QR/NFC-Tag dieses Tieres scannt.
        </p>
      </div>

      <div className="animate-fade-in" style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {sharing.map(row => {
          const config = roleConfig[row.role] || { label: row.role, icon: <Eye size={18} />, color: 'var(--text-primary)' }
          return (
            <div key={row.role} className="card">
              <h3 style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: config.color }}>
                {config.icon} {config.label}
              </h3>

              <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!row.share_vaccination}
                    onChange={e => handleSave(row.role, { share_vaccination: e.target.checked ? 1 : 0 })}
                    disabled={saving}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary-500)' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><Syringe size={16} className="text-tertiary" /> Impfstatus</span>
                </label>

                <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!row.share_medication}
                    onChange={e => handleSave(row.role, { share_medication: e.target.checked ? 1 : 0 })}
                    disabled={saving}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary-500)' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><Pill size={16} className="text-tertiary" /> Medikamente</span>
                </label>

                <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!row.share_other_docs}
                    onChange={e => handleSave(row.role, { share_other_docs: e.target.checked ? 1 : 0 })}
                    disabled={saving}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary-500)' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><FileText size={16} className="text-tertiary" /> Sonstige Dokumente</span>
                </label>

                <hr className="divider" style={{ margin: 'var(--space-2) 0' }} />

                <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!row.share_contact}
                    onChange={e => handleSave(row.role, { share_contact: e.target.checked ? 1 : 0 })}
                    disabled={saving}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary-500)' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><User size={16} className="text-tertiary" /> Deine Kontaktdaten</span>
                </label>

                <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!row.share_breed}
                    onChange={e => handleSave(row.role, { share_breed: e.target.checked ? 1 : 0 })}
                    disabled={saving}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary-500)' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><PawPrint size={16} className="text-tertiary" /> Rasse</span>
                </label>

                <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!row.share_birthdate}
                    onChange={e => handleSave(row.role, { share_birthdate: e.target.checked ? 1 : 0 })}
                    disabled={saving}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary-500)' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><Cake size={16} className="text-tertiary" /> Geburtsdatum</span>
                </label>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
