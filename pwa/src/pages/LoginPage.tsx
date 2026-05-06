import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { login, register, requestPasswordReset, resetPassword, verifyEmail } from '../api/rest'
import { PawPrint, LogIn, UserPlus, ScanLine } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t } = useTranslation()
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [logoData, setLogoData] = useState<string>('')
  const [tokenActionInProgress, setTokenActionInProgress] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [serverUrl, setServerUrl] = useState<string>(() => {
    return localStorage.getItem('paw_server_url') || 'https://vetsucht.oxs.at'
  })

  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(data => { if (data.logo_data) setLogoData(data.logo_data) }).catch(() => {})
  }, [])

  useEffect(() => {
    const verifyToken = searchParams.get('verifyToken')
    const resetToken = searchParams.get('resetToken')

    if (resetToken) {
      setMode('reset')
      setInfo(t('auth.resetReady'))
      return
    }

    if (!verifyToken) return
    const verificationToken = verifyToken

    let cancelled = false

    async function confirmEmail() {
      setTokenActionInProgress(true)
      setError(null)
      setInfo(null)
      try {
        const res = await verifyEmail(verificationToken)
        if (cancelled) return
        setInfo(res.data.message || t('auth.verifySuccess'))
        setMode('login')
        setSearchParams({}, { replace: true })
      } catch (err: unknown) {
        if (cancelled) return
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        setError(msg ?? t('auth.verifyError'))
      } finally {
        if (!cancelled) setTokenActionInProgress(false)
      }
    }

    confirmEmail()
    return () => { cancelled = true }
  }, [searchParams, setSearchParams, t])

  function resetFormState(nextMode: 'login' | 'register' | 'forgot' | 'reset') {
    setMode(nextMode)
    setError(null)
    setInfo(null)
    setPassword('')
    setConfirmPassword('')
  }

  function handleServerUrlChange(newUrl: string) {
    setServerUrl(newUrl)
    localStorage.setItem('paw_server_url', newUrl)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        const res = await login(email, password)
        localStorage.setItem('token', res.data.token)
        localStorage.setItem('role', res.data.account.role || 'user')
        localStorage.setItem('verified', String(res.data.account.verified || 0))
        navigate('/reminders')
      } else if (mode === 'register') {
        const res = await register(name, email, password, confirmPassword)
        setInfo(res.data.message || t('auth.registerSuccess'))
        setPassword('')
        setConfirmPassword('')
        setMode('login')
      } else if (mode === 'forgot') {
        const res = await requestPasswordReset(email)
        setInfo(res.data.message || t('auth.resetRequestSuccess'))
        setMode('login')
      } else {
        const resetToken = searchParams.get('resetToken')
        if (!resetToken) {
          throw new Error(t('auth.resetTokenMissing'))
        }
        const res = await resetPassword(resetToken, password, confirmPassword)
        setInfo(res.data.message || t('auth.resetSuccess'))
        setSearchParams({}, { replace: true })
        setMode('login')
        setPassword('')
        setConfirmPassword('')
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? t(mode === 'login' ? 'auth.loginError' : mode === 'register' ? 'auth.registerError' : mode === 'forgot' ? 'auth.resetRequestError' : 'auth.resetError'))
    } finally {
      setLoading(false)
    }
  }

  const isRegister = mode === 'register'
  const isForgot = mode === 'forgot'
  const isReset = mode === 'reset'
  const title = isForgot
    ? t('auth.forgotPassword')
    : isReset
      ? t('auth.resetPassword')
      : isRegister
        ? t('auth.register')
        : t('auth.login')

  return (
    <div className="container page" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100dvh', padding: 'var(--space-4)' }}>
      <div className="card animate-slide-up" style={{ padding: 'var(--space-8) var(--space-6)', maxWidth: '400px', margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          {logoData ? (
            <img src={logoData} alt="Logo" style={{ maxHeight: '64px', objectFit: 'contain', marginBottom: 'var(--space-4)' }} />
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: 'var(--primary-50)', marginBottom: 'var(--space-4)' }}>
              <PawPrint size={32} color="var(--primary-500)" />
            </div>
          )}
          <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>{t('app.title')}</h1>
          <p className="text-muted" style={{ margin: '4px 0 0 0' }}>{t('app.subtitle')}</p>
        </div>

        <button
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--primary-600)',
            cursor: 'pointer',
            fontWeight: 600,
            padding: '0 0 var(--space-2) 0',
            textDecoration: 'underline',
            fontSize: 'var(--font-size-xs)',
            marginBottom: 'var(--space-3)',
            width: '100%',
            textAlign: 'right'
          }}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? '✕' : '⚙️'} {showAdvanced ? 'Advanced' : 'Advanced'}
        </button>

        {showAdvanced && (
          <div className="form-group" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
            <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>Server URL</label>
            <input
              className="form-input"
              type="url"
              value={serverUrl}
              onChange={e => handleServerUrlChange(e.target.value)}
              placeholder="https://vetsucht.oxs.at"
              style={{ fontSize: 'var(--font-size-xs)' }}
            />
            <p className="text-muted" style={{ margin: 'var(--space-2) 0 0 0', fontSize: 'var(--font-size-xs)' }}>
              Tragen Sie Ihre PAW-Serveradresse ein. Standard: https://vetsucht.oxs.at
            </p>
          </div>
        )}

        <h2 style={{ marginTop: 0, marginBottom: 'var(--space-4)', textAlign: 'center', fontSize: 'var(--font-size-lg)' }}>{title}</h2>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {isRegister && (
            <div className="form-group">
              <label className="form-label">{t('auth.name')}</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} required placeholder={t('auth.name')} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">{t('auth.email')}</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="name@example.com" />
          </div>

          {!isForgot && (
            <div className="form-group">
              <label className="form-label">{t('auth.password')}</label>
              <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder={t('auth.passwordMin')} />
            </div>
          )}

          {(isRegister || isReset) && (
            <div className="form-group">
              <label className="form-label">{t('auth.confirmPassword')}</label>
              <input className="form-input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} placeholder={t('auth.confirmPassword')} />
            </div>
          )}

          {info && <div className="success-card"><p>{info}</p></div>}
          {error && <div className="error-card"><p>{error}</p></div>}

          <button className="btn btn-primary btn-full" type="submit" disabled={loading} style={{ marginTop: 'var(--space-2)' }}>
            {loading || tokenActionInProgress ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : isForgot ? <>{t('auth.sendResetLink')}</> : isReset ? <>{t('auth.resetPassword')}</> : mode === 'login' ? <><LogIn size={18} /> {t('auth.login')}</> : <><UserPlus size={18} /> {t('auth.register')}</>}
          </button>
        </form>

        {!isForgot && !isReset && (
          <p className="text-muted" style={{ marginTop: 'var(--space-6)', textAlign: 'center', fontSize: 'var(--font-size-sm)' }}>
            {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}
            <button
              style={{ background: 'none', border: 'none', color: 'var(--primary-600)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
              onClick={() => { resetFormState(mode === 'login' ? 'register' : 'login') }}
            >
              {mode === 'login' ? t('auth.register') : t('auth.login')}
            </button>
          </p>
        )}

        {mode === 'login' && (
          <p style={{ textAlign: 'center', marginTop: 0 }}>
            <button
              style={{ background: 'none', border: 'none', color: 'var(--primary-600)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
              onClick={() => resetFormState('forgot')}
            >
              {t('auth.forgotPassword')}
            </button>
          </p>
        )}

        {(isForgot || isReset) && (
          <p style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
            <button
              style={{ background: 'none', border: 'none', color: 'var(--primary-600)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
              onClick={() => {
                setSearchParams({}, { replace: true })
                resetFormState('login')
              }}
            >
              {t('auth.backToLogin')}
            </button>
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', margin: 'var(--space-4) 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span className="text-muted" style={{ fontSize: 'var(--font-size-xs)' }}>{t('common.or')}</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <button
          className="btn btn-ghost btn-full"
          onClick={() => navigate('/public-scan')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}
        >
          <ScanLine size={18} /> {t('auth.scanWithoutLogin')}
        </button>
      </div>
    </div>
  )
}
