import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMe, patchMe, deleteMe, requestVerification } from '../api/rest'
import { User, Shield, Stethoscope, Settings, Trash2, CheckCircle, Clock, AlertTriangle, Key } from 'lucide-react'

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

  if (loading) return <div className="container page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}><div className="spinner spinner-lg"></div></div>

  if (!profile) return <div className="container page"><div className="error-card"><p>Profil konnte nicht geladen werden</p></div></div>

  const roles = profile.roles ?? []
  const isVet = roles.includes('vet')
  const isVerified = profile.verified
  const verificationStatus = profile.verification_status

  return (
    <div className="container page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
        <User size={24} color="var(--primary-500)" />
        <h1 style={{ margin: 0 }}>Mein Profil</h1>
      </div>

      {error && <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}><p>{error}</p></div>}
      {success && <div className="card" style={{ background: 'var(--success-50)', borderColor: 'var(--success-500)', marginBottom: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)' }}><CheckCircle size={20} color="var(--success-600)" /><p style={{ margin: 0, color: 'var(--success-600)', fontWeight: 500 }}>{success}</p></div>}

      <div className="card animate-slide-up">
        <h2 style={{ fontSize: 'var(--font-size-lg)', marginTop: 0, marginBottom: '2px' }}>{profile.name}</h2>
        <p className="text-muted" style={{ margin: 0 }}>{profile.email}</p>

        <hr className="divider" style={{ margin: 'var(--space-4) 0' }} />

        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>Rollen</h3>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {roles.length > 0 ? (
            roles.map((r: string) => (
              <span key={r} className="badge badge-primary" style={{ display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'capitalize' }}>
                {r === 'user' ? <User size={12} /> : r === 'vet' ? <Stethoscope size={12} /> : r === 'authority' ? <Shield size={12} /> : <Settings size={12} />}
                {r}
              </span>
            ))
          ) : (
            <span className="text-muted">Benutzer</span>
          )}
        </div>

        {isVet && (
          <>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)' }}>Verifikation</h3>
            {isVerified ? (
              <p style={{ color: 'var(--success-600)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 0, fontWeight: 500 }}><CheckCircle size={18} /> Du bist als Tierarzt verifiziert</p>
            ) : verificationStatus === 'pending' ? (
              <p className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 0 }}><Clock size={18} /> Verifikationsantrag läuft (Wartet auf Admin-Genehmigung)</p>
            ) : (
              <button className="btn btn-primary" onClick={requestVerify} style={{ marginTop: 'var(--space-2)' }}>
                <CheckCircle size={16} /> Verifikation beantragen
              </button>
            )}
          </>
        )}

        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Key size={18} color="var(--primary-500)" /> Gemini Vision API
        </h3>
        <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
          Gib deinen persönlichen Gemini API-Schlüssel ein, um Dokumente mit deinem eigenen Kontingent zu analysieren.
          Ohne Schlüssel nutzen wir Tesseract (kostenloses OCR auf unserem Server).
        </p>
        
        {profile.has_gemini_token && (
          <p style={{ color: 'var(--success-600)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 500 }}><CheckCircle size={16} /> Gemini-Schlüssel gespeichert</p>
        )}
        
        {!profile.has_gemini_token && (
          <div className="form-group">
            <input
              className="form-input"
              type="password"
              placeholder="AIza..."
              value={geminiToken}
              onChange={e => setGeminiToken(e.target.value)}
            />
          </div>
        )}
        
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
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
        
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'oklch(96% 0.02 80)', borderRadius: 'var(--radius-md)' }}>
          <AlertTriangle size={16} color="var(--warning-600)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <p className="text-muted" style={{ fontSize: 'var(--font-size-xs)', margin: 0 }}>
            Durch Speichern eines Gemini-Schlüssels werden Dokumente zur Analyse an Google gesendet.
            Bitte Google Cloud Terms of Service & DSGVO beachten.
          </p>
        </div>

        <hr className="divider" style={{ margin: 'var(--space-6) 0' }} />

        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--danger-500)' }}>Daten löschen</h3>
        <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
          Dies löscht deinen Account und ALLE Tierdaten dauerhaft. Diese Aktion kann nicht rückgängig gemacht werden.
        </p>
        <button className="btn btn-danger" onClick={() => setShowConfirmDelete(true)}>
          <Trash2 size={16} /> Account löschen
        </button>
      </div>

      {showConfirmDelete && (
        <div className="card animate-slide-up" style={{ borderLeft: '4px solid var(--danger-500)', marginTop: 'var(--space-4)' }}>
          <h3 style={{ color: 'var(--danger-500)', marginTop: 0, marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <AlertTriangle size={20} /> Account wirklich löschen?
          </h3>
          <p className="text-muted" style={{ marginBottom: 'var(--space-2)' }}>Dies löscht:</p>
          <ul className="text-muted" style={{ marginLeft: 'var(--space-4)', marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
            <li>Dein Benutzerkonto</li>
            <li>Alle deine Tiere und Dokumente</li>
            <li>Alle Freigaben und Audit-Logs deines Accounts</li>
          </ul>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button className="btn btn-danger flex-1" onClick={handleDelete}>
              Ja, endgültig löschen
            </button>
            <button className="btn btn-ghost flex-1" onClick={() => setShowConfirmDelete(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
