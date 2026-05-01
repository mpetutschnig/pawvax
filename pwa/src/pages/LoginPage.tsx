import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { login, register } from '../api/rest'
import { PawPrint, LogIn, UserPlus, ScanLine } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = mode === 'login'
        ? await login(email, password)
        : await register(name, email, password)
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('role', res.data.account.role || 'user')
      localStorage.setItem('roles', JSON.stringify(res.data.account.roles ?? [res.data.account.role || 'user']))
      localStorage.setItem('verified', String(res.data.account.verified || 0))
      navigate(mode === 'register' ? '/welcome' : '/')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? t('auth.loginError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container page" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100dvh', padding: 'var(--space-4)' }}>
      <div className="card animate-slide-up" style={{ padding: 'var(--space-8) var(--space-6)', maxWidth: '400px', margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: 'var(--primary-50)', marginBottom: 'var(--space-4)' }}>
            <PawPrint size={32} color="var(--primary-500)" />
          </div>
          <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>{t('app.title')}</h1>
          <p className="text-muted" style={{ margin: '4px 0 0 0' }}>{t('app.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">{t('auth.name')}</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} required placeholder={t('auth.name')} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">{t('auth.email')}</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="name@example.com" />
          </div>
          <div className="form-group">
            <label className="form-label">{t('auth.password')}</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder={t('auth.passwordMin')} />
          </div>

          {error && <div className="error-card"><p>{error}</p></div>}

          <button className="btn btn-primary btn-full" type="submit" disabled={loading} style={{ marginTop: 'var(--space-2)' }}>
            {loading ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : mode === 'login' ? <><LogIn size={18} /> {t('auth.login')}</> : <><UserPlus size={18} /> {t('auth.register')}</>}
          </button>
        </form>

        <p className="text-muted" style={{ marginTop: 'var(--space-6)', textAlign: 'center', fontSize: 'var(--font-size-sm)' }}>
          {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}
          <button
            style={{ background: 'none', border: 'none', color: 'var(--primary-600)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
          >
            {mode === 'login' ? t('auth.register') : t('auth.login')}
          </button>
        </p>

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
