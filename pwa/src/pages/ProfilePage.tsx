import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMe, patchMe, deleteMe, requestVerification } from '../api/rest'

export default function ProfilePage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [geminiToken, setGeminiToken] = useState('')
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      const res = await getMe()
      setProfile(res.data)
      setGeminiToken('')
      setError(null)
    } catch (err) {
      setError('Profil konnte nicht geladen werden')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const saveGeminiToken = async () => {
    setSaving(true)
    try {
      await patchMe({ gemini_token: geminiToken || null })
      setSuccess('Gemini-Schlüssel gespeichert')
      setGeminiToken('')
      setTimeout(() => {
        loadProfile()
        setSuccess(null)
      }, 1000)
    } catch (err) {
      setError('Fehler beim Speichern')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const clearGeminiToken = async () => {
    setSaving(true)
    try {
      await patchMe({ gemini_token: null })
      setSuccess('Gemini-Schlüssel gelöscht')
      setGeminiToken('')
      setTimeout(() => {
        loadProfile()
        setSuccess(null)
      }, 1000)
    } catch (err) {
      setError('Fehler beim Löschen')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const requestVerify = async () => {
    try {
      await requestVerification()
      setSuccess('Verifikationsantrag eingereicht')
      setTimeout(() => {
        loadProfile()
        setSuccess(null)
      }, 2000)
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Fehler'
      setError(msg)
      console.error(err)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteMe()
      localStorage.removeItem('token')
      localStorage.removeItem('role')
      localStorage.removeItem('roles')
      localStorage.removeItem('verified')
      navigate('/login')
    } catch (err) {
      setError('Account konnte nicht gelöscht werden')
      console.error(err)
    }
  }

  if (loading) return <div className="container" style={{ paddingTop: '1rem' }}><p>Laden...</p></div>

  if (!profile) return <div className="container"><p className="error">Profil konnte nicht geladen werden</p></div>

  const roles = profile.roles ?? []
  const isVet = roles.includes('vet')
  const isVerified = profile.verified
  const verificationStatus = profile.verification_status

  return (
    <div className="container">
      <h1>👤 Mein Profil</h1>

      {error && <p className="error">{error}</p>}
      {success && <p style={{ color: 'var(--color-success)' }}>✓ {success}</p>}

      <div className="card">
        <h2 style={{ fontSize: '1.25rem', marginTop: 0 }}>{profile.name}</h2>
        <p className="muted">{profile.email}</p>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />

        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '1.5rem' }}>Rollen</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {roles.length > 0 ? (
            roles.map(r => (
              <span key={r} className="badge" style={{ background: 'var(--primary)', color: 'white' }}>
                {r === 'user' ? '👤' : r === 'vet' ? '🐕‍🦺' : r === 'authority' ? '👮' : '⚙️'} {r}
              </span>
            ))
          ) : (
            <span className="muted">Benutzer</span>
          )}
        </div>

        {isVet && (
          <>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '1.5rem' }}>Verifikation</h3>
            {isVerified ? (
              <p style={{ color: 'var(--color-success)' }}>✓ Du bist als Tierarzt verifiziert</p>
            ) : verificationStatus === 'pending' ? (
              <p className="muted">⏳ Verifikationsantrag läuft (Wartet auf Admin-Genehmigung)</p>
            ) : (
              <button className="btn btn-primary" onClick={requestVerify} style={{ marginTop: '0.5rem' }}>
                ✓ Verifikation beantragen
              </button>
            )}
          </>
        )}

        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '1.5rem' }}>Gemini Vision API</h3>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Gib deinen persönlichen Gemini API-Schlüssel ein, um Dokumente mit deinem eigenen Kontingent zu analysieren.
          Ohne Schlüssel nutzen wir Tesseract (kostenloses OCR auf unserem Server).
        </p>
        {profile.has_gemini_token && (
          <p style={{ color: 'var(--color-success)', marginBottom: '0.5rem' }}>✓ Gemini-Schlüssel gespeichert</p>
        )}
        {!profile.has_gemini_token && (
          <input
            type="password"
            placeholder="AIza..."
            value={geminiToken}
            onChange={e => setGeminiToken(e.target.value)}
            style={{ marginBottom: '0.5rem' }}
          />
        )}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!profile.has_gemini_token ? (
            <button className="btn btn-primary" onClick={saveGeminiToken} disabled={saving || !geminiToken}>
              {saving ? 'Speichert...' : 'Speichern'}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={clearGeminiToken} disabled={saving}>
              {saving ? 'Löscht...' : 'Löschen'}
            </button>
          )}
        </div>
        <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
          ⚠ Durch Speichern eines Gemini-Schlüssels werden Dokumente zur Analyse an Google gesendet.
          Bitte Google Cloud Terms of Service & DSGVO beachten.
        </p>

        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '1.5rem' }}>Daten löschen</h3>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          Dies löscht deinen Account und ALLE Tierdaten dauerhaft. Diese Aktion kann nicht rückgängig gemacht werden.
        </p>
        <button className="btn btn-danger" onClick={() => setShowConfirmDelete(true)}>
          🗑 Account löschen
        </button>
      </div>

      {showConfirmDelete && (
        <div className="card" style={{ background: '#fee', borderLeft: '4px solid var(--color-danger)' }}>
          <h3 style={{ color: 'var(--color-danger)', marginTop: 0 }}>Account wirklich löschen?</h3>
          <p className="muted">Dies löscht:</p>
          <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
            <li>Dein Benutzerkonto</li>
            <li>Alle deine Tiere und Dokumente</li>
            <li>Alle Freigaben und Audit-Logs deines Accounts</li>
          </ul>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-danger" onClick={handleDelete}>
              Ja, endgültig löschen
            </button>
            <button className="btn btn-outline" onClick={() => setShowConfirmDelete(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
