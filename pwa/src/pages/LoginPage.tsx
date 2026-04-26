import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register } from '../api/rest'

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
    <div className="container" style={{ paddingTop: '3rem' }}>
      <div className="card">
        <h1>🐾 PAW</h1>
        <p className="muted" style={{ marginBottom: '1.5rem' }}>Digitaler Tierimpfpass</p>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <label>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} required placeholder="Dein Name" />
            </>
          )}
          <label>E-Mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="name@example.com" />
          <label>Passwort</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="Mindestens 6 Zeichen" />

          {error && <p className="error">{error}</p>}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: '.5rem' }}>
            {loading ? 'Bitte warten...' : mode === 'login' ? 'Einloggen' : 'Registrieren'}
          </button>
        </form>

        <p className="muted" style={{ marginTop: '1rem', textAlign: 'center' }}>
          {mode === 'login' ? 'Noch kein Konto? ' : 'Bereits registriert? '}
          <button
            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
          >
            {mode === 'login' ? 'Registrieren' : 'Einloggen'}
          </button>
        </p>
      </div>
    </div>
  )
}
