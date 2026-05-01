import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getMe, patchMe, deleteMe, requestVerification } from '../api/rest'
import { PageHeader } from '../components/PageHeader'
import { User, Shield, Stethoscope, Settings, Trash2, CheckCircle, Clock, AlertTriangle, Key } from 'lucide-react'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [geminiToken, setGeminiToken] = useState('')
  const [geminiError, setGeminiError] = useState('')
  const [geminiSuccess, setGeminiSuccess] = useState('')
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
      setError(t('profile.loadError'))
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const saveGeminiToken = async () => {
    if (!geminiToken) return
    setSaving(true)
    setGeminiError('')
    setGeminiSuccess('')
    try {
      // Validate key
      const validateRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview?key=${geminiToken}`)
      if (!validateRes.ok) {
        throw new Error(t('profile.geminiInvalid'))
      }

      await patchMe({ gemini_token: geminiToken || null })
      setGeminiSuccess(t('profile.geminiSuccess'))
      setGeminiToken('')
      setTimeout(() => {
        loadProfile()
        setGeminiSuccess('')
      }, 3000)
    } catch (err) {
      setGeminiError(err instanceof Error ? err.message : t('profile.geminiError'))
    } finally {
      setSaving(false)
    }
  }

  const clearGeminiToken = async () => {
    setSaving(true)
    try {
      await patchMe({ gemini_token: null })
      setSuccess(t('profile.deleteSuccess'))
      setGeminiToken('')
      setTimeout(() => {
        loadProfile()
        setSuccess(null)
      }, 1000)
    } catch (err) {
      setError(t('profile.saveError'))
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const requestVerify = async () => {
    try {
      await requestVerification()
      setSuccess(t('profile.requestVerificationSuccess'))
      setTimeout(() => {
        loadProfile()
        setSuccess(null)
      }, 2000)
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? t('common.error')
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
      setError(t('profile.deleteError'))
      console.error(err)
    }
  }

  if (loading) return <div className="container page" style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}><div className="spinner spinner-lg"></div></div>

  if (!profile) return <div className="container page"><div className="error-card"><p>{t('profile.loadError')}</p></div></div>

  const roles = profile.roles ?? []
  const isVet = roles.includes('vet')
  const isVerified = profile.verified
  const verificationStatus = profile.verification_status

  return (
    <div className="container page">
      <PageHeader title={t('profile.title')} showThemeToggle showLogout />

      {error && <div className="error-card" style={{ marginBottom: 'var(--space-4)' }}><p>{error}</p></div>}
      {success && <div className="card" style={{ background: 'var(--success-50)', borderColor: 'var(--success-500)', marginBottom: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)' }}><CheckCircle size={20} color="var(--success-600)" /><p style={{ margin: 0, color: 'var(--success-600)', fontWeight: 500 }}>{success}</p></div>}

      <div className="card animate-slide-up">
        <h2 style={{ fontSize: 'var(--font-size-lg)', marginTop: 0, marginBottom: '2px' }}>{profile.name}</h2>
        <p className="text-muted" style={{ margin: 0 }}>{profile.email}</p>

        <hr className="divider" style={{ margin: 'var(--space-4) 0' }} />

        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>{t('profile.roles')}</h3>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {roles.length > 0 ? (
            roles.map((r: string) => (
              <span key={r} className="badge badge-primary" style={{ display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'capitalize' }}>
                {r === 'user' ? <User size={12} /> : r === 'vet' ? <Stethoscope size={12} /> : r === 'authority' ? <Shield size={12} /> : <Settings size={12} />}
                {r}
              </span>
            ))
          ) : (
            <span className="text-muted">{t('profile.account')}</span>
          )}
        </div>

        {isVet && (
          <>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)' }}>{t('profile.verification')}</h3>
            {isVerified ? (
              <p style={{ color: 'var(--success-600)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 0, fontWeight: 500 }}><CheckCircle size={18} /> {t('profile.verified')}</p>
            ) : verificationStatus === 'pending' ? (
              <p className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 0 }}><Clock size={18} /> {t('profile.verificationPending')}</p>
            ) : (
              <button className="btn btn-primary" onClick={requestVerify} style={{ marginTop: 'var(--space-2)' }}>
                <CheckCircle size={16} /> {t('profile.requestVerification')}
              </button>
            )}
          </>
        )}

        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)' }}>{t('profile.language')}</h3>
        <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>{t('profile.languageDesc')}</p>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button
            className={`btn ${i18n.language === 'de' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => i18n.changeLanguage('de')}
          >
            {t('profile.german')}
          </button>
          <button
            className={`btn ${i18n.language === 'en' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => i18n.changeLanguage('en')}
          >
            {t('profile.english')}
          </button>
        </div>

        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginTop: 'var(--space-6)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Key size={18} color="var(--primary-500)" /> {t('profile.gemini')}
        </h3>
        <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
          {t('profile.geminiDesc')}
        </p>
        <p style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-500)', textDecoration: 'underline' }}>
            {t('profile.geminiCreateKey')}
          </a>
        </p>

        {profile.has_gemini_token && (
          <p style={{ color: 'var(--success-600)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 500 }}><CheckCircle size={16} /> {t('profile.geminiSaved')}</p>
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
              {saving ? t('profile.geminiChecking') : t('profile.geminiCheck')}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={clearGeminiToken} disabled={saving}>
              {saving ? t('profile.geminiDeleting') : t('profile.geminiDelete')}
            </button>
          )}
        </div>

        {geminiError && <div className="error-card" style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)' }}><p style={{ margin: 0 }}>{geminiError}</p></div>}
        {geminiSuccess && <div className="card" style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--success-50)', borderColor: 'var(--success-500)', display: 'flex', gap: 'var(--space-2)' }}><CheckCircle size={16} color="var(--success-600)" /><p style={{ margin: 0, color: 'var(--success-600)', fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>{geminiSuccess}</p></div>}

        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'oklch(96% 0.02 80)', borderRadius: 'var(--radius-md)' }}>
          <AlertTriangle size={16} color="var(--warning-600)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <p className="text-muted" style={{ fontSize: 'var(--font-size-xs)', margin: 0 }}>
            {t('profile.geminiWarning')}
          </p>
        </div>

        <hr className="divider" style={{ margin: 'var(--space-6) 0' }} />

        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--danger-500)' }}>{t('profile.deleteAccount')}</h3>
        <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
          {t('profile.deleteAccountDesc')}
        </p>
        <button className="btn btn-danger" onClick={() => setShowConfirmDelete(true)}>
          <Trash2 size={16} /> {t('profile.deleteAccountBtn')}
        </button>
      </div>

      {showConfirmDelete && (
        <div className="card animate-slide-up" style={{ borderLeft: '4px solid var(--danger-500)', marginTop: 'var(--space-4)' }}>
          <h3 style={{ color: 'var(--danger-500)', marginTop: 0, marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <AlertTriangle size={20} /> {t('profile.deleteConfirm')}
          </h3>
          <p className="text-muted" style={{ marginBottom: 'var(--space-2)' }}>{t('profile.deleteConfirmDesc')}</p>
          <ul className="text-muted" style={{ marginLeft: 'var(--space-4)', marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
            <li>{t('profile.deleteList1')}</li>
            <li>{t('profile.deleteList2')}</li>
            <li>{t('profile.deleteList3')}</li>
          </ul>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button className="btn btn-danger flex-1" onClick={handleDelete}>
              {t('profile.deleteYes')}
            </button>
            <button className="btn btn-ghost flex-1" onClick={() => setShowConfirmDelete(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
