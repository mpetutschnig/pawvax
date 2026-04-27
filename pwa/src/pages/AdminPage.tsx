import { useEffect, useState } from 'react'
import {
  adminGetStats, adminGetAccounts, adminGetAnimals, adminGetPendingVerifications,
  adminVerifyAccount, adminPatchAccount, adminGetAuditLog
} from '../api/rest'
import { PawPrint, LogOut, LayoutDashboard, Users, Cat, ShieldCheck, FileClock, CheckCircle, XCircle, Menu, X } from 'lucide-react'

type Section = 'overview' | 'accounts' | 'animals' | 'verifications' | 'audit'

interface Account {
  id: string; name: string; email: string; role: string; verified: number; verification_status?: string; created_at: string
}

interface Animal {
  id: string; name: string; species: string; breed?: string; birthdate?: string; owner_name: string; owner_email: string
}

interface Verification {
  id: string; name: string; email: string; role: string; verification_status: string; created_at: string
}

interface AuditEntry {
  id: string; account_id: string | null; account_role: string | null; action: string; resource: string; resource_id: string; created_at: string
}

interface Stats {
  accounts: number; animals: number; documents: number; auditEntries: number
}

interface AuditLog {
  rows: AuditEntry[]; page: number; pages: number; total: number
}

export default function AdminPage() {
  const [section, setSection] = useState<Section>('overview')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Data
  const [stats, setStats] = useState<Stats | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [animals, setAnimals] = useState<Animal[]>([])
  const [verifications, setVerifications] = useState<Verification[]>([])
  const [auditLog, setAuditLog] = useState<AuditLog | null>(null)
  const [auditPage, setAuditPage] = useState(1)

  useEffect(() => {
    loadData()
  }, [section, auditPage])

  const loadData = async () => {
    setLoading(true)
    try {
      if (section === 'overview') {
        const res = await adminGetStats()
        setStats(res.data)
      } else if (section === 'accounts') {
        const res = await adminGetAccounts()
        setAccounts(res.data)
      } else if (section === 'animals') {
        const res = await adminGetAnimals()
        setAnimals(res.data)
      } else if (section === 'verifications') {
        const res = await adminGetPendingVerifications()
        setVerifications(res.data)
      } else if (section === 'audit') {
        const res = await adminGetAuditLog({ page: auditPage })
        setAuditLog(res.data)
      }
    } catch (err) {
      console.error('Admin load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const selectedAccount = selectedId ? accounts.find(a => a.id === selectedId) : null
  const selectedAnimal = selectedId ? animals.find(a => a.id === selectedId) : null

  const adminName = 'Admin User' // Ideally from Auth context

  return (
    <div className={`admin-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      {/* Header */}
      <header className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="btn btn-ghost btn-icon admin-hamburger"
            title="Toggle menu"
            style={{ display: 'none' }}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="admin-header-brand">
            <PawPrint size={20} strokeWidth={1.8} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Vax.pet Admin
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'oklch(80% 0.04 240)' }}>
            {adminName}
          </span>
          <button
            onClick={() => {
              localStorage.removeItem('token')
              localStorage.removeItem('role')
              localStorage.removeItem('roles')
              window.location.href = '/login'
            }}
            className="btn btn-ghost btn-icon"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <nav className="admin-sidebar" role="navigation" aria-label="Admin Navigation">
        {[
          { id: 'overview', label: 'Übersicht', icon: <LayoutDashboard size={18} /> },
          { id: 'accounts', label: 'Accounts', icon: <Users size={18} /> },
          { id: 'animals', label: 'Tiere', icon: <Cat size={18} /> },
          { id: 'verifications', label: 'Verifikationen', icon: <ShieldCheck size={18} /> },
          { id: 'audit', label: 'Audit-Log', icon: <FileClock size={18} /> }
        ].map(item => (
          <a
            key={item.id}
            onClick={() => {
              setSection(item.id as Section)
              setSelectedId(null)
              setAuditPage(1)
              setSidebarOpen(false)
            }}
            className="admin-sidebar-item"
            aria-current={section === item.id ? 'page' : undefined}
            style={{ cursor: 'pointer' }}
          >
            {item.icon}
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      {/* Main Content */}
      <main className="admin-main" role="main">
        {loading && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-8)' }}><div className="spinner spinner-lg"></div></div>}

        {/* Overview */}
        {section === 'overview' && stats && !loading && (
          <div className="animate-fade-in">
            <h1 style={{ marginBottom: 'var(--space-6)' }}>Systemübersicht</h1>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
              {[
                { label: 'Registered Accounts', value: stats.accounts, trend: '+12%', up: true },
                { label: 'Registered Animals', value: stats.animals, trend: '+5%', up: true },
                { label: 'Scanned Documents', value: stats.documents, trend: '+18%', up: true },
                { label: 'Audit Entries', value: stats.auditEntries, trend: '+2%', up: true },
              ].map(stat => (
                <div key={stat.label} className="card card-sm" style={{ marginBottom: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1 }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>
                    {stat.label}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: stat.up ? 'var(--success-600)' : 'var(--danger-500)', marginTop: 6 }}>
                    {stat.up ? '↑' : '↓'} {stat.trend}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Accounts Table */}
        {section === 'accounts' && !loading && (
          <div className="animate-fade-in">
            <h1 style={{ marginBottom: 'var(--space-6)' }}>Account-Verwaltung</h1>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>E-Mail</th>
                    <th>Rollen</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(acc => (
                    <tr key={acc.id} onClick={() => setSelectedId(acc.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 500 }}>{acc.name}</td>
                      <td className="text-muted">{acc.email}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {acc.role.split(',').map(r => (
                            <span key={r} className="badge badge-info" style={{ fontSize: '10px', padding: '2px 6px' }}>{r.trim()}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        {acc.verified ? <span className="badge badge-success">Verifiziert</span> : <span className="badge badge-warning">Unverifiziert</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Animals Table */}
        {section === 'animals' && !loading && (
          <div className="animate-fade-in">
            <h1 style={{ marginBottom: 'var(--space-6)' }}>Tiere im System</h1>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Art</th>
                    <th>Besitzer</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {animals.map(animal => (
                    <tr key={animal.id} onClick={() => setSelectedId(animal.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 500 }}>{animal.name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {animal.species === 'cat' ? <Cat size={14} color="var(--text-tertiary)" /> : <PawPrint size={14} color="var(--text-tertiary)" />}
                          <span className="text-muted" style={{ textTransform: 'capitalize' }}>{animal.species}</span>
                        </div>
                      </td>
                      <td>{animal.owner_name}</td>
                      <td className="text-muted">{animal.owner_email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Verifications */}
        {section === 'verifications' && !loading && (
          <div className="animate-fade-in">
            <h1 style={{ marginBottom: 'var(--space-6)' }}>Vet-Verifikationen</h1>
            {verifications.length === 0 ? (
              <div className="card text-center" style={{ padding: 'var(--space-8)' }}>
                <ShieldCheck size={48} color="var(--primary-200)" style={{ margin: '0 auto var(--space-4)' }} />
                <p className="text-muted">Keine ausstehenden Verifikationen</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
                {verifications.map(v => (
                  <div key={v.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)' }}>
                      <div>
                        <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--font-size-base)', margin: '0 0 2px 0' }}>{v.name}</p>
                        <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>{v.email}</p>
                      </div>
                      <span className="badge badge-warning">Pending</span>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                      <button
                        className="btn btn-primary flex-1"
                        onClick={() => adminVerifyAccount(v.id, true).then(() => loadData())}
                        style={{ padding: '8px 0' }}
                      >
                        <CheckCircle size={16} /> Genehmigen
                      </button>
                      <button
                        className="btn btn-danger flex-1"
                        onClick={() => adminVerifyAccount(v.id, false).then(() => loadData())}
                        style={{ padding: '8px 0' }}
                      >
                        <XCircle size={16} /> Ablehnen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Audit Log */}
        {section === 'audit' && auditLog && !loading && (
          <div className="animate-fade-in">
            <h1 style={{ marginBottom: 'var(--space-6)' }}>Audit-Log</h1>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Aktion</th>
                    <th>Resource</th>
                    <th>Account Role</th>
                    <th>Zeitstempel</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.rows.map(entry => (
                    <tr key={entry.id}>
                      <td><code style={{ fontSize: '11px', background: 'var(--surface)', padding: '2px 6px', borderRadius: '4px' }}>{entry.action}</code></td>
                      <td style={{ fontSize: '13px' }}>{entry.resource}</td>
                      <td>
                        {entry.account_role ? (
                          <span className="badge badge-info" style={{ fontSize: '10px' }}>{entry.account_role}</span>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="text-tertiary" style={{ fontSize: '12px' }}>{new Date(entry.created_at).toLocaleString('de-AT')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', marginTop: 'var(--space-6)', alignItems: 'center' }}>
              <button
                className="btn btn-outline"
                onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                disabled={auditPage === 1}
              >
                Zurück
              </button>
              <span className="text-muted" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                {auditPage} / {auditLog.pages}
              </span>
              <button
                className="btn btn-outline"
                onClick={() => setAuditPage(p => p + 1)}
                disabled={auditPage === auditLog.pages}
              >
                Weiter
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Detail Panel */}
      {selectedAccount && (
        <div className="admin-detail-panel animate-slide-up" style={{ boxShadow: 'var(--shadow-xl)' }}>
          <h2 style={{ marginBottom: '2px' }}>{selectedAccount.name}</h2>
          <p className="text-muted" style={{ margin: 0, marginBottom: 'var(--space-4)' }}>{selectedAccount.email}</p>

          <hr className="divider" style={{ margin: 'var(--space-4) 0' }} />

          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>Rollen</h3>
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {['user', 'vet', 'authority', 'admin'].map(r => (
              <label key={r} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', cursor: 'pointer', padding: 'var(--space-2) 0' }}>
                <input
                  type="checkbox"
                  style={{ width: 16, height: 16, accentColor: 'var(--primary-500)' }}
                  checked={selectedAccount.role.includes(r)}
                  onChange={e => {
                    const roles = selectedAccount.role.split(',').map(x => x.trim())
                    const next = e.target.checked ? [...roles, r] : roles.filter(x => x !== r)
                    adminPatchAccount(selectedAccount.id, { role: next.join(',') }).then(() => loadData())
                  }}
                />
                <span style={{ fontSize: 'var(--font-size-sm)', textTransform: 'capitalize' }}>{r}</span>
              </label>
            ))}
          </div>

          <hr className="divider" style={{ margin: 'var(--space-4) 0' }} />

          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>Verifizierung</h3>
          <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', cursor: 'pointer', padding: 'var(--space-2) 0' }}>
            <input
              type="checkbox"
              style={{ width: 16, height: 16, accentColor: 'var(--primary-500)' }}
              checked={!!selectedAccount.verified}
              onChange={e => adminPatchAccount(selectedAccount.id, { verified: e.target.checked }).then(() => loadData())}
            />
            <span style={{ fontSize: 'var(--font-size-sm)' }}>Account ist verifiziert</span>
          </label>

          <button
            className="btn btn-outline btn-full"
            onClick={() => setSelectedId(null)}
            style={{ marginTop: 'var(--space-6)' }}
          >
            Schließen
          </button>
        </div>
      )}

      {selectedAnimal && (
        <div className="admin-detail-panel animate-slide-up" style={{ boxShadow: 'var(--shadow-xl)' }}>
          <h2 style={{ marginBottom: '2px' }}>{selectedAnimal.name}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-2)' }}>
            {selectedAnimal.species === 'cat' ? <Cat size={14} color="var(--text-tertiary)" /> : <PawPrint size={14} color="var(--text-tertiary)" />}
            <span className="text-muted" style={{ textTransform: 'capitalize' }}>{selectedAnimal.species}</span>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <div>
              <p className="text-tertiary" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px 0' }}>Rasse</p>
              <p style={{ margin: 0, fontWeight: 500 }}>{selectedAnimal.breed || '—'}</p>
            </div>
            <div>
              <p className="text-tertiary" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px 0' }}>Geburtsdatum</p>
              <p style={{ margin: 0, fontWeight: 500 }}>{selectedAnimal.birthdate || '—'}</p>
            </div>
          </div>

          <hr className="divider" style={{ margin: 'var(--space-6) 0' }} />

          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>Besitzer Information</h3>
          <div className="card card-sm" style={{ background: 'var(--surface)', border: 'none' }}>
            <p style={{ margin: '0 0 4px 0', fontWeight: 600 }}>{selectedAnimal.owner_name}</p>
            <p className="text-muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>{selectedAnimal.owner_email}</p>
          </div>

          <button
            className="btn btn-outline btn-full"
            onClick={() => setSelectedId(null)}
            style={{ marginTop: 'var(--space-6)' }}
          >
            Schließen
          </button>
        </div>
      )}
    </div>
  )
}
