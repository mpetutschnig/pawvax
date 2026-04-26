import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register } from '../api/rest'
import { PawPrint, LogIn, UserPlus } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
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
      navigate('/')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Fehler beim Anmelden')
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
          <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>PAW</h1>
          <p className="text-muted" style={{ margin: '4px 0 0 0' }}>Digitaler Tierimpfpass</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} required placeholder="Dein Name" />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">E-Mail</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="name@example.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Passwort</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="Mindestens 6 Zeichen" />
          </div>

          {error && <div className="error-card"><p>{error}</p></div>}

          <button className="btn btn-primary btn-full" type="submit" disabled={loading} style={{ marginTop: 'var(--space-2)' }}>
            {loading ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : mode === 'login' ? <><LogIn size={18} /> Einloggen</> : <><UserPlus size={18} /> Registrieren</>}
          </button>
        </form>

        <p className="text-muted" style={{ marginTop: 'var(--space-6)', textAlign: 'center', fontSize: 'var(--font-size-sm)' }}>
          {mode === 'login' ? 'Noch kein Konto? ' : 'Bereits registriert? '}
          <button
            style={{ background: 'none', border: 'none', color: 'var(--primary-600)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
          >
            {mode === 'login' ? 'Registrieren' : 'Einloggen'}
          </button>
        </p>
      </div>
    </div>
  )
}
